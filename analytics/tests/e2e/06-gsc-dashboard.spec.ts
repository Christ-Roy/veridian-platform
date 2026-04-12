import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

/**
 * Tests du clone GSC Performance Dashboard.
 *
 * Isolation : chaque run cree SA propre fixture via POST /api/test/seed-gsc
 * (qui renvoie tenantId + siteId + 21 rows GscDaily deterministes), puis
 * nettoie en afterAll via POST /api/test/cleanup-tenant.
 *
 * Aucun de ces tests ne depend d'un etat global : le site selector est
 * force explicitement sur notre fixture siteId pour eviter les collisions
 * avec d'autres sites (seed CI, tests precedents, etc.).
 *
 * Les APIs /api/test/* sont guardees par lib/test-apis.ts (404 en prod).
 */

type SeedResponse = {
  ok: true;
  tenant: { id: string; slug: string; name: string };
  site: { id: string; domain: string; name: string };
  user: { id: string; email: string };
  gscRows: number;
};

async function seedFixture(request: APIRequestContext): Promise<SeedResponse> {
  const res = await request.post('/api/test/seed-gsc', {
    data: {
      ownerEmail: EMAIL,
      suffix: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      days: 7,
    },
  });
  expect(res.ok(), 'seed-gsc API must be enabled (ENABLE_TEST_APIS=true)').toBe(
    true,
  );
  return (await res.json()) as SeedResponse;
}

async function cleanupFixture(
  request: APIRequestContext,
  tenantId: string,
): Promise<void> {
  await request.post('/api/test/cleanup-tenant', {
    data: { id: tenantId },
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

/**
 * Navigue sur /dashboard/gsc apres login et force le site selector sur
 * la fixture precisee, en attendant le fetch /api/gsc/query qui en decoule.
 * Tous les tests GSC ci-dessous demarrent par ce helper pour etre sur d'etre
 * dans un etat ou le dashboard est pleinement charge avec NOS data.
 */
async function gotoGscWithFixture(page: Page, siteId: string) {
  await page.goto('/dashboard/gsc');
  await expect(page.getByTestId('gsc-dashboard')).toBeVisible();
  // Attend que le site selector soit peuple, puis force notre site.
  const selector = page.getByTestId('site-selector');
  await expect(selector).toBeVisible();
  await selector.selectOption(siteId);
  // Le changement de site declenche un fetch — on l'attend pour eviter les
  // races downstream. On matche large : n'importe quelle reponse ok sur
  // /api/gsc/query concerne notre site vu qu'on vient de le selectionner.
  await page.waitForResponse(
    (r) => r.url().includes('/api/gsc/query') && r.ok(),
    { timeout: 10_000 },
  );
}

test.describe('GSC Performance Dashboard', () => {
  let fixture: SeedResponse;

  test.beforeAll(async ({ request }) => {
    fixture = await seedFixture(request);
  });

  test.afterAll(async ({ request }) => {
    if (fixture?.tenant?.id) {
      await cleanupFixture(request, fixture.tenant.id);
    }
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoGscWithFixture(page, fixture.site.id);
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

  test('renders 4 KPI tiles with values from fixture', async ({ page }) => {
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
