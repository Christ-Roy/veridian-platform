import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';

/**
 * Rate limiter par siteKey pour les endpoints d'ingestion.
 * 100 req/min par siteKey — protège contre le spam massif d'un siteKey volé.
 */
export const ingestRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 100,
});

/**
 * Rate limiter par IP — 20 req/min.
 * Un humain réel ne génère jamais plus de ~5 pageviews/min sur un site vitrine PME.
 * Protège contre le spam programmatique même si l'attaquant forge un bon UA.
 */
export const ipRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
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
 * Extrait l'IP du visiteur depuis les headers (CF → X-Forwarded-For → X-Real-IP).
 */
export function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
}

/**
 * Vérifie le rate limit pour un endpoint d'ingestion.
 * Double check : par siteKey ET par IP.
 */
export function checkIngestRateLimit(siteKey: string, req?: Request): NextResponse | null {
  if (!ingestRateLimiter.check(siteKey)) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: 60 },
      { status: 429, headers: { ...corsHeaders(), 'Retry-After': '60' } },
    );
  }
  if (req) {
    const ip = getClientIp(req);
    if (ip !== 'unknown' && !ipRateLimiter.check(ip)) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterSec: 60 },
        { status: 429, headers: { ...corsHeaders(), 'Retry-After': '60' } },
      );
    }
  }
  return null;
}

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key',
    'Access-Control-Max-Age': '86400',
  };
}
