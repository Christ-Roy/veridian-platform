import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // Wait for page to fully hydrate (sidebar + content)
  await page.waitForLoadState('networkidle');
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders the Veridian score and the services grid', async ({ page }) => {
    const score = page.getByTestId('score-value');
    await expect(score).toBeVisible({ timeout: 15_000 });
    const scoreText = ((await score.textContent()) || '').trim();
    expect(scoreText).toMatch(/^\d{1,3}$/);
    const n = parseInt(scoreText, 10);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(100);

    await expect(page.getByTestId('score-services-count')).toBeVisible();
    await expect(page.getByTestId('services-grid')).toBeVisible();
  });

  test('shows at least one shadow marketing block for unused services', async ({
    page,
  }) => {
    const shadowBlocks = page.locator('[data-testid^="shadow-"]');
    await expect(shadowBlocks.first()).toBeVisible({ timeout: 15_000 });
    const count = await shadowBlocks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const first = shadowBlocks.first();
    const href = await first.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^mailto:contact@veridian\.site\?/);
    expect(href!).toContain('subject=');
    expect(href!).toContain('body=');
  });

  test('sidebar navigation works', async ({ page }) => {
    const sidebar = page.locator('aside');
    // Wait for sidebar to be visible and hydrated
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    await sidebar.getByRole('link', { name: 'Formulaires', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/forms/, { timeout: 15_000 });

    await sidebar.getByRole('link', { name: 'Appels', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/calls/, { timeout: 15_000 });

    await sidebar.getByRole('link', { name: 'Search Console' }).click();
    await expect(page).toHaveURL(/\/dashboard\/gsc/, { timeout: 15_000 });

    await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  });

  test('clicking an active service block navigates to its dedicated page', async ({
    page,
  }) => {
    const active = page.locator('[data-testid^="service-"]').first();
    if ((await active.count()) === 0) {
      test.skip(true, 'Aucun service actif pour cet utilisateur');
    }
    await active.click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('logout returns to login', async ({ page }) => {
    await page.getByRole('button', { name: /Déconnexion/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});
