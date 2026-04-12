import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';

/**
 * Rate limiter par siteKey pour les endpoints d'ingestion.
 * 100 req/min par siteKey — suffisant pour un site client normal
 * (meme un site avec 50 pages/min en SPA genere ~50 req/min max).
 * Protege contre le spam de pageviews/forms/calls par un attaquant
 * qui aurait recupere un siteKey depuis le HTML source d'un client.
 */
export const ingestRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 100,
});

/**
 * Résout un siteKey (header x-site-key) vers l'id du Site correspondant.
 * Retourne null si pas trouvé — les handlers doivent renvoyer 401.
 */
export async function resolveSiteKey(
  req: Request,
): Promise<{ siteId: string; tenantId: string } | null> {
  const key = req.headers.get('x-site-key');
  if (!key) return null;
  const site = await prisma.site.findUnique({
    where: { siteKey: key },
    select: { id: true, tenantId: true, deletedAt: true },
  });
  if (!site || site.deletedAt) return null;
  return { siteId: site.id, tenantId: site.tenantId };
}

/**
 * Verifie le rate limit pour un endpoint d'ingestion.
 * Retourne une Response 429 si la limite est depassee, null sinon.
 * A appeler APRES resolveSiteKey (on rate-limit par siteKey, pas par IP,
 * car les siteKeys sont publiques et l'IP peut varier avec les CDN).
 */
export function checkIngestRateLimit(siteKey: string): NextResponse | null {
  if (!ingestRateLimiter.check(siteKey)) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: 60 },
      { status: 429, headers: { ...corsHeaders(), 'Retry-After': '60' } },
    );
  }
  return null;
}

export function corsHeaders(): HeadersInit {
  // POC : on ouvre grand pour que les sites clients puissent POST depuis le browser.
  // TODO prod : whitelister les origins via la table Site.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key',
    'Access-Control-Max-Age': '86400',
  };
}
