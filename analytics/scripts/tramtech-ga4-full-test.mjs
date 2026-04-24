import { chromium } from '@playwright/test';

const PAGE_URL = 'https://tramtech-depannage.fr/depannage-sanibroyeur-lyon';
const browser = await chromium.launch({ headless: false, slowMo: 400 });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const gaHits = [];
const gtmHits = [];
const dlEvents = [];

page.on('request', (req) => {
  const u = req.url();
  if (u.includes('google-analytics.com/g/collect') || u.includes('analytics.google.com/g/collect')) {
    const params = new URL(u).searchParams;
    gaHits.push({ en: params.get('en'), ep_form: params.get('ep.form_name'), ep_phone: params.get('ep.phone_number'), dl: params.get('dl') });
    console.log(`🔵 GA4 hit: en=${params.get('en')} | dl=${params.get('dl')?.slice(-40)}`);
  } else if (u.includes('googletagmanager.com')) {
    gtmHits.push(u);
  }
});

console.log('→ Visite', PAGE_URL);
await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Vérifier que GTM + dataLayer sont chargés
const state = await page.evaluate(() => ({
  hasDataLayer: typeof window.dataLayer !== 'undefined',
  dataLayerLength: window.dataLayer?.length ?? 0,
  events: (window.dataLayer ?? []).map(e => e.event).filter(Boolean),
}));
console.log('→ dataLayer state:', state);

console.log('\n→ Clic tel: (hero)');
const telLink = await page.$('a[href^="tel:"]');
if (telLink) {
  await telLink.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
}

console.log('\n→ Submit form');
const form = await page.$('form[data-veridian-track="landing-contact"]');
if (form) {
  await form.scrollIntoViewIfNeeded();
  await page.fill('input[name="nomComplet"]', 'TEST GA4 Veridian');
  await page.fill('input[name="telephone"]', '0782924537');
  await page.fill('input[name="email"]', 'robert@veridian.site');
  const ta = await page.$('textarea[name="message"]');
  if (ta) await ta.fill('Test GA4 tracking - ignore Robert');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

// Récup l'état final du dataLayer
const finalDL = await page.evaluate(() =>
  (window.dataLayer ?? []).map(e => e.event).filter(Boolean)
);

console.log('\n=== RÉSULTATS ===');
console.log(`dataLayer events: ${JSON.stringify(finalDL)}`);
console.log(`GTM hits: ${gtmHits.length}`);
console.log(`GA4 hits: ${gaHits.length}`);
gaHits.forEach((h, i) => console.log(`  ${i+1}. en=${h.en} ${h.ep_form ? 'form='+h.ep_form : ''} ${h.ep_phone ? 'phone='+h.ep_phone : ''}`));

await browser.close();
