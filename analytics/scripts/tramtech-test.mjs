import { chromium } from '@playwright/test';

const URL = 'https://tramtech-depannage.fr/depannage-sanibroyeur-lyon';
const browser = await chromium.launch({ headless: false, slowMo: 500 });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const events = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('analytics.app.veridian.site/api/ingest')) {
    events.push({ url: u, method: req.method(), body: req.postData() });
    console.log(`📡 ${req.method()} ${u.split('/api/')[1]}`);
  }
});

console.log('→ Visite', URL);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('→ Scroll');
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(1000);

console.log('→ Clic CTA tel:');
const telLink = await page.$('a[href^="tel:"]');
if (telLink) {
  await telLink.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
}

console.log('→ Visite /remplacement-sanibroyeur-lyon');
await page.goto('https://tramtech-depannage.fr/remplacement-sanibroyeur-lyon', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log(`\n=== ${events.length} events interceptés ===`);
events.forEach((e, i) => console.log(`${i+1}. ${e.method} ${e.url.split('/api/')[1]} | ${e.body?.slice(0, 120) ?? ''}`));

await browser.close();
