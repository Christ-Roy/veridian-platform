import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireTestApisEnabled } from '@/lib/test-apis';

/**
 * Garde-fou critique : les routes /api/test/* ne doivent jamais etre
 * accessibles en prod. Le guard se base UNIQUEMENT sur ENABLE_TEST_APIS
 * (pas NODE_ENV) parce que Next.js inline process.env.NODE_ENV au build
 * time — il n'est pas fiable au runtime.
 *
 * En prod, ne JAMAIS mettre ENABLE_TEST_APIS=true dans les env du container.
 * Le Dockerfile n'exporte pas cette variable → production-safe par defaut.
 */
describe('requireTestApisEnabled guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).ENABLE_TEST_APIS =
      undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 404 when ENABLE_TEST_APIS is not set', async () => {
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_APIS is falsy string', async () => {
    process.env.ENABLE_TEST_APIS = 'false';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns 404 when ENABLE_TEST_APIS=1 (not "true")', async () => {
    // On est strict : seul le string exact 'true' desactive le guard.
    process.env.ENABLE_TEST_APIS = '1';
    const res = requireTestApisEnabled();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('returns null (allow) when ENABLE_TEST_APIS=true', async () => {
    process.env.ENABLE_TEST_APIS = 'true';
    const res = requireTestApisEnabled();
    expect(res).toBeNull();
  });
});
