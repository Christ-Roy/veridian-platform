import { chromium } from '@playwright/test';

const URL = 'https://tramtech-depannage.fr/depannage-sanibroyeur-lyon';
const browser = await chromium.launch({ headless: false, slowMo: 300 });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const events = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('analytics.app.veridian.site/api/ingest')) {
    events.push({ url: u, body: req.postData() });
    console.log(`📡 POST ${u.split('/api/')[1]}`);
  }
});

console.log('→ Visite', URL);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

console.log('→ Scroll vers form');
const form = await page.waitForSelector('form[data-veridian-track="landing-contact"]', { timeout: 10000 });
await form.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

console.log('→ Remplit form');
await page.fill('input[name="nomComplet"]', 'TEST Analytics Veridian');
await page.fill('input[name="telephone"]', '0782924537');
await page.fill('input[name="email"]', 'robert@veridian.site');
// message/textarea si présent
const textarea = await page.$('textarea[name="message"]');
if (textarea) await textarea.fill('Test tracking Analytics — à ignorer, Robert');

await page.waitForTimeout(800);

console.log('→ Submit');
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

console.log(`\n=== ${events.length} events ===`);
events.forEach((e, i) => console.log(`${i+1}. ${e.url.split('/api/')[1]} | ${e.body?.slice(0, 180) ?? ''}`));

await browser.close();
