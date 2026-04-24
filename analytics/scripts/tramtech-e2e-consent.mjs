import { chromium } from '@playwright/test';

const PAGE_URL = (process.env.BASE_URL || 'https://preprod.tramtech-depannage.fr') + '/depannage-sanibroyeur-lyon?gclid=TEST_GCLID_12345&utm_source=google&utm_medium=cpc&utm_campaign=test';

const scenarios = [
  { name: 'no-consent (default denied)', action: 'none' },
  { name: 'consent granted', action: 'accept' },
  { name: 'consent denied explicit', action: 'refuse' },
];

for (const sc of scenarios) {
  console.log(`\n╔═══ SCENARIO: ${sc.name.toUpperCase()} ═══╗`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const gaHits = [];
  const veridianHits = [];

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('google-analytics.com/g/collect') || u.includes('analytics.google.com/g/collect')) {
      const params = new globalThis.URL(u).searchParams;
      gaHits.push({
        en: params.get('en'),
        gcs: params.get('gcs'), // consent signal
        gcd: params.get('gcd'), // consent default
        form: params.get('ep.form_name'),
        phone: params.get('ep.phone_number'),
      });
    } else if (u.includes('analytics.app.veridian.site/api/ingest')) {
      veridianHits.push(u.split('/api/')[1]);
    }
  });

  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Vérifier gclid capturé en cookie
  const gclidCookie = (await ctx.cookies()).find(c => c.name === 'tt_gclid');
  console.log(`  Cookie gclid: ${gclidCookie?.value ?? 'MANQUANT'}`);

  // Consent action
  if (sc.action === 'accept') {
    await page.click('button:has-text("Accepter")').catch(() => {});
    await page.waitForTimeout(1500);
  } else if (sc.action === 'refuse') {
    await page.click('button:has-text("Refuser")').catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Clic tel
  const telLink = await page.$('a[href^="tel:"]');
  if (telLink) {
    await telLink.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(1500);
  }

  // Submit form
  const form = await page.$('form[data-veridian-track="landing-contact"]');
  if (form) {
    await form.scrollIntoViewIfNeeded();
    await page.fill('input[name="nomComplet"]', 'TEST E2E Consent');
    await page.fill('input[name="telephone"]', '0782924537');
    await page.fill('input[name="email"]', 'robert@veridian.site');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
  }

  console.log(`  GA4 hits: ${gaHits.length}`);
  gaHits.forEach((h, i) => {
    const extras = [h.form && `form=${h.form}`, h.phone && `phone=${h.phone}`, h.gcs && `gcs=${h.gcs}`].filter(Boolean).join(' ');
    console.log(`    ${i+1}. en=${h.en} ${extras}`);
  });
  console.log(`  Veridian hits: ${veridianHits.length} → ${veridianHits.join(', ')}`);

  await browser.close();
}

console.log('\n=== INTERPRÉTATION ===');
console.log('Cookie gclid : doit être présent dans TOUS les scénarios (1st party, pas bloqué par consent)');
console.log('GA4 hits en no-consent : doivent avoir gcs=G100 (denied storage), events arrivent en mode modélisé');
console.log('GA4 hits en granted : gcs=G111 (tout granted) + phone_click/form_submit complets');
console.log('Veridian hits : même nombre dans tous les scénarios (serveur interne, pas concerné par consent)');
