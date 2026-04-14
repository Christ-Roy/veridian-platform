import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Couvre le nouvel endpoint GET /api/admin/tenants/:idOrSlug/status
 * qui est la pierre angulaire du skill analytics-provision.
 *
 * On cree un tenant + site + ingere un pageview, puis on verifie que le
 * snapshot retourne contient les bons services actifs/inactifs, un snippet
 * tracker bien forme et des next steps coherents.
 */
test.describe('Tenant status endpoint', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  let tenantId = '';
  let siteId = '';
  let siteKey = '';
  const slug = `status-${Date.now().toString(36)}`;

  test.beforeAll(async ({ request }) => {
    const t = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: {
        slug,
        name: `Status e2e ${slug}`,
        ownerEmail: `owner-${slug}@example.com`,
      },
    });
    tenantId = (await t.json()).tenant.id;

    const s = await request.post(`/api/admin/tenants/${tenantId}/sites`, {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { domain: `${slug}.local`, name: `${slug} site` },
    });
    const sJson = await s.json();
    siteId = sJson.site.id;
    siteKey = sJson.integration.siteKey;
  });

  test.afterAll(async ({ request }) => {
    if (!tenantId) return;
    // Hard delete via /api/test/cleanup-tenant pour eviter de laisser des
    // sites orphelins (le DELETE admin fait un soft delete sur le tenant
    // mais les sites restent avec deletedAt NULL).
    await request.post('/api/test/cleanup-tenant', {
      data: { id: tenantId },
    });
  });

  test('refuse sans clé admin', async ({ request }) => {
    const res = await request.get(`/api/admin/tenants/${slug}/status`);
    expect(res.status()).toBe(401);
  });

  test('retourne 404 pour un slug inconnu', async ({ request }) => {
    const res = await request.get('/api/admin/tenants/inexistant-xyz-000/status', {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(res.status()).toBe(404);
  });

  test('resout par slug OU par id', async ({ request }) => {
    const bySlug = await request.get(`/api/admin/tenants/${slug}/status`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(bySlug.status()).toBe(200);
    const bySlugJson = await bySlug.json();
    expect(bySlugJson.tenant.slug).toBe(slug);

    const byId = await request.get(`/api/admin/tenants/${tenantId}/status`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(byId.status()).toBe(200);
    const byIdJson = await byId.json();
    expect(byIdJson.tenant.id).toBe(tenantId);
  });

  test('retourne un snapshot complet avec snippet tracker et next steps', async ({
    request,
  }) => {
    const res = await request.get(`/api/admin/tenants/${slug}/status`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Shape tenant
    expect(body.tenant.slug).toBe(slug);
    expect(body.tenant.id).toBe(tenantId);
    expect(Array.isArray(body.tenant.members)).toBe(true);

    // Au moins 1 site
    expect(body.sites.length).toBe(1);
    const site = body.sites[0];
    expect(site.id).toBe(siteId);
    expect(site.siteKey).toBe(siteKey);

    // Snippet tracker bien forme
    expect(site.trackerSnippet).toContain('<script');
    expect(site.trackerSnippet).toContain(`data-site-key="${siteKey}"`);
    expect(site.trackerSnippet).toContain('data-veridian-track="auto"');
    expect(site.trackerSnippet).toContain('tracker.js');

    // Counts 28j initialisés à 0
    expect(site.counts28d.pageviews).toBe(0);
    expect(site.counts28d.formSubmissions).toBe(0);
    expect(site.counts28d.sipCalls).toBe(0);

    // Tous services inactifs au debut
    expect(site.activeServices).toEqual([]);
    expect(site.inactiveServices).toContain('pageviews');
    expect(site.inactiveServices).toContain('forms');
    expect(site.inactiveServices).toContain('gsc');

    // Next steps non vides et coherents
    expect(Array.isArray(site.nextSteps)).toBe(true);
    expect(site.nextSteps.length).toBeGreaterThan(0);
    expect(
      site.nextSteps.some((s: string) =>
        s.includes('Coller le snippet tracker'),
      ),
    ).toBe(true);
    expect(
      site.nextSteps.some((s: string) =>
        s.includes('Attacher une propriete Google Search Console'),
      ),
    ).toBe(true);

    // Summary coherent
    expect(body.summary.sitesCount).toBe(1);
    expect(body.summary.totalActiveServices).toBe(0);
    expect(body.summary.hasAnyIngestedData).toBe(false);
  });

  test('active pageviews apres ingestion', async ({ request }) => {
    // Ingest un pageview via x-site-key
    const sessionId = 'e2e-status-' + Date.now();
    const ingest = await request.post('/api/ingest/pageview', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': siteKey,
      },
      data: { path: '/status-test', referrer: null, sessionId },
    });
    expect(ingest.status()).toBe(200);

    // Marquer comme interacted (sinon le count filtre interacted=true)
    const interact = await request.post('/api/ingest/interaction', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': siteKey,
      },
      data: { sessionId, type: 'scroll' },
    });
    expect(interact.status()).toBe(200);

    // Re-check status
    const res = await request.get(`/api/admin/tenants/${slug}/status`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const body = await res.json();
    const site = body.sites[0];

    expect(site.counts28d.pageviews).toBeGreaterThanOrEqual(1);
    expect(site.activeServices).toContain('pageviews');
    expect(site.inactiveServices).not.toContain('pageviews');
    expect(body.summary.hasAnyIngestedData).toBe(true);

    // Le next step "coller le snippet" doit avoir disparu
    expect(
      site.nextSteps.some((s: string) =>
        s.includes('Coller le snippet tracker'),
      ),
    ).toBe(false);
  });
});
