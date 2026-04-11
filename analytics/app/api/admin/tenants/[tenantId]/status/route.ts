import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';
import { buildTenantStatus } from '@/lib/tenant-status';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tenants/:id/status
 *
 * Endpoint d'etat consolide : renvoie tout ce que Claude (ou le skill
 * analytics-provision) doit savoir pour reprendre le fil d'un tenant sans
 * avoir a chainer 5 appels API. Pensee pour etre LE seul appel que le skill
 * fait en debut de session.
 *
 * Contient pour chaque site du tenant :
 *   - siteKey (a coller dans le snippet tracker)
 *   - snippet tracker pret a l'emploi
 *   - counts 28j (pageviews, forms, calls, gsc)
 *   - services actifs / inactifs (gamification + shadow marketing)
 *   - next steps concrets pour finir l'integration
 *
 * Query params :
 *   ?idOrSlug=... — accepte l'id OU le slug du tenant dans le path
 *
 * Reponse 404 si tenant introuvable ou soft-deleted.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  // On accepte id ou slug dans le path pour que le skill n'ait pas besoin
  // de resoudre le cuid avant d'appeler : `GET /status?slug=tramtech` marche
  // aussi bien que `GET /status` avec le vrai id.
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { slug: tenantId }],
      deletedAt: null,
    },
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

  if (!tenant) return jsonError('tenant_not_found', 404);

  const status = await buildTenantStatus(tenant, req);
  return NextResponse.json(status);
}
