import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey, checkIngestRateLimit } from '@/lib/ingest';

export const runtime = 'nodejs';

const schema = z.object({
  sessionId: z.string().max(100),
  lastPath: z.string().max(500).optional().nullable(),
  timeOnPage: z.number().min(0).max(86400000).optional(), // max 24h in ms
  scrollDepthMax: z.number().min(0).max(100).optional(),
  interactionCount: z.number().min(0).optional(),
  leftVia: z.enum(['navigate', 'close', 'back']).optional(),
  // sendBeacon embeds siteKey in body
  _siteKey: z.string().optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: corsHeaders() },
    );
  }

  const siteKeyHeader = req.headers.get('x-site-key') ?? body?._siteKey ?? '';
  const rateLimited = checkIngestRateLimit(siteKeyHeader, req);
  if (rateLimited) return rateLimited;

  const site = await resolveSiteKey(req);
  const resolvedSite = site ?? (body?._siteKey ? await resolveSiteKeyFromValue(body._siteKey) : null);
  if (!resolvedSite) {
    return NextResponse.json(
      { error: 'invalid_site_key' },
      { status: 401, headers: corsHeaders() },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() },
    );
  }

  const d = parsed.data;

  // Update the most recent pageview for this session with behavior data
  const pageview = await prisma.pageview.findFirst({
    where: {
      siteId: resolvedSite.siteId,
      sessionId: d.sessionId,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (pageview) {
    await prisma.pageview.update({
      where: { id: pageview.id },
      data: {
        timeOnPage: d.timeOnPage ?? null,
        scrollDepthMax: d.scrollDepthMax ?? null,
        interactionCount: d.interactionCount ?? 0,
      },
    });
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}

async function resolveSiteKeyFromValue(
  key: string,
): Promise<{ siteId: string; tenantId: string } | null> {
  if (!key) return null;
  const site = await prisma.site.findUnique({
    where: { siteKey: key },
    select: { id: true, tenantId: true, deletedAt: true },
  });
  if (!site || site.deletedAt) return null;
  return { siteId: site.id, tenantId: site.tenantId };
}
