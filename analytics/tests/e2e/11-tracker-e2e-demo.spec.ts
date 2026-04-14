import { test, expect } from '@playwright/test';

/**
 * Core E2E — demo.veridian.site
 *
 * Tests du contrat fondamental entre un site client et Veridian Analytics.
 * Ces tests visitent le VRAI site en prod et vérifient que les beacons
 * partent correctement. Ils ne testent PAS les détails d'implémentation
 * (format des signaux, contenu exact des headers) — juste que le tracking
 * fonctionne de bout en bout.
 *
 * Règle : si un de ces tests casse, on ne ship pas.
 * Règle : ces tests ne doivent JAMAIS être skip.
 */

const DEMO_URL = 'https://demo.veridian.site';
const ANALYTICS_HOST = 'analytics-staging.veridian.site';

function interceptPosts(page: import('@playwright/test').Page, pathFragment: string) {
  const reqs: Array<Record<string, unknown>> = [];
  page.on('request', (req) => {
    if (
      req.url().includes(ANALYTICS_HOST) &&
      req.url().includes(pathFragment) &&
      req.method() === 'POST'
    ) {
      try { reqs.push(JSON.parse(req.postData() ?? '{}')); } catch {}
    }
  });
  return reqs;
}

test.describe('Core E2E — tracking contrat fondamental', () => {

  test('1. un pageview part quand on charge la home', async ({ page }) => {
    const pvs = interceptPosts(page, '/api/ingest/pageview');

    await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    expect(pvs.length, 'aucun pageview reçu — le tracker est cassé').toBeGreaterThanOrEqual(1);
    expect(pvs[0].path).toBe('/');
  });

  test('2. navigation SPA vers /contact produit un 2ème pageview', async ({ page }) => {
    const pvs = interceptPosts(page, '/api/ingest/pageview');

    await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.click('a[href="/contact"]');
    await page.waitForTimeout(3000);

    const paths = pvs.map(p => p.path);
    expect(paths.length, 'moins de 2 pageviews — SPA tracking cassé').toBeGreaterThanOrEqual(2);
    expect(paths).toContain('/contact');
  });

  test('3. soumission du formulaire /contact remonte avec email + formName', async ({ page }) => {
    const forms = interceptPosts(page, '/api/ingest/form');

    await page.goto(`${DEMO_URL}/contact`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.fill('input[name="entreprise"]', 'CoreTest SAS');
    await page.fill('input[name="email"]', 'core-test@veridian.site');
    await page.fill('input[name="phone"]', '+33600000000');
    await page.fill('textarea[name="message"]', 'Test automatisé — ne pas traiter');
    await page.waitForTimeout(300);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    expect(forms.length, 'aucun beacon form reçu — form tracking cassé').toBeGreaterThanOrEqual(1);
    expect(forms[0].formName).toBe('devis');
    expect(forms[0].email).toBe('core-test@veridian.site');
    expect(forms[0].phone).toBe('+33600000000');
    const payload = forms[0].payload as Record<string, string>;
    expect(payload.entreprise).toBe('CoreTest SAS');
  });

  test('4. clic sur un lien tel: remonte comme CTA', async ({ page }) => {
    const pvs = interceptPosts(page, '/api/ingest/pageview');

    await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // dispatchEvent pour ne pas ouvrir l'app téléphone
    await page.evaluate(() => {
      const link = document.querySelector('a[href^="tel:"]');
      if (link) link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2000);

    const ctas = pvs.filter(p => typeof p.referrer === 'string' && (p.referrer as string).startsWith('cta:tel:'));
    expect(ctas.length, 'clic tel: non tracké — CTA tracking cassé').toBeGreaterThanOrEqual(1);
  });

  test('5. le tracker ne provoque aucune erreur JS sur le site', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Simuler une visite normale : scroll + navigation
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);
    await page.click('a[href="/contact"]');
    await page.waitForTimeout(2000);

    expect(errors, 'erreurs JS détectées — le tracker crash le site client').toEqual([]);
  });
});
