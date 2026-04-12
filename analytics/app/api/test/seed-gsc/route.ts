import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTestApisEnabled } from '@/lib/test-apis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/test/seed-gsc
 *
 * Seed une fixture GSC complete et isolee pour les tests e2e :
 *   - Tenant avec slug unique (gsc-fixture-${suffix})
 *   - Membership OWNER pour le user fourni (ou robert@veridian.site par defaut)
 *   - Site avec un domaine unique
 *   - GscProperty attachee
 *   - 21 rows GscDaily sur les 7 derniers jours (3 queries × 7 jours, values
 *     deterministes pour que les assertions de test soient stables)
 *
 * Retourne les ids crees pour que le test puisse :
 *   1. les verifier (counts, filter expected query="serrurier")
 *   2. les cleanup proprement en afterAll via /api/test/reset
 *
 * Body (optionnel) :
 *   {
 *     ownerEmail?: string;  // defaut: robert@veridian.site
 *     suffix?: string;      // defaut: Date.now().toString(36)
 *     days?: number;        // defaut: 7
 *   }
 *
 * Guard : voir lib/test-apis.ts — 404 si ENABLE_TEST_APIS != 'true' ou prod.
 */
export async function POST(req: Request) {
  const blocked = requireTestApisEnabled();
  if (blocked) return blocked;

  let body: {
    ownerEmail?: string;
    suffix?: string;
    days?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // body vide = defauts
  }

  const ownerEmail = body.ownerEmail || 'robert@veridian.site';
  const suffix = body.suffix || Date.now().toString(36);
  const days = Math.min(Math.max(body.days ?? 7, 1), 28);

  const slug = `gsc-fixture-${suffix}`;
  const domain = `${slug}.fixture.local`;

  // 1. User (connectOrCreate)
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: { email: ownerEmail },
    update: {},
  });

  // 2. Tenant + Membership
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `GSC Fixture ${suffix}`,
      memberships: {
        create: { userId: user.id, role: 'OWNER' },
      },
    },
  });

  // 3. Site + GscProperty
  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      domain,
      name: `GSC Fixture ${suffix}`,
      gscProperty: {
        create: {
          propertyUrl: `sc-domain:${domain}`,
          lastSyncAt: new Date(),
        },
      },
    },
  });

  // 4. Rows GscDaily deterministes.
  // GscDaily unique key : (siteId, day, query, page, country, device, searchType).
  // On genere 3 queries × `days` jours = 3×7 = 21 rows par defaut.
  // Dates en recul de 2j+ comme GSC (data live finit a J-2).
  // Values : clicks = 10 + qIdx*5 + (days-d), impressions = clicks * 12.
  //   → la 1ere query ("serrurier lyon") a les valeurs les plus petites,
  //     la 3eme ("cle perdue") les plus grandes → orderBy clicks desc donne
  //     un ordre stable pour les tests de tri.
  const queries = ['serrurier lyon', 'depannage serrurerie', 'cle perdue'];
  const pages = ['/', '/contact', '/tarifs'];
  const now = new Date();
  const rows = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - d - 2);
    for (let qIdx = 0; qIdx < queries.length; qIdx++) {
      const clicks = 10 + qIdx * 5 + (days - d);
      const impressions = clicks * 12;
      rows.push({
        siteId: site.id,
        day,
        query: queries[qIdx],
        page: pages[qIdx],
        country: 'fra',
        device: 'desktop',
        searchType: 'web',
        clicks,
        impressions,
        ctr: clicks / impressions,
        position: 3 + qIdx * 1.5 + d * 0.2,
      });
    }
  }
  await prisma.gscDaily.createMany({ data: rows, skipDuplicates: true });

  return NextResponse.json({
    ok: true,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    site: { id: site.id, domain: site.domain, name: site.name },
    user: { id: user.id, email: user.email },
    gscRows: rows.length,
  });
}
