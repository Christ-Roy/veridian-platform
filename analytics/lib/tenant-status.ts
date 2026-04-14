import { prisma } from '@/lib/prisma';

/**
 * Construit le snapshot d'etat d'un tenant pour le skill analytics-provision.
 *
 * La logique est isolee dans cette lib (pas dans la route handler) pour :
 *   - pouvoir la tester en unit sans Next runtime
 *   - pouvoir la reutiliser depuis un script CLI si besoin plus tard
 *   - garder la route handler courte et lisible
 */

// Les services qu'on sait detecter automatiquement a partir de la data en base.
// L'ordre ici = l'ordre d'affichage dans le dashboard client gamifie.
export const KNOWN_SERVICES = [
  'pageviews',
  'forms',
  'calls',
  'gsc',
  'ads',
  'pagespeed',
  'push',
] as const;

export type ServiceKey = (typeof KNOWN_SERVICES)[number];

export interface SiteStatus {
  id: string;
  domain: string;
  name: string;
  siteKey: string;
  createdAt: Date;
  gsc: {
    propertyUrl: string;
    lastSyncAt: Date | null;
  } | null;
  counts28d: {
    pageviews: number;
    formSubmissions: number;
    sipCalls: number;
    ctaClicks: number;
    gscRows: number;
    gscClicks: number;
    gscImpressions: number;
  };
  activeServices: ServiceKey[];
  inactiveServices: ServiceKey[];
  trackerSnippet: string;
  nextSteps: string[];
}

export interface TenantStatus {
  tenant: {
    id: string;
    slug: string;
    name: string;
    createdAt: Date;
    members: { id: string; email: string; role: string }[];
  };
  sites: SiteStatus[];
  pushSubscriptionsCount: number;
  summary: {
    sitesCount: number;
    totalActiveServices: number;
    totalInactiveServices: number;
    hasAnyIngestedData: boolean;
  };
}

// Shape minimaliste attendue en entree par buildTenantStatus. On s'en tient
// aux champs qu'on consomme pour pouvoir mocker facilement dans les tests.
export interface TenantInput {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  memberships: {
    role: string;
    user: { id: string; email: string };
  }[];
  sites: {
    id: string;
    domain: string;
    name: string;
    siteKey: string;
    createdAt: Date;
    gscProperty: {
      propertyUrl: string;
      lastSyncAt: Date | null;
    } | null;
  }[];
}

/**
 * Retourne la base URL publique a utiliser pour generer le snippet tracker.
 *
 * Priorite :
 *   1. PUBLIC_TRACKER_URL (env, format "https://analytics.app.veridian.site")
 *   2. Origin de la requete entrante (utile en dev)
 *   3. Fallback hardcode "https://analytics.app.veridian.site" (prod cible)
 */
function resolveTrackerBaseUrl(req?: Request): string {
  const env = process.env.PUBLIC_TRACKER_URL;
  if (env) return env.replace(/\/$/, '');

  if (req) {
    try {
      const url = new URL(req.url);
      return `${url.protocol}//${url.host}`;
    } catch {
      // ignore
    }
  }

  return 'https://analytics.app.veridian.site';
}

/**
 * Genere le snippet HTML pret a coller dans le <head> du site client.
 * Le script se charge async, cree un pageview au load, et intercepte les
 * form submits si l'attribut data-veridian-track="auto" est present.
 */
export function buildTrackerSnippet(siteKey: string, baseUrl: string): string {
  return `<script src="${baseUrl}/tracker.js" data-site-key="${siteKey}" data-veridian-track="auto" async></script>`;
}

/**
 * Determine les services actifs (data ingeree) vs inactifs (a activer) pour
 * un site donne. La liste des inactifs alimente le shadow marketing cote UI
 * client : chaque service absent = un bloc "Debloquer ce service".
 */
