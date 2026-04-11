import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

test.describe('Admin API end-to-end', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  let createdTenantId = '';
  let createdSiteId = '';
  let createdSiteKey = '';
  const slug = `e2e-test-${Date.now().toString(36)}`;

  test('rejects requests without admin key', async ({ request }) => {
    const res = await request.get('/api/admin/tenants');
    expect(res.status()).toBe(401);
  });

  test('rejects tenant creation without ownerEmail', async ({ request }) => {
    // ownerEmail est obligatoire depuis que le skill analytics-provision
    // exige qu'un tenant ait toujours au moins un membre. Sans email, 400.
    const res = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { slug: `no-email-${Date.now().toString(36)}`, name: 'No email' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
    // Le champ ownerEmail doit etre signale dans les issues Zod
    expect(JSON.stringify(body.issues)).toContain('ownerEmail');
  });

  test('rejects tenant creation with invalid ownerEmail', async ({
    request,
  }) => {
    const res = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: {
        slug: `bad-email-${Date.now().toString(36)}`,
        name: 'Bad email',
        ownerEmail: 'pas-un-email',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('creates a tenant', async ({ request }) => {
    const res = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: {
        slug,
        name: `E2E Test ${slug}`,
        ownerEmail: `${slug}@example.com`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.tenant.slug).toBe(slug);
    expect(body.tenant.memberships[0].user.email).toBe(`${slug}@example.com`);
    createdTenantId = body.tenant.id;
  });

  test('rejects duplicate slug with 409', async ({ request }) => {
    test.skip(!createdTenantId, 'tenant creation failed');
    const res = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { slug, name: 'dup', ownerEmail: `dup-${slug}@example.com` },
    });
    expect(res.status()).toBe(409);
  });

  test('creates a site under the tenant', async ({ request }) => {
    test.skip(!createdTenantId, 'tenant creation failed');
    const res = await request.post(
      `/api/admin/tenants/${createdTenantId}/sites`,
      {
        headers: { 'x-admin-key': ADMIN_KEY },
        data: { domain: `${slug}.example.com`, name: 'E2E site' },
      },
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.site.domain).toBe(`${slug}.example.com`);
    expect(body.integration.siteKey).toBeTruthy();
    expect(body.integration.trackerScript).toContain('data-site-key');
    createdSiteId = body.site.id;
    createdSiteKey = body.integration.siteKey;
  });

  test('ingests a pageview with the site key', async ({ request }) => {
    test.skip(!createdSiteKey, 'site creation failed');
    const res = await request.post('/api/ingest/pageview', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': createdSiteKey,
      },
      data: { path: '/e2e-test', referrer: null },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('rejects ingest with invalid site key', async ({ request }) => {
    const res = await request.post('/api/ingest/pageview', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': 'invalid_key_xxxx',
      },
      data: { path: '/nope' },
    });
    expect(res.status()).toBe(401);
  });

  test('ingests a form submission', async ({ request }) => {
    test.skip(!createdSiteKey, 'site creation failed');
    const res = await request.post('/api/ingest/form', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': createdSiteKey,
      },
      data: {
        formName: 'contact-e2e',
        path: '/contact',
        payload: {
          email: 'e2e@test.com',
          phone: '+33612345678',
          message: 'hello',
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
  });

  test('rotates the site key', async ({ request }) => {
    test.skip(!createdSiteId, 'site creation failed');
    const res = await request.post(
      `/api/admin/sites/${createdSiteId}?action=rotate-key`,
      { headers: { 'x-admin-key': ADMIN_KEY } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.site.siteKey).not.toBe(createdSiteKey);
    expect(body.site.siteKey).toMatch(/^sk_/);
  });

  test('soft deletes the tenant (cleanup)', async ({ request }) => {
    test.skip(!createdTenantId, 'tenant creation failed');
    const res = await request.delete(
      `/api/admin/tenants/${createdTenantId}`,
      { headers: { 'x-admin-key': ADMIN_KEY } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verifier qu'il n'est plus dans la liste
    const list = await request.get('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const data = await list.json();
    const slugs = data.tenants.map((t: { slug: string }) => t.slug);
    expect(slugs).not.toContain(slug);
  });
});
