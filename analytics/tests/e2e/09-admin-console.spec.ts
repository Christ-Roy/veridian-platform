import { test, expect, Page } from '@playwright/test';

/**
 * Tests complets de la console /admin + impersonation + navigation dashboard.
 *
 * Couvre :
 * 1. Accès /admin avec login SUPERADMIN
 * 2. Impersonation tenant via "Ouvrir le dashboard client" (server action + cookie)
 * 3. Navigation sur CHAQUE page du dashboard impersoné
 * 4. Vérification zéro erreur JS console sur chaque page
 * 5. Retour à /admin via "Quitter le mode admin"
 *
 * Prerequis : robert@veridian.site doit être SUPERADMIN + au moins 1 tenant avec un site.
 */

const ROBERT_EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const ROBERT_PASSWORD = process.env.E2E_PASSWORD || 'test1234';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

/** Collect console errors during a callback. Returns array of error messages. */
async function collectConsoleErrors(page: Page, fn: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  const handler = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore known benign errors
      if (text.includes('tabs:outgoing.message.ready')) return; // Chrome extension
      if (text.includes('WebGPU')) return; // Google Translate
      if (text.includes('xr-spatial-tracking')) return; // Google Translate
      errors.push(text);
    }
  };
  page.on('console', handler);
  await fn();
  page.off('console', handler);
  return errors;
}

// All dashboard pages to visit during impersonation
const DASHBOARD_PAGES = [
  { path: '/dashboard', name: 'Dashboard home' },
  { path: '/dashboard/forms', name: 'Formulaires' },
  { path: '/dashboard/calls', name: 'Appels' },
  { path: '/dashboard/gsc', name: 'Search Console' },
  { path: '/dashboard/push', name: 'Notifications' },
  { path: '/dashboard/settings', name: 'Paramètres' },
];

test.describe('Admin console — SUPERADMIN', () => {
  test('accede a /admin et voit la liste des tenants', async ({ page }) => {
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/admin')) {
      test.skip(true, 'Robert n est pas SUPERADMIN — run seed-superadmin.mjs');
    }

    await expect(
      page.getByRole('heading', { name: /Console plateforme/i }),
    ).toBeVisible({ timeout: 15_000 });

    const cards = page.getByTestId('admin-tenant-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  });

  test('impersonate tenant → dashboard → chaque page → retour admin', async ({
    page,
  }) => {
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/admin')) {
      test.skip(true, 'Robert n est pas SUPERADMIN');
    }

    // Click "Ouvrir le dashboard client" on first tenant
    // It's a <form> with a server action (button submit), not an <a>
    const openBtn = page.locator('[data-testid^="open-dashboard-"]').first();
    await expect(openBtn).toBeVisible({ timeout: 10_000 });

    // Click and wait for redirect to /dashboard (server action sets cookie + redirects)
    await openBtn.click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Impersonation banner should be visible
    const banner = page.locator('text=Mode admin');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Visit EVERY dashboard page and check for JS errors
    for (const dp of DASHBOARD_PAGES) {
      const errors = await collectConsoleErrors(page, async () => {
        await page.goto(dp.path);
        await page.waitForLoadState('networkidle');
        // Give the page a moment to render and potentially throw
        await page.waitForTimeout(1000);
      });

      // No JS errors allowed
      expect(errors, `JS errors on ${dp.name} (${dp.path})`).toEqual([]);

      // Page should not have redirected to login
      expect(page.url()).not.toContain('/login');

      // Impersonation banner should still be visible on every page
      await expect(
        page.locator('text=Mode admin'),
        `Impersonation banner missing on ${dp.name}`,
      ).toBeVisible({ timeout: 5_000 });
    }

    // Exit impersonation — click "Quitter le mode admin"
    await page.locator('text=Quitter le mode admin').click();
    await page.waitForURL(/\/admin/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    // Should be back on /admin without impersonation
    await expect(
      page.getByRole('heading', { name: /Console plateforme/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('chaque page dashboard sans impersonation charge sans erreur', async ({
    page,
  }) => {
    await loginAs(page, ROBERT_EMAIL, ROBERT_PASSWORD);

    for (const dp of DASHBOARD_PAGES) {
      const errors = await collectConsoleErrors(page, async () => {
        await page.goto(dp.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      });

      expect(errors, `JS errors on ${dp.name} (${dp.path})`).toEqual([]);
      expect(page.url()).not.toContain('/login');
    }
  });
});

test.describe('Admin console — access control', () => {
  test('/admin redirige un non-SUPERADMIN vers /dashboard', async ({ page }) => {
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
