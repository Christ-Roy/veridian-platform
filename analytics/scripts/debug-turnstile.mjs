import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await browser.newContext().then(c => c.newPage());

page.on('console', msg => console.log(`[${msg.type()}] ${msg.text().slice(0, 150)}`));
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('turnstile') || u.includes('/api/devis') || u.includes('challenges')) {
    console.log(`  REQ ${r.method()} ${u.slice(0, 150)}`);
  }
});
page.on('response', async (r) => {
  if (r.url().includes('/api/devis')) {
    const body = await r.json().catch(() => ({}));
    console.log(`  RES ${r.status()} ${JSON.stringify(body)}`);
  }
});

await page.goto('https://tramtech-depannage.fr/depannage-sanibroyeur-lyon', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// Check si turnstile est chargé
const tsState = await page.evaluate(() => {
  return {
    turnstileLoaded: typeof window.turnstile !== 'undefined',
    sitekey: document.body.innerHTML.match(/0x4[A-Za-z0-9_-]+/)?.[0],
  };
});
console.log(`\n→ Turnstile script loaded: ${tsState.turnstileLoaded}`);
console.log(`→ Sitekey trouvée: ${tsState.sitekey}`);

const form = await page.$('form[data-veridian-track="landing-contact"]');
await form.scrollIntoViewIfNeeded();
await page.fill('input[name="nomComplet"]', 'Debug Turnstile');
await page.fill('input[name="telephone"]', '0612345678');
await page.fill('input[name="email"]', 'robert@veridian.site');

console.log('\n→ Submit form...');
await page.click('button[type="submit"]');
await page.waitForTimeout(12000);

await browser.close();
