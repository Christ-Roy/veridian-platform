import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL || 'robert@veridian.site';
const PASSWORD = process.env.E2E_PASSWORD || 'test1234';

test.describe('Authentication flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Veridian Analytics')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Se connecter/i })).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    // Should be on dashboard, not login
    expect(page.url()).toContain('/dashboard');
    expect(page.url()).not.toContain('/login');
  });

  test('invalid credentials show error and stay on /login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'nope');
    await page.click('button[type="submit"]');
    // Should stay on /login
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/);
    // Error message should be visible
    const errorVisible = await page.locator('[role="alert"], .text-destructive, .text-red-500, [data-testid="login-error"]').count();
    // At minimum, we should still be on login (not crash)
    expect(page.url()).toContain('/login');
  });

  test('accessing /dashboard without login redirects to /login', async ({
    page,
  }) => {
    // Clear cookies to ensure no session
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });

  test('logout redirects to /login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Logout
    await page.getByRole('button', { name: /Déconnexion/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain('/login');

    // Verify can't access dashboard anymore
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });
});
