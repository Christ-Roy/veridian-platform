import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

/**
 * POST /api/admin/tenants/:id/dry-run
 *
 * Lance un test de tracking complet pour un tenant :
 *   1. Injecte un pageview de test (marque "dry-run" dans le referrer)
 *   2. Injecte un form submit de test (formName="dry-run-test")
 *   3. Injecte un CTA clic de test (referrer="cta:dry-run")
 *   4. Verifie que les 3 events sont bien en DB
 *   5. Retourne les formulaires du jour + erreurs eventuelles
 *   6. Supprime les events de test (0 pollution DB)
 *
 * Le dry-run ne touche PAS aux vrais events — il cree puis supprime
 * ses propres données. L'UI ne verra jamais les events dry-run.
 *
 * N'envoie PAS de mail (contrairement au magic link). C'est purement
 * un test de plomberie pour verifier que le tracking fonctionne.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  // Resout le tenant (par id ou slug)
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { slug: tenantId }],
      deletedAt: null,
    },
    include: {
      sites: {
        where: { deletedAt: null },
        take: 1,
        select: { id: true, siteKey: true, domain: true },
      },
    },
  });

  if (!tenant) return jsonError('tenant_not_found', 404);
  if (tenant.sites.length === 0) return jsonError('no_site', 400);

  const site = tenant.sites[0];
  const errors: string[] = [];
  const createdIds: { pageviews: string[]; forms: string[] } = {
    pageviews: [],
    forms: [],
  };

  // 1. Injecter un pageview de test
  try {
    const pv = await prisma.pageview.create({
      data: {
        siteId: site.id,
        path: '/dry-run-test',
        referrer: 'dry-run',
        sessionId: `dry-run-${Date.now()}`,
      },
    });
    createdIds.pageviews.push(pv.id);
  } catch (e) {
    errors.push(`pageview: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // 2. Injecter un CTA clic de test
  try {
    const cta = await prisma.pageview.create({
      data: {
        siteId: site.id,
        path: '/dry-run-test',
        referrer: 'cta:dry-run-tel:+33000000000',
        sessionId: `dry-run-${Date.now()}`,
      },
    });
    createdIds.pageviews.push(cta.id);
  } catch (e) {
    errors.push(`cta_click: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // 3. Injecter un form submit de test
  try {
    const form = await prisma.formSubmission.create({
      data: {
        siteId: site.id,
        formName: 'dry-run-test',
        path: '/dry-run-test',
        payload: {
          email: 'dryrun@test.veridian.site',
          phone: '+33600000000',
          message: 'Test dry-run automatique',
          _dryRun: true,
        },
        email: 'dryrun@test.veridian.site',
        phone: '+33600000000',
      },
    });
    createdIds.forms.push(form.id);
  } catch (e) {
    errors.push(`form: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // 4. Recuperer les formulaires du jour (vrais + dry-run)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const formsToday = await prisma.formSubmission.findMany({
    where: {
      siteId: site.id,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // 5. Verifier que les events de test sont bien presents
  const checks = {
    pageviewOk: createdIds.pageviews.length >= 1,
    ctaClickOk: createdIds.pageviews.length >= 2,
    formSubmitOk: createdIds.forms.length >= 1,
    formsToday: formsToday.length,
    formsTodayData: formsToday.map((f) => ({
      id: f.id,
      formName: f.formName,
      email: f.email,
      phone: f.phone,
      path: f.path,
      payload: f.payload,
      createdAt: f.createdAt,
      isDryRun: f.formName === 'dry-run-test',
    })),
  };

  // 6. Supprimer les events de test (0 pollution)
  if (createdIds.pageviews.length > 0) {
    await prisma.pageview.deleteMany({
      where: { id: { in: createdIds.pageviews } },
    });
  }
  if (createdIds.forms.length > 0) {
    await prisma.formSubmission.deleteMany({
      where: { id: { in: createdIds.forms } },
    });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    tenant: { slug: tenant.slug, name: tenant.name },
    site: { domain: site.domain, siteKey: site.siteKey },
    checks,
    errors: errors.length > 0 ? errors : undefined,
  });
}
