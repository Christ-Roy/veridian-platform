import { NextResponse } from 'next/server';

/**
 * Admin API auth — POC.
 * Verifie le header x-admin-key contre ADMIN_API_KEY (env).
 * Retourne une Response 401 si KO, null si OK.
 *
 * Inclut un rate limit en memoire simple (60 req/min/ip) pour protection
 * de base contre un abus ou une fuite accidentelle de la cle.
 */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

// Timing-safe equal pour eviter une attaque par timing de comparaison.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      { error: 'admin_api_not_configured' },
      { status: 500 },
    );
  }
  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: 60 },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  const got = req.headers.get('x-admin-key');
  if (!got || !safeEqual(got, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function jsonError(
  error: string,
  status = 400,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Helper pour traiter les erreurs Prisma connues (P2002 unique, P2025 not found)
 * sans fuiter le stack trace en prod.
 */
export function handlePrismaError(e: unknown): NextResponse | null {
  if (typeof e !== 'object' || !e || !('code' in e)) return null;
  const code = (e as { code?: string }).code;
  if (code === 'P2002') {
    return jsonError('unique_constraint_violation', 409);
  }
  if (code === 'P2025') {
    return jsonError('record_not_found', 404);
  }
  return null;
}