export function detectServices(counts: {
  pageviews: number;
  formSubmissions: number;
  sipCalls: number;
  ctaClicks?: number;
  gscRows: number;
  hasGscProperty: boolean;
  pushSubscriptions?: number;
}): { active: ServiceKey[]; inactive: ServiceKey[] } {
  const active: ServiceKey[] = [];

  if (counts.pageviews > 0) active.push('pageviews');
  if (counts.formSubmissions > 0) active.push('forms');
  // Le service "calls" est actif si on a des SipCalls OU des clics CTA
  // tel: (intentions d'appel trackees par le tracker). Ca permet de
  // deverrouiller la page meme sans SIP branche.
  if (counts.sipCalls > 0 || (counts.ctaClicks ?? 0) > 0) active.push('calls');
  // On considere gsc "actif" seulement si la propriete est attachee ET on a
  // au moins une ligne de data ingeree. Sinon c'est juste brancheun pas sync.
  if (counts.hasGscProperty && counts.gscRows > 0) active.push('gsc');
  // Push est actif si au moins 1 abonnement existe (pas lie au 28j, un
  // abonnement push est permanent tant que le visiteur ne le revoque pas).
  if ((counts.pushSubscriptions ?? 0) > 0) active.push('push');

  const inactive = KNOWN_SERVICES.filter((s) => !active.includes(s));
  return { active, inactive };
}

/**
 * Genere la liste des next steps concrets pour aider Robert (ou le skill) a
 * finir l'integration. L'ordre reflete la priorite d'execution.
 */
export function buildNextSteps(
  site: {
    domain: string;
    gscProperty: { propertyUrl: string } | null;
  },
  counts: {
    pageviews: number;
    formSubmissions: number;
    sipCalls: number;
    gscRows: number;
  },
): string[] {
  const steps: string[] = [];

  if (counts.pageviews === 0) {
    steps.push(
      `Coller le snippet tracker dans le <head> de ${site.domain} (aucun pageview n'a encore ete recu).`,
    );
  }

  if (counts.formSubmissions === 0) {
    steps.push(
      `Taguer au moins un formulaire avec data-veridian-track="contact" (ou un nom de formulaire significatif) sur ${site.domain}.`,
    );
  }

  if (!site.gscProperty) {
    steps.push(
      `Attacher une propriete Google Search Console pour ${site.domain} via PUT /api/admin/sites/:id/gsc.`,
    );
  } else if (counts.gscRows === 0) {
    steps.push(
      `Lancer une premiere sync GSC via POST /api/admin/gsc/sync (siteId present, propertyUrl ${site.gscProperty.propertyUrl}).`,
    );
  }

  if (counts.sipCalls === 0) {
    steps.push(
      `Configurer un numero dedie (OVH voiceConsumption ou Telnyx) et brancher l'ingestion /api/ingest/call pour tracker les appels entrants.`,
    );
  }

  // Deux services futurs qu'on annonce deja pour le shadow marketing :
  steps.push(
    `(futur) Activer le suivi Google Ads via l'API Google Ads — service payant a vendre au client.`,
    `(futur) Activer le monitoring PageSpeed hebdo — service payant a vendre au client.`,
  );

  return steps;
}

/**
 * Calcule les counts 28j pour un site. Cette fonction fait 5 requetes en
 * parallele (une par table) — c'est OK parce qu'on parle d'un endpoint admin
 * appele a la demande, pas un hot path.
 */
