import { prisma } from '@/lib/prisma';
import {
  buildTenantStatus,
  type TenantStatus,
  type ServiceKey,
  KNOWN_SERVICES,
} from '@/lib/tenant-status';

/**
 * Helpers pour resoudre le tenant du user loggue et construire son snapshot.
 *
 * Aujourd'hui, un user est suppose appartenir a un seul tenant via Membership
 * (en pratique Robert est OWNER du tenant "veridian"). Si un user appartient
 * a plusieurs tenants, on prend le premier par date de membership — on fera
 * un selecteur plus tard quand Robert aura plus d'un tenant personnel.
 */

/**
 * Options pour `getUserTenantStatus` — permet l'impersonation cote
 * superadmin : Robert consulte /dashboard?asTenant=<slug> et voit le
 * dashboard du client comme si c'etait le sien.
 *
 * Contrat :
 *   - `asTenantSlug` est applique UNIQUEMENT si `requesterRole === 'SUPERADMIN'`.
 *     Toute autre valeur (MEMBER, null, undefined) ignore `asTenantSlug`
 *     et retombe sur le tenant du user par email. C'est le seul choke point
 *     d'autorisation — pas de test supplementaire a faire cote caller.
 *   - La signature reste retrocompatible : `getUserTenantStatus(email)` sans
 *     options fonctionne comme avant (appels existants dans layout/page).
 */
export interface GetUserTenantStatusOptions {
  asTenantSlug?: string | null;
  requesterRole?: string | null;
}

/**
 * Resout le tenant principal d'un user par son email (Auth.js v5 stocke
 * l'email sur la session). Renvoie null si pas de tenant attache.
 *
 * Si `options.asTenantSlug` est fourni ET que `options.requesterRole` est
 * `SUPERADMIN`, resout ce tenant (par slug) au lieu du tenant du user —
 * c'est le mode impersonation pour Robert depuis /admin.
 */
export async function getUserTenantStatus(
  email: string,
  options: GetUserTenantStatusOptions = {},
): Promise<TenantStatus | null> {
  const canImpersonate =
    options.requesterRole === 'SUPERADMIN' && !!options.asTenantSlug;

  if (canImpersonate) {
    // Resolution directe par slug : on bypass la relation via memberships
    // car Robert n'est pas forcement membre du tenant qu'il impersonne.
    const tenant = await prisma.tenant.findUnique({
      where: { slug: options.asTenantSlug! },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true } } },
        },
        sites: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            gscProperty: {
              select: { propertyUrl: true, lastSyncAt: true },
            },
          },
        },
      },
    });
    if (!tenant || tenant.deletedAt) return null;
    // Charger le count push subscriptions pour que le service 'push'
    // soit correctement detecte comme actif/inactif.
    const pushCount = await prisma.pushSubscription.count({
      where: { tenantId: tenant.id },
    });
    return buildTenantStatus(tenant, undefined, pushCount);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        orderBy: { createdAt: 'asc' },
        include: {
          tenant: {
            include: {
              memberships: {
                include: { user: { select: { id: true, email: true } } },
              },
              sites: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'asc' },
                include: {
                  gscProperty: {
                    select: { propertyUrl: true, lastSyncAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;
  const first = user.memberships.find((m) => m.tenant.deletedAt === null);
  if (!first) return null;

  const pushCount = await prisma.pushSubscription.count({
    where: { tenantId: first.tenant.id },
  });
  return buildTenantStatus(first.tenant, undefined, pushCount);
}

/**
 * Score Veridian : agregation simple et lisible.
 * Chaque service actif vaut 20 points (soit 120 max si les 6 services sont
 * branches). On cap a 100 pour un affichage propre. C'est arbitraire mais
 * coherent : c'est un proxy de "combien Robert a deja branche pour vous".
 */
export function computeScore(activeServices: ServiceKey[]): {
  score: number;
  max: number;
  active: number;
  total: number;
} {
  const POINTS_PER_SERVICE = 20;
  const total = KNOWN_SERVICES.length;
  const active = activeServices.length;
  const raw = active * POINTS_PER_SERVICE;
  // On cap a 100 pour que l'UI reste lisible meme si plus de 5 services.
  const score = Math.min(100, raw);
  return { score, max: 100, active, total };
}

/**
 * Retourne un label qualitatif en fonction du score (pour l'UI).
 */
export function scoreLabel(score: number): {
  label: string;
  tone: 'great' | 'good' | 'fair' | 'low';
} {
  if (score >= 80) return { label: 'Excellent', tone: 'great' };
  if (score >= 60) return { label: 'Tres bon', tone: 'good' };
  if (score >= 40) return { label: 'Correct', tone: 'fair' };
  return { label: 'A developper', tone: 'low' };
}

/**
 * Mapping route → service pour le guard des pages. Chaque page du dashboard
 * qui correspond a un service a une entree ici. La home `/dashboard` n'a PAS
 * d'entree volontairement : elle est toujours accessible (elle est la home
 * gamifiee qui mixe blocs actifs et shadow marketing).
 *
 * Utilise par :
 *   - la sidebar pour afficher l'icone lock sur les items des services inactifs
 *   - le layout pour calculer la liste des hrefs lockees a passer a la sidebar
 *   - les pages guardees elles-memes (indirect, via isServiceActive)
 */
export const ROUTE_TO_SERVICE: Record<string, ServiceKey> = {
  '/dashboard/forms': 'forms',
  '/dashboard/calls': 'calls',
  '/dashboard/gsc': 'gsc',
  '/dashboard/push': 'push',
  // futurs :
  // '/dashboard/ads': 'ads',
  // '/dashboard/pagespeed': 'pagespeed',
};

/**
 * Renvoie true si le service est dans la liste des services actifs du tenant.
 * Fonction triviale mais extraite pour etre testable et reutilisable depuis
 * les server components (pages guardees + layout sidebar).
 */
export function isServiceActive(
  activeServices: ServiceKey[] | readonly ServiceKey[],
  service: ServiceKey,
): boolean {
  return activeServices.includes(service);
}

/**
 * Calcule la liste des hrefs de routes lockees en fonction des services
 * actifs du tenant. Une route est lockee si :
 *   - elle a une entree dans ROUTE_TO_SERVICE
 *   - ET son service associe n'est PAS dans activeServices
 *
 * Si `activeServices` est null/undefined (erreur DB ou tenant non resolu),
 * on considere TOUTES les routes comme lockees — safer fallback pour que
 * l'user ne se retrouve pas avec une page qui crash en DB error.
 */
export function computeLockedHrefs(
  activeServices: ServiceKey[] | readonly ServiceKey[] | null | undefined,
): string[] {
  if (!activeServices) return Object.keys(ROUTE_TO_SERVICE);
  return Object.entries(ROUTE_TO_SERVICE)
    .filter(([, service]) => !activeServices.includes(service))
    .map(([href]) => href);
}

/**
 * Aggregates les activeServices de tous les sites d'un tenant. Un service
 * est considere comme actif au niveau tenant si au moins UN site le branche.
 * C'est le bon niveau d'agregation pour la sidebar (qui est tenant-wide) et
 * pour les pages lockees (qui listent toute la data, pas un site specifique).
 */
export function aggregateActiveServices(
  status: TenantStatus | null,
): ServiceKey[] {
  if (!status) return [];
  const set = new Set<ServiceKey>();
  for (const site of status.sites) {
    for (const s of site.activeServices) set.add(s);
  }
  // On garde l'ordre canonique KNOWN_SERVICES pour que le resultat soit
  // deterministe (utile dans les tests et pour la sidebar).
  return KNOWN_SERVICES.filter((s) => set.has(s));
}
