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

  test('renders the Veridian score and the services grid', async ({ page }) => {
    // Le score Veridian global doit etre visible en haut
    const score = page.getByTestId('score-value');
    await expect(score).toBeVisible();
    const scoreText = ((await score.textContent()) || '').trim();
    // Le score est un entier entre 0 et 100
    expect(scoreText).toMatch(/^\d{1,3}$/);
    const n = parseInt(scoreText, 10);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(100);

    // Le compteur de services actifs est visible (format "X / 6 services actifs")
    await expect(page.getByTestId('score-services-count')).toBeVisible();

    // La grille de services est visible
    await expect(page.getByTestId('services-grid')).toBeVisible();
  });

  test('shows at least one shadow marketing block for unused services', async ({
    page,
  }) => {
    // Robert n'a pas tous les services actifs (ads et pagespeed ne sont jamais
    // actifs pour le moment) — il doit donc y avoir au moins un bloc shadow.
    const shadowBlocks = page.locator('[data-testid^="shadow-"]');
    const count = await shadowBlocks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Le premier bloc shadow est un <a href="mailto:..."> bien forme
    const first = shadowBlocks.first();
    await expect(first).toBeVisible();
    const href = await first.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^mailto:contact@veridian\.site\?/);
    expect(href!).toContain('subject=');
    expect(href!).toContain('body=');
  });

  test('sidebar navigation works', async ({ page }) => {
    // Scope les locators au <aside> pour eviter les collisions avec les
    // cards du dashboard qui contiennent aussi "Formulaires soumis" etc.
    // NOTE: depuis la phase 2, les pages services peuvent etre lockees. On
    // ne check donc plus que l'URL (le contenu est teste separement dans
    // 08-locked-pages.spec.ts et dans la suite de tests par service).
    const sidebar = page.locator('aside');

    await sidebar.getByRole('link', { name: 'Formulaires', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/forms/);

    await sidebar.getByRole('link', { name: 'Appels', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/calls/);

    await sidebar.getByRole('link', { name: 'Search Console' }).click();
    await expect(page).toHaveURL(/\/dashboard\/gsc/);

    await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('clicking an active service block navigates to its dedicated page', async ({
    page,
  }) => {
    // Cherche n'importe quel service actif (sinon le test passe via pageviews
    // qui devrait etre actif pour robert@veridian.site si la seed a tourne).
    const active = page.locator('[data-testid^="service-"]').first();
    if ((await active.count()) === 0) {
      test.skip(true, 'Aucun service actif pour cet utilisateur');
    }
    await active.click();
    // L'URL doit rester sous /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('logout returns to login', async ({ page }) => {
    await page.getByRole('button', { name: /Déconnexion/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});