async function computeCounts28d(siteId: string) {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const sinceDay = new Date(since);
  sinceDay.setUTCHours(0, 0, 0, 0);

  const [
    pageviews,
    formSubmissions,
    sipCalls,
    ctaClicks,
    gscRows,
    gscAgg,
  ] = await Promise.all([
    prisma.pageview.count({ where: { siteId, createdAt: { gte: since }, isBot: false, interacted: true } }),
    prisma.formSubmission.count({
      where: { siteId, createdAt: { gte: since } },
    }),
    prisma.sipCall.count({
      where: { siteId, startedAt: { gte: since } },
    }),
    // Clics CTA : pageviews dont le referrer commence par "cta:" (tel:, mailto:, data-veridian-cta)
    prisma.pageview.count({
      where: { siteId, createdAt: { gte: since }, referrer: { startsWith: 'cta:' }, isBot: false, interacted: true },
    }),
    prisma.gscDaily.count({ where: { siteId, day: { gte: sinceDay } } }),
    prisma.gscDaily.aggregate({
      where: { siteId, day: { gte: sinceDay } },
      _sum: { clicks: true, impressions: true },
    }),
  ]);

  return {
    pageviews,
    formSubmissions,
    sipCalls,
    ctaClicks,
    gscRows,
    gscClicks: gscAgg._sum.clicks ?? 0,
    gscImpressions: gscAgg._sum.impressions ?? 0,
  };
}

/**
 * Point d'entree principal : prend un tenant (deja charge avec ses sites
 * et memberships) et renvoie le snapshot complet pret a serialiser.
 */
/**
 * Charge tous les tenants actifs depuis la DB et construit le snapshot
 * complet de chacun. Utilise par la console /admin de Robert pour afficher
 * la liste globale. Pas de pagination — on a < 100 tenants pour plusieurs
 * annees, un simple findMany suffit. Si ca devient lourd on ajoutera
 * pagination + counts legers.
 */
export async function listAllTenantsStatus(): Promise<TenantStatus[]> {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
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
  // Charge les counts de push subscriptions par tenant en un seul query
  const pushCounts = await prisma.pushSubscription.groupBy({
    by: ['tenantId'],
    _count: { id: true },
  });
  const pushCountMap = new Map(
    pushCounts.map((pc) => [pc.tenantId, pc._count.id]),
  );

  return Promise.all(
    tenants.map((t) => buildTenantStatus(t, undefined, pushCountMap.get(t.id) ?? 0)),
  );
}

export async function buildTenantStatus(
  tenant: TenantInput,
  req?: Request,
  pushSubscriptionsCount = 0,
): Promise<TenantStatus> {
  const trackerBase = resolveTrackerBaseUrl(req);

  const sites: SiteStatus[] = await Promise.all(
    tenant.sites.map(async (site) => {
      const counts = await computeCounts28d(site.id);
      const { active, inactive } = detectServices({
        pageviews: counts.pageviews,
        formSubmissions: counts.formSubmissions,
        sipCalls: counts.sipCalls,
        ctaClicks: counts.ctaClicks,
        gscRows: counts.gscRows,
        hasGscProperty: Boolean(site.gscProperty),
        pushSubscriptions: pushSubscriptionsCount,
      });
      const nextSteps = buildNextSteps(site, counts);

      return {
        id: site.id,
        domain: site.domain,
        name: site.name,
        siteKey: site.siteKey,
        createdAt: site.createdAt,
        gsc: site.gscProperty
          ? {
              propertyUrl: site.gscProperty.propertyUrl,
              lastSyncAt: site.gscProperty.lastSyncAt,
            }
          : null,
        counts28d: counts,
        activeServices: active,
        inactiveServices: inactive,
        trackerSnippet: buildTrackerSnippet(site.siteKey, trackerBase),
        nextSteps,
      };
    }),
  );

  const totalActive = sites.reduce((a, s) => a + s.activeServices.length, 0);
  const totalInactive = sites.reduce(
    (a, s) => a + s.inactiveServices.length,
    0,
  );
  const hasAnyIngestedData = sites.some(
    (s) =>
      s.counts28d.pageviews +
        s.counts28d.formSubmissions +
        s.counts28d.sipCalls +
        s.counts28d.gscRows >
      0,
  );

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      createdAt: tenant.createdAt,
      members: tenant.memberships.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        role: m.role,
      })),
    },
    sites,
    pushSubscriptionsCount,
    summary: {
      sitesCount: sites.length,
      totalActiveServices: totalActive,
      totalInactiveServices: totalInactive,
      hasAnyIngestedData,
    },
  };
}
