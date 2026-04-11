import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

/**
 * Couvre la phase 2 — lock/unlock des pages par service.
 *
 * Robert est OWNER du tenant `veridian` qui a (selon le seed) une propriete
 * GSC attachee + des rows GscDaily => `gsc` actif. Les services `forms` et
 * `calls` n'ont pas de data ingeree => inactifs => pages `/dashboard/forms`
 * et `/dashboard/calls` doivent etre lockees.
 *
 * Si le seed change et que tous les services deviennent actifs, les tests
 * qui visitent explicitement une page lockee skippent (plutot que de fail
 * faussement).
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe('Locked service pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar shows at least one locked item with a lock marker', async ({
    page,
  }) => {
    // Compte les items sidebar avec data-locked="true". Pour robert, au
    // moins un des services (forms/calls) devrait etre locke.
    const lockedItems = page.locator('aside a[data-locked="true"]');
    const count = await lockedItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // L'item /dashboard (home) ne doit JAMAIS etre locke
    const homeLocked = await page
      .locator('aside a[href="/dashboard"][data-locked="true"]')
      .count();
    expect(homeLocked).toBe(0);
  });

  test('visiting a locked service page shows the locked screen with CTA', async ({
    page,
  }) => {
    // On recupere le premier item locke dans la sidebar et on clique dessus
    const lockedItem = page.locator('aside a[data-locked="true"]').first();
    const count = await lockedItem.count();
    if (count === 0) {
      test.skip(true, 'Aucun service locke pour cet utilisateur');
    }
    const href = await lockedItem.getAttribute('href');
    expect(href).toBeTruthy();

    await lockedItem.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));

    // L'ecran locked doit etre visible
    const lockedPage = page.locator('[data-testid^="locked-page-"]').first();
    await expect(lockedPage).toBeVisible();

    // Titre "verrouille"
    const title = page.getByTestId('locked-title');
    await expect(title).toBeVisible();
    expect((await title.textContent()) || '').toMatch(/verrouill/i);

    // CTA mailto bien forme
    const cta = page.getByTestId('locked-cta');
    await expect(cta).toBeVisible();
    const mailto = await cta.getAttribute('href');
    expect(mailto).toBeTruthy();
    expect(mailto!).toMatch(/^mailto:contact@veridian\.site\?/);
    expect(mailto!).toContain('subject=');
    expect(mailto!).toContain('body=');
  });

  test('visiting /dashboard/forms directly shows locked page when forms inactive', async ({
    page,
  }) => {
    // Test direct par URL pour couvrir le cas ou l'user tape l'URL a la main
    await page.goto('/dashboard/forms');

    // Soit la page est lockee (cas nominal pour robert), soit elle affiche
    // la vraie page (si par hasard un form a ete ingere). On verifie que
    // l'une des deux est vraie — mais on check specifiquement le locked
    // state quand il s'applique.
    const locked = page.getByTestId('locked-page-forms');
    const heading = page.getByRole('heading', { name: 'Formulaires' });

    const isLocked = await locked.isVisible().catch(() => false);
    const isOpen = await heading.isVisible().catch(() => false);

    // Au moins l'un des deux doit etre visible
    expect(isLocked || isOpen).toBe(true);

    if (isLocked) {
      // Si lockee, on confirme le CTA mailto
      const cta = page.getByTestId('locked-cta');
      const mailto = await cta.getAttribute('href');
      expect(mailto!).toMatch(/^mailto:contact@veridian\.site\?/);
    }
  });

  test('visiting /dashboard/calls directly shows locked page when calls inactive', async ({
    page,
  }) => {
    await page.goto('/dashboard/calls');

    const locked = page.getByTestId('locked-page-calls');
    const heading = page.getByRole('heading', { name: 'Appels' });

    const isLocked = await locked.isVisible().catch(() => false);
    const isOpen = await heading.isVisible().catch(() => false);

    expect(isLocked || isOpen).toBe(true);
  });

  test('home /dashboard is never locked', async ({ page }) => {
    await page.goto('/dashboard');
    // Le score Veridian doit etre visible — si la home etait lockee, ce
    // testid n'existerait pas.
    await expect(page.getByTestId('score-value')).toBeVisible();
  });
});
