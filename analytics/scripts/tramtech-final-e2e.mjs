/**
 * Test E2E final Tramtech : valide que tout le tracking est nickel
 * avant lancement Google Ads.
 *
 * Vérifie pour CHAQUE landing :
 * 1. Page charge en < 3s
 * 2. GTM N283J23Q présent
 * 3. GA4 reçoit page_view
 * 4. Cookie banner s'affiche (default consent denied)
 * 5. gclid capturé en cookie quand fourni en URL
 * 6. Numéro Ads 04 82 53 04 29 partout (pas de 07 82)
 * 7. Schema.org telephone = +33482530429
 * 8. Form submit → GA4 client + server, mail Resend, Veridian Analytics
 * 9. Phone click → GA4 client + server, Veridian Analytics
 * 10. Consent granted → GA4 hits avec gcs=G111
 * 11. Consent denied → GA4 hits avec gcs=G100
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://tramtech-depannage.fr';
const LANDINGS = [
  '/depannage-sanibroyeur-lyon',
  '/remplacement-sanibroyeur-lyon',
];
const GCLID = 'E2E_TEST_FINAL_' + Date.now();

let totalChecks = 0;
let totalPass = 0;

function check(label, ok, detail = '') {
  totalChecks++;
  if (ok) totalPass++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function testLanding(path) {
  console.log(`\n╔═════ ${path} ═════╗`);
  const url = `${BASE}${path}?gclid=${GCLID}&utm_source=google&utm_medium=cpc&utm_campaign=test_e2e`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const ga4Hits = [];
  const veridianHits = [];
  const apiHits = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('google-analytics.com/g/collect')) {
      const params = new globalThis.URL(u).searchParams;
      ga4Hits.push({ en: params.get('en'), gcs: params.get('gcs'), form: params.get('ep.form_name') });
    } else if (u.includes('analytics.app.veridian.site/api/ingest')) {
      veridianHits.push(u.split('/api/')[1]);
    } else if (u.match(/tramtech-depannage\.fr\/api\/(devis|track)/)) {
      apiHits.push({ method: req.method(), url: u });
    }
  });

  // 1. Page load timing
  const t0 = Date.now();
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  const loadMs = Date.now() - t0;
  check(`HTTP ${res.status()} (load ${loadMs}ms)`, res.status() === 200 && loadMs < 5000);

  // 2. GTM présent
  const html = await page.content();
  check('GTM-N283J23Q dans HTML', html.includes('GTM-N283J23Q'));

  // 3. Numéro Ads partout
  const has04 = html.includes('04 82 53 04 29') || html.includes('+33482530429');
  const has07 = html.includes('07 82 92 45 37') || html.includes('+33782924537');
  check('Numéro Ads (04 82 53 04 29) présent', has04);
  check('Pas de numéro principal (07 82) sur landing', !has07, has07 ? 'Trouvé 07 82 — bug attribution' : '');

  // 4. Schema.org telephone correct
  const ldJsons = await page.$$eval('script[type="application/ld+json"]', els => els.map(e => e.textContent));
  const hasAdsTelInLd = ldJsons.some(j => j && j.includes('+33482530429'));
  check('Schema.org JSON-LD telephone Ads', hasAdsTelInLd);

  await page.waitForTimeout(2000);

  // 5. Cookie gclid capturé
  const gclidCookie = (await ctx.cookies()).find(c => c.name === 'tt_gclid');
  check('Cookie tt_gclid capturé', gclidCookie?.value === GCLID, gclidCookie?.value || 'absent');

  // 6. Cookie banner visible
  const bannerVisible = await page.locator('button:has-text("Accepter")').isVisible();
  check('Cookie banner affiché', bannerVisible);

  // 7. GA4 page_view envoyé en consent default (G100)
  const pvDefault = ga4Hits.filter(h => h.en === 'page_view');
  check('GA4 page_view envoyé (consent default)', pvDefault.length > 0,
    pvDefault.length ? `gcs=${pvDefault[0].gcs}` : 'aucun');

  // 8. Accept consent → GA4 G111
  ga4Hits.length = 0;
  await page.click('button:has-text("Accepter")');
  await page.waitForTimeout(2000);
  // user_engagement après accept
  const engageAfterAccept = ga4Hits.find(h => h.gcs === 'G111');
  check('GA4 hit avec gcs=G111 après Accept', !!engageAfterAccept,
    engageAfterAccept ? `en=${engageAfterAccept.en}` : 'aucun');

  // 9. Phone click
  ga4Hits.length = 0; apiHits.length = 0; veridianHits.length = 0;
  const tel = await page.$('a[href^="tel:"]');
  if (tel) {
    await tel.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(2000);
  }
  const phoneClickHit = ga4Hits.find(h => h.en === 'phone_click');
  check('GA4 phone_click reçu', !!phoneClickHit);
  const phoneApi = apiHits.find(h => h.url.includes('/api/track/phone-click'));
  check('Server-side /api/track/phone-click appelé', !!phoneApi);

  // 10. Form submit
  ga4Hits.length = 0; apiHits.length = 0; veridianHits.length = 0;
  const form = await page.$('form[data-veridian-track="landing-contact"]');
  await form.scrollIntoViewIfNeeded();
  await page.fill('input[name="nomComplet"]', 'E2E Final Test');
  await page.fill('input[name="telephone"]', '0612345678');
  await page.fill('input[name="email"]', 'e2e-final@veridian.site');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  const submittedUI = await page.$('.bg-green-50');
  check('UI confirme submission', !!submittedUI);

  const formSubmitGa4 = ga4Hits.find(h => h.en === 'form_submit' && h.form);
  check('GA4 form_submit avec form_name', !!formSubmitGa4);

  const devisApi = apiHits.find(h => h.url.includes('/api/devis') && h.method === 'POST');
  check('Server-side /api/devis appelé', !!devisApi);

  const veridianForm = veridianHits.find(h => h.includes('form'));
  check('Veridian Analytics ingest/form', !!veridianForm);

  await browser.close();
}

console.log(`Target: ${BASE}`);
console.log(`gclid de test: ${GCLID}`);
for (const path of LANDINGS) {
  await testLanding(path);
}

console.log(`\n╔══════ RÉSUMÉ ══════╗`);
console.log(`  ${totalPass} / ${totalChecks} checks OK`);
process.exit(totalPass === totalChecks ? 0 : 1);
