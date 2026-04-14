import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey, checkIngestRateLimit } from '@/lib/ingest';

export const runtime = 'nodejs';

/**
 * Le tracker envoie ce beacon quand il détecte une interaction humaine
 * (scroll, mousemove, click, touch, keypress). On le croit — pas de
 * validation forensic côté serveur. On marque simplement interacted=true
 * sur le pageview le plus récent de cette session.
 */
const schema = z.object({
  sessionId: z.string().max(100),
  type: z.string().max(20), // mousemove, scroll, click, touch, keypress — informatif seulement
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const siteKey = req.headers.get('x-site-key') ?? '';
  const rateLimited = checkIngestRateLimit(siteKey, req);
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

  // Marquer le pageview le plus récent de cette session comme interacted
  const pageview = await prisma.pageview.findFirst({
    where: {
      siteId: site.siteId,
      sessionId: parsed.data.sessionId,
      interacted: false,
      isBot: false,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (pageview) {
    await prisma.pageview.update({
      where: { id: pageview.id },
      data: { interacted: true },
    });
  }

  return NextResponse.json(
    { ok: true, matched: !!pageview },
    { headers: corsHeaders() },
  );
}
