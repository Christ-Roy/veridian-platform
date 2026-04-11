import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/prisma before importing the ingest module.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    site: {
      findUnique: vi.fn(),
    },
  },
}));

import { resolveSiteKey, corsHeaders } from '@/lib/ingest';
import { prisma } from '@/lib/prisma';

describe('ingest / resolveSiteKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null if no x-site-key header', async () => {
    const req = new Request('http://localhost/api/ingest/form', {
      method: 'POST',
    });
    const res = await resolveSiteKey(req);
    expect(res).toBeNull();
  });

  it('returns null if site not found', async () => {
    (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const req = new Request('http://localhost/api/ingest/form', {
      method: 'POST',
      headers: { 'x-site-key': 'nope' },
    });
    expect(await resolveSiteKey(req)).toBeNull();
  });

  it('returns null if site is soft-deleted', async () => {
    (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 's1',
      tenantId: 't1',
      deletedAt: new Date(),
    });
    const req = new Request('http://localhost/api/ingest/form', {
      method: 'POST',
      headers: { 'x-site-key': 'sk_ok' },
    });
    expect(await resolveSiteKey(req)).toBeNull();
  });

  it('returns siteId + tenantId if site is active', async () => {
    (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 's1',
      tenantId: 't1',
      deletedAt: null,
    });
    const req = new Request('http://localhost/api/ingest/form', {
      method: 'POST',
      headers: { 'x-site-key': 'sk_ok' },
    });
    const res = await resolveSiteKey(req);
    expect(res).toEqual({ siteId: 's1', tenantId: 't1' });
    expect(prisma.site.findUnique).toHaveBeenCalledWith({
      where: { siteKey: 'sk_ok' },
      select: { id: true, tenantId: true, deletedAt: true },
    });
  });
});

describe('ingest / corsHeaders', () => {
  it('allows POST and OPTIONS', () => {
    const h = corsHeaders() as Record<string, string>;
    expect(h['Access-Control-Allow-Origin']).toBe('*');
    expect(h['Access-Control-Allow-Methods']).toContain('POST');
    expect(h['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(h['Access-Control-Allow-Headers']).toContain('x-site-key');
  });
});
