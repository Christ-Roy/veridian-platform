import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Rate Limiter ────────────────────────────────────────────────────────
import { createRateLimiter } from '@/lib/rate-limit';

describe('rate-limit / createRateLimiter', () => {
  it('autorise les requetes sous la limite', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('key-a')).toBe(true);
    }
  });

  it('bloque au-dela de la limite', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check('key-b')).toBe(true);
    expect(limiter.check('key-b')).toBe(true);
    expect(limiter.check('key-b')).toBe(true);
    expect(limiter.check('key-b')).toBe(false);
    expect(limiter.check('key-b')).toBe(false);
  });

  it('isole les cles entre elles', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(false);
    // La cle 'b' n'est pas affectee.
    expect(limiter.check('b')).toBe(true);
  });

  it('reset() libere la cle', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check('x')).toBe(true);
    expect(limiter.check('x')).toBe(false);
    limiter.reset('x');
    expect(limiter.check('x')).toBe(true);
  });

  it('size() reflète le nombre d\'entrees', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
    expect(limiter.size()).toBe(0);
    limiter.check('a');
    limiter.check('b');
    expect(limiter.size()).toBe(2);
  });
});

// ── Ingest rate limiter ─────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    site: { findUnique: vi.fn() },
  },
}));

import { checkIngestRateLimit, ingestRateLimiter } from '@/lib/ingest';

describe('ingest / checkIngestRateLimit', () => {
  beforeEach(() => {
    // Reset le limiter entre chaque test.
    ingestRateLimiter.reset('test-key');
  });

  it('retourne null (autorise) sous la limite', () => {
    const result = checkIngestRateLimit('test-key');
    expect(result).toBeNull();
  });

  it('retourne une Response 429 au-dela de la limite', () => {
    // Epuise la limite (200 par defaut).
    for (let i = 0; i < 200; i++) {
      ingestRateLimiter.check('flood-key');
    }
    const result = checkIngestRateLimit('flood-key');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });
});

// ── Admin auth — timing-safe comparison ─────────────────────────────────
// On ne peut pas importer requireAdmin directement sans process.env,
// mais on peut verifier que les fonctions exportees existent et que le
// module ne crash pas sans ADMIN_API_KEY.

describe('admin-auth / requireAdmin', () => {
  const ORIGINAL_KEY = process.env.ADMIN_API_KEY;
  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'test-admin-key-1234567890';
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = ORIGINAL_KEY;
  });

  it('renvoie 401 sans header x-admin-key', async () => {
    // Import dynamique pour que le module lise le process.env frais.
    const { requireAdmin } = await import('@/lib/admin-auth');
    const req = new Request('http://localhost/api/admin/tenants', {
      method: 'GET',
    });
    const result = requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('renvoie null (autorise) avec le bon header', async () => {
    const { requireAdmin } = await import('@/lib/admin-auth');
    const req = new Request('http://localhost/api/admin/tenants', {
      method: 'GET',
      headers: { 'x-admin-key': 'test-admin-key-1234567890' },
    });
    const result = requireAdmin(req);
    expect(result).toBeNull();
  });

  it('renvoie 401 avec un mauvais header', async () => {
    const { requireAdmin } = await import('@/lib/admin-auth');
    const req = new Request('http://localhost/api/admin/tenants', {
      method: 'GET',
      headers: { 'x-admin-key': 'wrong-key-000000000000' },
    });
    const result = requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('renvoie 500 si ADMIN_API_KEY trop court', async () => {
    process.env.ADMIN_API_KEY = 'short';
    const { requireAdmin } = await import('@/lib/admin-auth');
    const req = new Request('http://localhost/api/admin/tenants');
    const result = requireAdmin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
  });
});

// ── Magic link — token validation ───────────────────────────────────────
import { buildMagicLinkHtml } from '@/lib/magic-link';

describe('magic-link / XSS prevention', () => {
  it('echappe le tenantName dans le HTML', () => {
    const html = buildMagicLinkHtml(
      'https://example.com/welcome?token=abc',
      '<script>alert("xss")</script>',
    );
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('echappe l\'URL dans le href et le texte', () => {
    const maliciousUrl = 'https://example.com/welcome?token=abc&foo="><script>alert(1)</script>';
    const html = buildMagicLinkHtml(maliciousUrl, 'Test Tenant');
    // L'URL ne doit pas etre injectee telle quelle — les guillemets
    // doivent etre echappes pour empecher un breakout du href.
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;');
  });
});

// ── Test APIs guard ─────────────────────────────────────────────────────
describe('test-apis / requireTestApisEnabled', () => {
  const ORIGINAL = process.env.ENABLE_TEST_APIS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ENABLE_TEST_APIS;
    else process.env.ENABLE_TEST_APIS = ORIGINAL;
  });

  it('retourne 404 si ENABLE_TEST_APIS n\'est pas set', async () => {
    delete process.env.ENABLE_TEST_APIS;
    const { requireTestApisEnabled } = await import('@/lib/test-apis');
    const result = requireTestApisEnabled();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(404);
  });

  it('retourne null si ENABLE_TEST_APIS = true', async () => {
    process.env.ENABLE_TEST_APIS = 'true';
    const { requireTestApisEnabled } = await import('@/lib/test-apis');
    const result = requireTestApisEnabled();
    expect(result).toBeNull();
  });

  it('retourne 404 si ENABLE_TEST_APIS = false', async () => {
    process.env.ENABLE_TEST_APIS = 'false';
    const { requireTestApisEnabled } = await import('@/lib/test-apis');
    const result = requireTestApisEnabled();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(404);
  });
});

// ── Admin guard — SUPERADMIN check ──────────────────────────────────────
import { isSuperadmin, requireSuperadmin, ForbiddenError } from '@/lib/admin-guard';

describe('admin-guard / isSuperadmin', () => {
  it('retourne false pour null', () => {
    expect(isSuperadmin(null)).toBe(false);
  });

  it('retourne false pour un user MEMBER', () => {
    expect(isSuperadmin({ user: { email: 'a@b.com', platformRole: 'MEMBER' } })).toBe(false);
  });

  it('retourne true pour un SUPERADMIN', () => {
    expect(isSuperadmin({ user: { email: 'a@b.com', platformRole: 'SUPERADMIN' } })).toBe(true);
  });

  it('retourne false si platformRole absent', () => {
    expect(isSuperadmin({ user: { email: 'a@b.com' } })).toBe(false);
  });
});

describe('admin-guard / requireSuperadmin', () => {
  it('throw ForbiddenError si pas superadmin', () => {
    expect(() => requireSuperadmin(null)).toThrow(ForbiddenError);
    expect(() => requireSuperadmin({ user: { email: 'a@b.com', platformRole: 'MEMBER' } })).toThrow(ForbiddenError);
  });

  it('ne throw pas pour un SUPERADMIN', () => {
    expect(() =>
      requireSuperadmin({ user: { email: 'a@b.com', platformRole: 'SUPERADMIN' } }),
    ).not.toThrow();
  });
});

// ── Next.js config — X-Powered-By disabled ──────────────────────────────
describe('next.config / securite headers', () => {
  it('desactive X-Powered-By', async () => {
    // On verifie que la config contient poweredByHeader: false.
    // Import dynamique pour lire la config au runtime.
    const config = (await import('@/next.config')).default;
    expect(config.poweredByHeader).toBe(false);
  });
});
