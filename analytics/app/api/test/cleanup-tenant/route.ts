import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTestApisEnabled } from '@/lib/test-apis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/test/cleanup-tenant
 *
 * Hard delete un tenant specifique par id OU par slug. Utilise par les tests
 * e2e en afterAll pour nettoyer leur fixture sans toucher aux autres.
 *
 * Body :
 *   { id?: string; slug?: string }
 *
 * Retourne { ok: true } si delete OK, { ok: false, error: 'not_found' } si
 * le tenant n'existait pas (pas une erreur — le cleanup doit etre idempotent).
 *
 * Guard : voir lib/test-apis.ts — 404 si ENABLE_TEST_APIS != 'true' ou prod.
 */
export async function POST(req: Request) {
  const blocked = requireTestApisEnabled();
  if (blocked) return blocked;

  let body: { id?: string; slug?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.id && !body.slug) {
    return NextResponse.json(
      { error: 'missing_id_or_slug' },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: body.id ? { id: body.id } : { slug: body.slug },
    select: { id: true, slug: true },
  });

  if (!tenant) {
    return NextResponse.json({ ok: false, error: 'not_found' });
  }

  await prisma.tenant.delete({ where: { id: tenant.id } });
  return NextResponse.json({ ok: true, slug: tenant.slug });
}
