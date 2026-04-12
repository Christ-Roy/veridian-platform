import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Test du tracker.js dans un vrai browser :
 *   1. On cree un tenant + site via admin API pour obtenir un siteKey valide
 *   2. On charge une page HTML minimale avec le <script src="/tracker.js">
 *   3. On verifie que le POST /api/ingest/pageview part au load
 *   4. On declenche un form submit et on verifie que /api/ingest/form part
 *   5. On cleanup le tenant cree (hard delete via /api/test/cleanup-tenant)
 *
 * Pas de sleeps arbitraires : on utilise page.waitForRequest avec predicate
 * pour detecter exactement le POST attendu, avec un timeout raisonnable.
 */
test.describe('Tracker.js in browser', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  let siteKey = '';
  let tenantId = '';
  let tenantSlug = '';

  async function hardCleanup(request: APIRequestContext) {
    if (!tenantId) return;
    await request.post('/api/test/cleanup-tenant', {
      data: { id: tenantId },
    });
  }

  test.beforeAll(async ({ request }) => {
    tenantSlug = `tracker-${Date.now().toString(36)}`;
    const t = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: {
        slug: tenantSlug,
        name: tenantSlug,
        ownerEmail: `${tenantSlug}@example.com`,
      },
    });
    expect(t.ok(), 'admin tenant create failed').toBe(true);
    tenantId = (await t.json()).tenant.id;

    const s = await request.post(`/api/admin/tenants/${tenantId}/sites`, {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { domain: `${tenantSlug}.local`, name: tenantSlug },
    });
    expect(s.ok(), 'admin site create failed').toBe(true);
    siteKey = (await s.json()).integration.siteKey;
  });

  test.afterAll(async ({ request }) => {
    await hardCleanup(request);
  });

  test('pageview is sent on load and form submit is intercepted', async ({
    page,
    baseURL,
  }) => {
    // On prepare DEUX promises d'attente AVANT d'injecter le tracker, pour
    // eviter toute race condition entre le script load et notre listener.
    const waitPageview = page.waitForRequest(
      (req) =>
        req.url().includes('/api/ingest/pageview') && req.method() === 'POST',
      { timeout: 10_000 },
    );

    // On log les erreurs console cote browser pour aider le debug CI.
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('[browser err]', msg.text());
      }
    });

    // On navigue d'abord sur /login (origin valide sur notre instance),
    // puis on remplace le document par notre page de test.
    await page.goto('/login');

    await page.evaluate(
      ({ base, key }) => {
        document.open();
        document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tracker test</title></head>
<body>
  <h1>Test page</h1>
  <form id="testform" data-veridian-track="contact-test" onsubmit="return false">
    <input name="email" value="tracker@test.com">
    <input name="phone" value="+33600000000">
    <input name="message" value="hello from playwright">
    <button type="submit">Send</button>
  </form>
</body></html>`);
        document.close();
        const s = document.createElement('script');
        s.src = `${base}/tracker.js`;
        s.setAttribute('data-site-key', key);
        s.setAttribute('data-veridian-track', 'auto');
        document.body.appendChild(s);
      },
      { base: baseURL, key: siteKey },
    );

    // Le pageview initial doit partir dans les secondes qui suivent le load.
    const pageviewReq = await waitPageview;
    expect(pageviewReq.url()).toContain('/api/ingest/pageview');

    // Verification bonus : le header x-site-key est bien dans la requete.
    const pvHeaders = pageviewReq.headers();
    expect(pvHeaders['x-site-key']).toBe(siteKey);

    // Maintenant on prepare l'attente du POST form AVANT le click, puis
    // on declenche le submit.
    const waitForm = page.waitForRequest(
      (req) =>
        req.url().includes('/api/ingest/form') && req.method() === 'POST',
      { timeout: 10_000 },
    );
    await page.click('button[type="submit"]');
    const formReq = await waitForm;
    expect(formReq.url()).toContain('/api/ingest/form');
    const fmHeaders = formReq.headers();
    expect(fmHeaders['x-site-key']).toBe(siteKey);
  });

  test('tracker with invalid site key returns 401 from /api/ingest/pageview', async ({
    request,
  }) => {
    const res = await request.post('/api/ingest/pageview', {
      headers: { 'x-site-key': 'bogus', 'Content-Type': 'application/json' },
      data: { path: '/test' },
    });
    expect(res.status()).toBe(401);
  });
});
