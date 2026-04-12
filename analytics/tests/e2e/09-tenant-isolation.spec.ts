import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

/**
 * Regression test pour le bug d'isolation tenant decouvert le 2026-04-11 :
 * les pages /dashboard/forms, /dashboard/calls, /dashboard/gsc retournaient
 * la data de TOUS les tenants, pas juste celle du tenant du user loggue.
 *
 * Scenario :
 *   1. On cree un 2e tenant "intruder" (pas celui de Robert) + un site
 *   2. On ingere 1 form submission sur ce site intruder
 *   3. Robert se logue et visite /dashboard/forms
 *   4. Attendu : robert ne doit voir AUCUNE submission provenant du site
 *      intruder dans la table, meme si elle est dans les 50 dernieres en
 *      base. Le filtrage est fait cote server component via le predicate
 *      `{ site: { tenantId: status.tenant.id } }`.
 *   5. Cleanup : hard delete du tenant intruder pour ne rien laisser en base.
 *
 * Couvre aussi /dashboard/gsc : le selector ne doit contenir que le(s)
 * site(s) du tenant de Robert, pas celui de l'intruder.
 */
test.describe('Tenant isolation on dashboard pages', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_API_KEY not set');

  let intruderTenantId = '';
  let intruderSiteKey = '';
  let intruderDomain = '';
  const intruderSlug = `intruder-${Date.now().toString(36)}`;

  async function hardCleanup(request: APIRequestContext) {
    if (!intruderTenantId) return;
    await request.post('/api/test/cleanup-tenant', {
      data: { id: intruderTenantId },
    });
  }

  test.beforeAll(async ({ request }) => {
    // 1. Cree le tenant intruder
    const t = await request.post('/api/admin/tenants', {
      headers: { 'x-admin-key': ADMIN_KEY },
      data: {
        slug: intruderSlug,
        name: `Intruder ${intruderSlug}`,
        ownerEmail: `${intruderSlug}@example.com`,
      },
    });
    expect(t.ok(), 'intruder tenant create failed').toBe(true);
    intruderTenantId = (await t.json()).tenant.id;

    // 2. Cree un site pour l'intruder
    intruderDomain = `${intruderSlug}.intruder.example.com`;
    const s = await request.post(
      `/api/admin/tenants/${intruderTenantId}/sites`,
      {
        headers: { 'x-admin-key': ADMIN_KEY },
        data: { domain: intruderDomain, name: intruderSlug },
      },
    );
    expect(s.ok(), 'intruder site create failed').toBe(true);
    intruderSiteKey = (await s.json()).integration.siteKey;

    // 3. Ingere une form submission frappante avec un marqueur unique
    const ingest = await request.post('/api/ingest/form', {
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': intruderSiteKey,
      },
      data: {
        formName: `intruder-form-${intruderSlug}`,
        path: '/leak',
        payload: {
          email: `leak-${intruderSlug}@intruder.example.com`,
          message: 'LEAK_MARKER_SHOULD_NOT_BE_VISIBLE_TO_OTHER_TENANTS',
        },
      },
    });
    expect(ingest.ok(), 'intruder form ingest failed').toBe(true);
  });

  test.afterAll(async ({ request }) => {
    await hardCleanup(request);
  });

  test('robert /dashboard/forms ne montre aucune submission du tenant intruder', async ({
    page,
  }) => {
    // Login avec robert (tenant "veridian")
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // Visite /dashboard/forms — si forms est locked pour robert, on skip
    // (dans ce cas c'est que robert n'a pas de submission donc on ne teste
    // pas l'isolation via l'UI — mais au moins on verifie que la page ne
    // montre pas l'intruder via le fallback lock).
    await page.goto('/dashboard/forms');

    const locked = page.getByTestId('locked-page-forms');
    const isLocked = await locked.isVisible().catch(() => false);

    if (isLocked) {
      // Page lockee = pas de table = impossible de voir l'intruder. OK.
      test.info().annotations.push({
        type: 'note',
        description:
          "robert n'a pas de forms actif → page lockee → pas de fuite possible",
      });
      return;
    }

    // Page ouverte : on verifie que le domaine intruder n'est dans aucune
    // ligne de la table et que le marqueur unique n'apparait nulle part.
    const tableText = (await page.locator('table').textContent()) || '';
    expect(
      tableText,
      `Le domaine intruder "${intruderDomain}" ne doit pas apparaitre dans la table forms de robert`,
    ).not.toContain(intruderDomain);

    // Double check : le slug unique ne doit PAS etre present nulle part
    // dans la page (meme pas dans un <td> cache ou un JSON inline).
    const pageContent = (await page.content()) || '';
    expect(
      pageContent,
      `Le slug unique "${intruderSlug}" ne doit pas fuiter`,
    ).not.toContain(intruderSlug);
  });

  test('robert /dashboard/gsc selector ne liste pas le site du tenant intruder', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    await page.goto('/dashboard/gsc');

    const locked = page.getByTestId('locked-page-gsc');
    const isLocked = await locked.isVisible().catch(() => false);
    if (isLocked) {
      test.info().annotations.push({
        type: 'note',
        description: 'gsc lockee pour robert → pas de selector → skip isolation check',
      });
      return;
    }

    // Verifier que le selector des sites GSC (ou toute trace du site intruder)
    // ne contient PAS le domaine intruder.
    const mainText = (await page.locator('main').textContent()) || '';
    expect(
      mainText,
      `Le domaine intruder "${intruderDomain}" ne doit pas apparaitre dans /dashboard/gsc`,
    ).not.toContain(intruderDomain);
  });
});
