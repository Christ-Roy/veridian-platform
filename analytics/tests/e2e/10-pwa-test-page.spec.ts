import { test, expect } from '@playwright/test';

/**
 * Tests E2E de la page /test-pwa et des endpoints PWA.
 *
 * Prerequis :
 *   - L'instance analytics tourne avec ENABLE_TEST_APIS=true
 *   - Le service worker (sw.js) et le manifest (/api/manifest) sont servis
 *   - L'endpoint /api/push/vapid-key est configure
 *
 * Certains tests dependent du travail des agents 1 et 2 (SW, manifest,
 * push endpoints). Ils sont marques avec un commentaire si c'est le cas.
 */

test.describe('Page /test-pwa', () => {
  test('test-pwa page is accessible', async ({ page }) => {
    await page.goto('/test-pwa?siteKey=test123');
    await expect(page.getByText('Page de test PWA')).toBeVisible();
  });

  test('displays site key from query param', async ({ page }) => {
    await page.goto('/test-pwa?siteKey=my-custom-key');
    await expect(page.getByText('my-custom-key')).toBeVisible();
  });

  test('form submit is intercepted by tracker', async ({ page }) => {
    // Note : necessite que tracker.js soit servi (OK en standalone CI)
    await page.goto('/test-pwa?siteKey=test123');

    await page.fill('input[name="email"]', 'test@test.com');
    await page.fill('input[name="phone"]', '+33600000000');
    await page.fill('textarea[name="message"]', 'Test PWA');

    // Intercepte le POST /api/ingest/form
    const formReq = page.waitForRequest(
      (req) =>
        req.url().includes('/api/ingest/form') && req.method() === 'POST',
      { timeout: 10_000 },
    );
    await page.click('button[type="submit"]');
    const req = await formReq;
    expect(req.headers()['x-site-key']).toBe('test123');
  });

  test('shows tracker status', async ({ page }) => {
    await page.goto('/test-pwa?siteKey=test123');
    // Le tracker devrait soit se charger soit echouer — dans les deux cas
    // le status est affiche. On verifie juste la presence d'un des deux textes.
    const loaded = page.getByText('Tracker charge');
    const notLoaded = page.getByText('Tracker non charge');
    await expect(loaded.or(notLoaded)).toBeVisible({ timeout: 5000 });
  });
});

// --- Tests des endpoints PWA (dependances agents 1 et 2) ---

test.describe('PWA endpoints', () => {
  // Depend de l'agent 1 (manifest dynamique)
  test('manifest.json is served', async ({ request }) => {
    const res = await request.get('/api/manifest');
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/dashboard');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeTruthy();
  });

  // Depend de l'agent 1 (service worker)
  test('service worker is served', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('push');
    expect(body).toContain('notificationclick');
  });

  // Depend de l'agent 2 (push endpoints)
  test('vapid public key endpoint works', async ({ request }) => {
    const res = await request.get('/api/push/vapid-key');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.publicKey).toBeTruthy();
  });
});
