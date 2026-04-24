import { chromium } from '@playwright/test';

const PAGE_URL = 'https://tramtech-depannage.fr/depannage-sanibroyeur-lyon';
const browser = await chromium.launch({ headless: false, slowMo: 300 });
const page = await browser.newContext().then(c => c.newPage());

page.on('console', msg => console.log(`[console] ${msg.text()}`));
page.on('pageerror', err => console.log(`[ERROR] ${err.message}`));

page.on('request', (req) => {
  const u = req.url();
  if (u.includes('google-analytics.com/g/collect')) {
    const params = new globalThis.URL(u).searchParams;
    console.log(`🔵 GA4: en=${params.get('en')} ${params.get('ep.form_name') ? 'form='+params.get('ep.form_name') : ''} ${params.get('ep.phone_number') ? 'phone='+params.get('ep.phone_number') : ''}`);
  }
});
page.on('response', async (res) => {
  if (res.url().includes('/depannage-sanibroyeur-lyon') && res.request().method() === 'POST') {
    console.log(`📨 Server action POST ${res.status()}`);
  }
});

await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const form = await page.$('form[data-veridian-track="landing-contact"]');
await form.scrollIntoViewIfNeeded();
await page.fill('input[name="nomComplet"]', 'TEST GA4 FullFlow');
await page.fill('input[name="telephone"]', '0782924537');
await page.fill('input[name="email"]', 'robert@veridian.site');
console.log('→ Submit');
await page.click('button[type="submit"]');

// Attendre jusqu'à 15s pour voir le result
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const dl = await page.evaluate(() => (window.dataLayer ?? []).map(e => e.event || 'n/a'));
  const hasFormSubmit = dl.includes('form_submit');
  const submitted = await page.$('.bg-green-50');
  if (hasFormSubmit || submitted) {
    console.log(`t=${i+1}s dataLayer events: ${JSON.stringify(dl)}`);
    console.log(`submitted UI: ${!!submitted}`);
    break;
  }
  if (i === 14) {
    console.log(`TIMEOUT — dataLayer final: ${JSON.stringify(dl)}`);
    const err = await page.$eval('form', el => el.textContent).catch(()=>'');
    console.log(`Form DOM extrait: ${err.slice(0,200)}`);
  }
}

await page.waitForTimeout(3000);
await browser.close();
