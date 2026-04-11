import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe('GSC Performance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/gsc');
    await expect(
      page.getByRole('heading', { name: 'Google Search Console' }),
    ).toBeVisible();
  });

  test('renders site selector, range selector, search type selector', async ({
    page,
  }) => {
    await expect(page.getByTestId('gsc-dashboard')).toBeVisible();
    await expect(page.getByTestId('site-selector')).toBeVisible();
    await expect(page.getByTestId('range-selector')).toBeVisible();
    await expect(page.getByTestId('searchtype-selector')).toBeVisible();
  });

  test('renders 4 KPI tiles with values', async ({ page }) => {
    await expect(page.getByTestId('kpi-clicks')).toBeVisible();
    await expect(page.getByTestId('kpi-impressions')).toBeVisible();
    await expect(page.getByTestId('kpi-ctr')).toBeVisible();
    await expect(page.getByTestId('kpi-position')).toBeVisible();

    // Attendre le fetch /api/gsc/query → affichage d'une valeur numerique
    await page.waitForResponse(
      (r) => r.url().includes('/api/gsc/query') && r.ok(),
      { timeout: 15_000 },
    );
  });

  test('toggles KPI metrics on/off', async ({ page }) => {
    // Attends que les data se chargent
    await page.waitForResponse((r) => r.url().includes('/api/gsc/query') && r.ok());

    // Par defaut clicks et impressions sont actifs, ctr et position OFF
    await expect(page.getByTestId('kpi-clicks')).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByTestId('kpi-ctr')).toHaveAttribute(
      'data-active',
      'false',
    );

    // Toggle ctr ON
    await page.getByTestId('kpi-ctr').click();
    await expect(page.getByTestId('kpi-ctr')).toHaveAttribute(
      'data-active',
      'true',
    );

    // Toggle clicks OFF
    await page.getByTestId('kpi-clicks').click();
    await expect(page.getByTestId('kpi-clicks')).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  test('switches between dimension tabs', async ({ page }) => {
    await page.waitForResponse((r) => r.url().includes('/api/gsc/query') && r.ok());

    // L'onglet par defaut est Requêtes
    await page.getByTestId('tab-page').click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"page"') === true,
      { timeout: 10_000 },
    );

    await page.getByTestId('tab-country').click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"country"') === true,
      { timeout: 10_000 },
    );

    await page.getByTestId('tab-device').click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"device"') === true,
      { timeout: 10_000 },
    );

    await page.getByTestId('tab-date').click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"date"') === true,
      { timeout: 10_000 },
    );
  });

  test('sorts by clicking column headers', async ({ page }) => {
    await page.waitForResponse((r) => r.url().includes('/api/gsc/query') && r.ok());

    // Clic sur "Impressions" pour trier dessus
    await page.getByTestId('sort-impressions').click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"orderBy":"impressions"') === true,
      { timeout: 10_000 },
    );
  });

  test('changes date range', async ({ page }) => {
    await page.waitForResponse((r) => r.url().includes('/api/gsc/query') && r.ok());
    await page.getByTestId('range-selector').selectOption('7d');
    await page.waitForResponse(
      (r) => r.url().includes('/api/gsc/query') && r.ok(),
      { timeout: 10_000 },
    );
  });

  test('adds a filter and refetches', async ({ page }) => {
    await page.waitForResponse((r) => r.url().includes('/api/gsc/query') && r.ok());

    await page.getByTestId('add-filter').click();
    // Le mini-form apparait — selectionne contains (par defaut query/contains)
    await page.fill('input[placeholder="valeur"]', 'serrurier');
    await page.getByRole('button', { name: 'OK' }).click();

    // Le filtre doit etre visible en tant que chip
    await expect(page.getByTestId('active-filter-0')).toBeVisible();
    await expect(page.getByTestId('active-filter-0')).toContainText('serrurier');

    // Et une nouvelle requete est envoyee avec le filtre
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('serrurier') === true,
      { timeout: 10_000 },
    );
  });
});
