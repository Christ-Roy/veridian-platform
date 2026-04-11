import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Test du tracker.js dans un vrai browser :
 * 1. Cree un tenant/site via admin API, recupere le siteKey
 * 2. Sert une page HTML minimale via data: URL (ou route.fulfill) qui charge
 *    le tracker.js et contient un <form>
 * 3. Soumet le form → verifie que le POST /api/ingest/form est envoye
 * 4. Verifie que le pageview initial a bien ete envoye au load
 */
test.describe('Tracker.js in browser', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  let siteKey = '';
  let tenantId = '';
  const slug = `tracker-${Date.now().toString(36)}`;

  test.beforeAll(async ({ request }) => {
    const t = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { slug, name: slug, ownerEmail: `${slug}@example.com` },
    });
    tenantId = (await t.json()).tenant.id;

    const s = await request.post(`/api/admin/tenants/${tenantId}/sites`, {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: { domain: `${slug}.local`, name: slug },
    });
    siteKey = (await s.json()).integration.siteKey;
  });

  test.afterAll(async ({ request }) => {
    if (tenantId) {
      await request.delete(`/api/admin/tenants/${tenantId}`, {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
    }
  });

  test('pageview is sent on load and form submit is intercepted', async ({
    page,
    baseURL,
  }) => {
    const postedPaths: string[] = [];

    // Intercepte les appels /api/ingest/* pour verifier qu'ils partent bien.
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/ingest/')) postedPaths.push(url);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('[browser err]', msg.text());
      }
    });

    // On navigue d'abord sur /login (qui existe) pour avoir une origin valide,
    // puis on remplace le document avec notre page de test.
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

    // Attente longue pour laisser le tracker charger + envoyer le pageview.
    // En dev mode Next peut mettre 2-3s pour le 1er compile de /api/ingest/*.
    await page.waitForTimeout(3000);

    expect(postedPaths.some((u) => u.includes('/api/ingest/pageview'))).toBe(
      true,
    );

    // Le tracker attache son listener apres le load → on declenche un submit
    // apres son load. Le form a onsubmit="return false" donc pas de navigation.
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    expect(postedPaths.some((u) => u.includes('/api/ingest/form'))).toBe(true);
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
