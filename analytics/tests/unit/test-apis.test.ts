import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireTestApisEnabled } from '@/lib/test-apis';

/**
 * Garde-fou critique : les routes /api/test/* ne doivent jamais etre
 * accessibles en prod. Ces tests verifient le guard sous tous les
 * combinaisons d'env.
 */
describe('requireTestApisEnabled guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = undefined;
    (process.env as Record<string, string | undefined>).ENABLE_TEST_APIS =
      undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 404 in production even with ENABLE_TEST_APIS=true', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.ENABLE_TEST_APIS = 'true';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_APIS is not set', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_APIS is falsy string', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.ENABLE_TEST_APIS = 'false';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_APIS=1 (not "true")', async () => {
    // On est strict : seul le string exact 'true' desactive le guard.
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.ENABLE_TEST_APIS = '1';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns null (allow) when ENABLE_TEST_APIS=true and not production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    process.env.ENABLE_TEST_APIS = 'true';
    const res = requireTestApisEnabled();
    expect(res).toBeNull();
  });
});
