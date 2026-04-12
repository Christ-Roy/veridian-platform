import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTestApisEnabled } from '@/lib/test-apis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/test/reset
 *
 * Nuke (hard delete) tous les tenants dont le slug matche un prefixe test.
 * Utilise par les e2e au beforeAll/afterAll pour garantir 0 pollution DB
 * meme si un test precedent a crashed avant d'avoir nettoye.
 *
 * Cascades automatiques grace a onDelete: Cascade sur Site → Pageview,
 * FormSubmission, SipCall, GscDaily, GscProperty.
 *
 * Body (optionnel) :
 *   { prefixes?: string[] }  // defaut: ['e2e-', 'tracker-', 'status-', 'gsc-fixture-']
 *
 * Guard : voir lib/test-apis.ts — 404 si ENABLE_TEST_APIS != 'true' ou prod.
 */
export async function POST(req: Request) {
  const blocked = requireTestApisEnabled();
  if (blocked) return blocked;

  const DEFAULT_PREFIXES = [
    'e2e-',
    'e2e-test-',
    'tracker-',
    'status-',
    'gsc-fixture-',
    'no-email-',
    'bad-email-',
    'dup-',
  ];

  let prefixes = DEFAULT_PREFIXES;
  try {
    const body = await req.json();
    if (Array.isArray(body?.prefixes) && body.prefixes.length > 0) {
      prefixes = body.prefixes.filter((p: unknown) => typeof p === 'string');
    }
  } catch {
    // body vide ou invalide = on utilise les defauts
  }

  // Trouve les tenants concernes (inclut ceux soft-deletes)
  const tenants = await prisma.tenant.findMany({
    where: {
      OR: prefixes.map((p) => ({ slug: { startsWith: p } })),
    },
    select: { id: true, slug: true },
  });

  if (tenants.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, tenants: [] });
  }

  // Hard delete — cascades handle tout (sites, pageviews, gscDaily, etc.)
  const result = await prisma.tenant.deleteMany({
    where: { id: { in: tenants.map((t) => t.id) } },
  });

  // Nuke aussi les users orphelins crees via connectOrCreate par l'admin API
  // (email pattern *@example.com, *@test.com, tracker-*@example.com...)
  // On ne touche JAMAIS robert@veridian.site.
  const orphanEmails = await prisma.user.findMany({
    where: {
      AND: [
        { email: { not: 'robert@veridian.site' } },
        {
          OR: [
            { email: { contains: '@example.com' } },
            { email: { contains: '@test.com' } },
          ],
        },
        { memberships: { none: {} } }, // sans membership (orphelin)
      ],
    },
    select: { id: true },
  });
  if (orphanEmails.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: orphanEmails.map((u) => u.id) } },
    });
  }

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    tenants: tenants.map((t) => t.slug),
    orphanUsersDeleted: orphanEmails.length,
  });
}
