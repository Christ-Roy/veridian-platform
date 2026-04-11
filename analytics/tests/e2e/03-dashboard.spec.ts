import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders the metrics grid with 4 widgets', async ({ page }) => {
    await expect(page.getByTestId('metrics-grid')).toBeVisible();
    // 4 metrics : pageviews, forms, calls, gsc_clicks
    const cards = page.locator('[data-testid^="metric-"]').filter({
      hasNot: page.locator('[data-testid*="-value"]'),
    });
    // On utilise les ids racine (pas les -value/-delta)
    await expect(page.getByTestId('metric-pageviews')).toBeVisible();
    await expect(page.getByTestId('metric-forms')).toBeVisible();
    await expect(page.getByTestId('metric-calls')).toBeVisible();
    await expect(page.getByTestId('metric-gsc_clicks')).toBeVisible();
  });

  test('each widget has a numeric value and a delta', async ({ page }) => {
    for (const key of ['pageviews', 'forms', 'calls', 'gsc_clicks']) {
      const value = page.getByTestId(`metric-${key}-value`);
      await expect(value).toBeVisible();
      const text = (await value.textContent()) || '';
      // Doit matcher un nombre FR locale (chiffres + espaces)
      expect(text.replace(/\s/g, '')).toMatch(/^\d+$/);

      const delta = page.getByTestId(`metric-${key}-delta`);
      await expect(delta).toBeVisible();
      expect((await delta.textContent()) || '').toMatch(/[+-]?\d+(\.\d+)?%/);
    }
  });

  test('sidebar navigation works', async ({ page }) => {
    // Scope les locators au <aside> pour eviter les collisions avec les
    // cards du dashboard qui contiennent aussi "Formulaires soumis" etc.
    const sidebar = page.locator('aside');

    await sidebar.getByRole('link', { name: 'Formulaires', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/forms/);
    await expect(
      page.getByRole('heading', { name: 'Formulaires' }),
    ).toBeVisible();

    await sidebar.getByRole('link', { name: 'Appels', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/calls/);
    await expect(
      page.getByRole('heading', { name: 'Appels' }),
    ).toBeVisible();

    await sidebar.getByRole('link', { name: 'Search Console' }).click();
    await expect(page).toHaveURL(/\/dashboard\/gsc/);
    await expect(
      page.getByRole('heading', { name: 'Google Search Console' }),
    ).toBeVisible();

    await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('clicking a widget navigates to its dedicated page', async ({
    page,
  }) => {
    await page.getByTestId('metric-forms').click();
    await expect(page).toHaveURL(/\/dashboard\/forms/);
  });

  test('logout returns to login', async ({ page }) => {
    await page.getByRole('button', { name: /Déconnexion/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});
