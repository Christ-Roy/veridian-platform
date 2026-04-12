import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey, checkIngestRateLimit } from '@/lib/ingest';

export const runtime = 'nodejs';

const schema = z.object({
  path: z.string().min(1).max(500),
  referrer: z.string().max(500).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmTerm: z.string().max(100).optional().nullable(),
  sessionId: z.string().max(100).optional().nullable(),
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

  const ua = req.headers.get('user-agent')?.slice(0, 500) ?? null;
  const country = req.headers.get('cf-ipcountry') ?? null;

  await prisma.pageview.create({
    data: {
      siteId: site.siteId,
      path: parsed.data.path,
      referrer: parsed.data.referrer ?? null,
      utmSource: parsed.data.utmSource ?? null,
      utmMedium: parsed.data.utmMedium ?? null,
      utmTerm: parsed.data.utmTerm ?? null,
      sessionId: parsed.data.sessionId ?? null,
      userAgent: ua,
      country,
    },
  });

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}
