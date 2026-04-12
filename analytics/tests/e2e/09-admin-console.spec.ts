import { test, expect, Page } from '@playwright/test';

/**
 * Couvre la console /admin (task #3).
 *
 * Prerequis : `robert@veridian.site` doit avoir role=SUPERADMIN (applique
 * via `pnpm exec node scripts/seed-superadmin.mjs robert@veridian.site`).
 * Si le role n'est pas set, les tests de la console redirect vers
 * /dashboard — on le detecte et on skip (plutot que fail opaquement).
 */

const ROBERT_EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const ROBERT_PASSWORD = process.env.E2E_PASSWORD || 'test1234';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe('Admin console — SUPERADMIN', () => {
  test('Robert accede a /admin et voit la liste des tenants', async ({
    page,
  }) => {
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);
    await page.goto('/admin');

    // Si Robert n'est pas SUPERADMIN, /admin redirect vers /dashboard
    if (!page.url().includes('/admin')) {
      test.skip(true, 'Robert n est pas SUPERADMIN — run seed-superadmin.mjs');
    }

    await expect(
      page.getByTestId('admin-banner'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Console plateforme/i }),
    ).toBeVisible();

    // Au moins un tenant (veridian) doit apparaitre dans la liste
    const cards = page.getByTestId('admin-tenant-card');
    await expect(cards.first()).toBeVisible();
  });

  test('Ouvrir le dashboard d un autre tenant affiche le bandeau impersonation', async ({
    page,
  }) => {
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);
    await page.goto('/admin');
    if (!page.url().includes('/admin')) {
      test.skip(true, 'Robert n est pas SUPERADMIN');
    }

    // On cherche un lien "Ouvrir le dashboard client" et on click le premier
    const openLink = page.locator('[data-testid^="open-dashboard-"]').first();
    const count = await openLink.count();
    if (count === 0) {
      test.skip(true, 'aucun tenant dans /admin pour tester impersonation');
    }
    // On verifie que l'URL contient ?asTenant=
    const href = await openLink.getAttribute('href');
    expect(href).toMatch(/asTenant=/);

    await openLink.click();
    await page.waitForURL(/\/dashboard\?asTenant=/, { timeout: 10_000 });

    // Le bandeau impersonation doit apparaitre
    await expect(page.getByTestId('impersonation-banner')).toBeVisible();
    await expect(page.getByTestId('exit-impersonation')).toBeVisible();
  });
});

test.describe('Admin console — MEMBER', () => {
  test('user non-superadmin est redirige vers /dashboard', async ({ page }) => {
    // On reutilise Robert mais on assume qu'il peut ne PAS etre SUPERADMIN.
    // Dans ce cas, ce test valide la redirection. Si Robert EST superadmin,
    // on skip car on n'a pas de second user seed.
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);
    await page.goto('/admin');
    const finalUrl = page.url();
    if (finalUrl.includes('/admin')) {
      test.skip(
        true,
        'Robert est SUPERADMIN — pas de MEMBER de test pour valider le deny',
      );
    }
    expect(finalUrl).toMatch(/\/dashboard/);
  });
});
