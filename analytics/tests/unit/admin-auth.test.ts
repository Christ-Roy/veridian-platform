import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireAdmin, handlePrismaError, jsonError } from '@/lib/admin-auth';

function mkReq(headers: Record<string, string> = {}): Request {
  return new Request('http://test.local/api/admin/tenants', { headers });
}

describe('admin-auth / requireAdmin', () => {
  const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'test-key-abcdefghijklmnop';
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = ORIGINAL_KEY;
  });

  it('returns 500 if ADMIN_API_KEY is missing', async () => {
    delete process.env.ADMIN_API_KEY;
    const res = requireAdmin(mkReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
    const body = await res!.json();
    expect(body.error).toBe('admin_api_not_configured');
  });

  it('returns 500 if ADMIN_API_KEY is too short', async () => {
    process.env.ADMIN_API_KEY = 'short';
    const res = requireAdmin(mkReq());
    expect(res!.status).toBe(500);
  });

  it('returns 401 when no header', async () => {
    const res = requireAdmin(mkReq());
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns 401 when wrong header', async () => {
    const res = requireAdmin(mkReq({ 'x-admin-key': 'wrong' }));
    expect(res!.status).toBe(401);
  });

  it('returns null (OK) when correct header', () => {
    const res = requireAdmin(
      mkReq({ 'x-admin-key': 'test-key-abcdefghijklmnop' }),
    );
    expect(res).toBeNull();
  });

  it('is timing-safe: same length wrong key still rejected', () => {
    const res = requireAdmin(
      mkReq({ 'x-admin-key': 'test-key-aaaaaaaaaaaaaaaa' }),
    );
    expect(res!.status).toBe(401);
  });

  it('rate limits after 60 calls from same ip', () => {
    const ip = '1.2.3.4';
    for (let i = 0; i < 60; i++) {
      const res = requireAdmin(
        mkReq({
          'x-admin-key': 'test-key-abcdefghijklmnop',
          'x-forwarded-for': ip,
        }),
      );
      expect(res).toBeNull();
    }
    // 61e appel doit etre bloque
    const res = requireAdmin(
      mkReq({
        'x-admin-key': 'test-key-abcdefghijklmnop',
        'x-forwarded-for': ip,
      }),
    );
    expect(res!.status).toBe(429);
  });
});

describe('handlePrismaError', () => {
  it('maps P2002 to 409', async () => {
    const res = handlePrismaError({ code: 'P2002' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    const body = await res!.json();
    expect(body.error).toBe('unique_constraint_violation');
  });

  it('maps P2025 to 404', async () => {
    const res = handlePrismaError({ code: 'P2025' });
    expect(res!.status).toBe(404);
  });

  it('returns null for unknown error', () => {
    expect(handlePrismaError(new Error('boom'))).toBeNull();
    expect(handlePrismaError({ code: 'WHATEVER' })).toBeNull();
    expect(handlePrismaError(null)).toBeNull();
  });
});

describe('jsonError', () => {
  it('returns a NextResponse with the correct shape', async () => {
    const res = jsonError('bad_thing', 418, { hint: 'x' });
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body).toEqual({ error: 'bad_thing', hint: 'x' });
  });
});
