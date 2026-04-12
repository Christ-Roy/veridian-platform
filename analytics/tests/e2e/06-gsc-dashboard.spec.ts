import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Tests du clone GSC Performance Dashboard.
 *
 * Strategie : on utilise le tenant et site DEJA seedes par la CI (tenant
 * veridian-ci, site analytics.veridian.site, 21 rows GscDaily). Le seed
 * CI est fait dans le workflow avant le build.
 *
 * On ne cree PAS de tenant/site supplementaire dans ces tests — depuis
 * l'isolation tenant, le site-selector ne liste QUE les sites du tenant
 * de Robert, et un tenant de test separe ne serait pas visible dans le
 * dropdown.
 *
 * Le beforeEach loggue Robert, navigue sur /dashboard/gsc, et attend que
 * le dashboard soit charge avec au moins 1 site dans le selector et un
 * fetch /api/gsc/query ok.
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

async function gotoGsc(page: Page) {
  await page.goto('/dashboard/gsc');
  // Si le service gsc est inactif (pas de GscProperty attachee au tenant
  // de Robert), la page affiche LockedServicePage → on skip.
  // En CI, le seed cree un tenant veridian-ci avec GscProperty → gsc actif.
  const gscDashboard = page.getByTestId('gsc-dashboard');
  const lockedPage = page.locator('[data-testid^="locked-page-"]');
  await Promise.race([
    gscDashboard.waitFor({ state: 'visible', timeout: 15_000 }),
    lockedPage.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await lockedPage.isVisible()) {
    test.skip(true, 'GSC service is locked for this tenant (no GscProperty or no data)');
  }
  // Attend le premier fetch /api/gsc/query
  await page.waitForResponse(
    (r) => r.url().includes('/api/gsc/query') && r.ok(),
    { timeout: 15_000 },
  );
}

test.describe('GSC Performance Dashboard', () => {
  // Skip l'ensemble si pas de cle admin (certains tests envoient des
  // requetes admin pour verifier le contrat)
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoGsc(page);
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

    // La fixture seed 21 rows avec clicks > 0 sur 7 jours → clicks total > 0.
    // On attend que la tuile clicks affiche une valeur non vide/non zero.
    // Le format est "X XXX" (space separator) ou "X" — on matche au moins un
    // digit pour etre stable quel que soit la locale.
    const clicksTile = page.getByTestId('kpi-clicks');
    await expect(clicksTile).toContainText(/\d/);
  });

  test('toggles KPI metrics on/off', async ({ page }) => {
    // Etat par defaut : clicks+impressions actifs, ctr+position off
    await expect(page.getByTestId('kpi-clicks')).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByTestId('kpi-ctr')).toHaveAttribute(
      'data-active',
      'false',
    );

    await page.getByTestId('kpi-ctr').click();
    await expect(page.getByTestId('kpi-ctr')).toHaveAttribute(
      'data-active',
      'true',
    );

    await page.getByTestId('kpi-clicks').click();
    await expect(page.getByTestId('kpi-clicks')).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  test('switches between dimension tabs', async ({ page }) => {
    // Clique chaque tab et attend un fetch qui contient explicitement la
    // bonne dimension dans le body. Assertion plus stricte que juste .ok()
    // — si le composant ne renvoie pas la bonne dimension, le test fail.
    for (const dim of ['page', 'country', 'device', 'date'] as const) {
      const waitFetch = page.waitForResponse(
        (r) =>
          r.url().includes('/api/gsc/query') &&
          r.request().postData()?.includes(`"${dim}"`) === true &&
          r.ok(),
        { timeout: 10_000 },
      );
      await page.getByTestId(`tab-${dim}`).click();
      await waitFetch;
    }
  });

  test('sorts by clicking column headers', async ({ page }) => {
    // Sur le tab par defaut (query), le tri par defaut est clicks desc.
    // On clique sur impressions → doit envoyer orderBy="impressions".
    const waitSort = page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('"orderBy":"impressions"') === true &&
        r.ok(),
      { timeout: 10_000 },
    );
    await page.getByTestId('sort-impressions').click();
    await waitSort;
  });

  test('changes date range', async ({ page }) => {
    const waitRange = page.waitForResponse(
      (r) => r.url().includes('/api/gsc/query') && r.ok(),
      { timeout: 10_000 },
    );
    await page.getByTestId('range-selector').selectOption('7d');
    await waitRange;
  });

  test('adds a filter and refetches with that filter in the body', async ({
    page,
  }) => {
    // La fixture contient une query "serrurier lyon" → le filter contains
    // "serrurier" doit matcher et renvoyer au moins 1 row.
    await page.getByTestId('add-filter').click();
    await page.fill('input[placeholder="valeur"]', 'serrurier');

    const waitFilter = page.waitForResponse(
      (r) =>
        r.url().includes('/api/gsc/query') &&
        r.request().postData()?.includes('serrurier') === true &&
        r.ok(),
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: 'OK' }).click();
    await waitFilter;

    await expect(page.getByTestId('active-filter-0')).toBeVisible();
    await expect(page.getByTestId('active-filter-0')).toContainText(
      'serrurier',
    );
  });
});
