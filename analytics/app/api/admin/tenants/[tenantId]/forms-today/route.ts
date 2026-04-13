import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tenants/:id/forms-today
 *
 * Retourne les formulaires soumis aujourd'hui pour un tenant, avec le
 * contenu complet (payload JSON). Utile pour le skill analytics-provision
 * pour verifier que le tracking formulaire fonctionne apres un branchement.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { slug: tenantId }],
      deletedAt: null,
    },
    include: {
      sites: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  if (!tenant) return jsonError('tenant_not_found', 404);

  const siteIds = tenant.sites.map((s) => s.id);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const forms = await prisma.formSubmission.findMany({
    where: {
      siteId: { in: siteIds },
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: 'desc' },
    include: { site: { select: { domain: true } } },
  });

  return NextResponse.json({
    tenant: tenant.slug,
    date: todayStart.toISOString().slice(0, 10),
    count: forms.length,
    forms: forms.map((f) => ({
      id: f.id,
      formName: f.formName,
      email: f.email,
      phone: f.phone,
      path: f.path,
      utmSource: f.utmSource,
      payload: f.payload,
      site: (f as typeof f & { site?: { domain: string } }).site?.domain,
      createdAt: f.createdAt,
    })),
  });
}
