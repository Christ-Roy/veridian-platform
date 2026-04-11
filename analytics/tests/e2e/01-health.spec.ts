import { test, expect } from '@playwright/test';

test.describe('Infrastructure', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
  });

  test('tracker.js is public and served', async ({ request }) => {
    const res = await request.get('/tracker.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('veridian');
    expect(body).toContain('x-site-key');
    expect(body.length).toBeGreaterThan(1000);
  });

  test('root redirects to /login when not authenticated', async ({ page }) => {
    const res = await page.goto('/');
    // /dashboard renvoie 307 vers /login, Playwright suit automatiquement.
    await expect(page).toHaveURL(/\/login/);
    expect(res).toBeTruthy();
  });
});
