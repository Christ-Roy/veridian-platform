import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey, checkIngestRateLimit } from '@/lib/ingest';

export const runtime = 'nodejs';

const row = z.object({
  query: z.string().min(1).max(500),
  page: z.string().min(1).max(500),
  country: z.string().max(10).default('(zz)'),
  device: z.string().max(20).default('unknown'),
  searchType: z
    .enum(['web', 'image', 'video', 'news', 'discover', 'googleNews'])
    .default('web'),
  clicks: z.number().int().nonnegative().default(0),
  impressions: z.number().int().nonnegative().default(0),
  ctr: z.number().nonnegative().max(1).default(0),
  position: z.number().nonnegative().default(0),
});

const schema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(row).min(1).max(5000),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const siteKey = req.headers.get('x-site-key') ?? '';
  const rateLimited = checkIngestRateLimit(siteKey);
  if (rateLimited) return rateLimited;

  const site = await resolveSiteKey(req);
  if (!site) {
    return NextResponse.json(
      { error: 'invalid_site_key' },
      { status: 401, headers: corsHeaders() },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: corsHeaders() },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() },
    );
  }

  const day = new Date(parsed.data.day + 'T00:00:00Z');

  // Suppression des rows existantes pour cette journee puis insert batch.
  // Plus rapide que upsert pour des volumes moyens, et GSC re-envoie tout
  // l'historique a chaque sync donc on ne risque pas de perte.
  await prisma.gscDaily.deleteMany({
    where: { siteId: site.siteId, day },
  });

  const data = parsed.data.rows.map((r) => ({
    siteId: site.siteId,
    day,
    query: r.query,
    page: r.page,
    country: r.country,
    device: r.device,
    searchType: r.searchType,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  const result = await prisma.gscDaily.createMany({
    data,
    skipDuplicates: true,
  });

  return NextResponse.json(
    { ok: true, upserted: result.count },
    { headers: corsHeaders() },
  );
}
