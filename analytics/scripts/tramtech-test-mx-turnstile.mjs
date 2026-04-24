/**
 * Test Turnstile + MX lookup en browser réel :
 * 1. Typo email → vérifie que mailcheck suggère la correction
 * 2. Domaine inexistant → vérifie que le form affiche l'erreur MX
 * 3. Email valide → soumission normale passe
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://tramtech-depannage.fr';
const PAGE = `${BASE}/depannage-sanibroyeur-lyon`;

async function run(label, email, action) {
  console.log(`\n╔═══ ${label} ═══╗`);
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newContext().then(c => c.newPage());

  page.on('request', (r) => {
    if (r.url().includes('/api/devis')) console.log(`  → POST /api/devis`);
  });
  page.on('response', async (r) => {
    if (r.url().includes('/api/devis')) {
      const body = await r.json().catch(() => ({}));
      console.log(`  ← ${r.status()} ${JSON.stringify(body)}`);
    }
  });

  await page.goto(PAGE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const form = await page.$('form[data-veridian-track="landing-contact"]');
  await form.scrollIntoViewIfNeeded();
  await page.fill('input[name="nomComplet"]', 'Test MX');
  await page.fill('input[name="telephone"]', '0612345678');
  await page.fill('input[name="email"]', email);

  // Tab out pour trigger onBlur → mailcheck
  await page.press('input[name="email"]', 'Tab');
  await page.waitForTimeout(600);

  // Check si suggestion apparaît
  const suggestionBtn = await page.$('button:has-text("@")');
  if (suggestionBtn) {
    const text = await suggestionBtn.textContent();
    console.log(`  💡 Suggestion mailcheck : "${text}"`);
    if (action === 'accept-suggestion') {
      await suggestionBtn.click();
      await page.waitForTimeout(300);
      const fixed = await page.$eval('input[name="email"]', e => e.value);
      console.log(`  ✓ Email corrigé → ${fixed}`);
    }
  } else {
    console.log(`  (pas de suggestion mailcheck)`);
  }

  if (action !== 'skip-submit') {
    await page.click('button[type="submit"]');
    await page.waitForTimeout(7000);

    const errorEl = await page.$('.text-urgence');
    const submittedEl = await page.$('.bg-green-50');
    if (submittedEl) console.log(`  ✅ Form submis avec succès`);
    if (errorEl) {
      const err = await errorEl.textContent();
      console.log(`  ❌ Erreur affichée : "${err?.trim()}"`);
    }
  }

  await browser.close();
}

// 1. Typo → mailcheck suggère correction, on accepte
await run('Typo gmial.com → suggest gmail', 'robert@gmial.com', 'accept-suggestion');
// 2. Domaine inexistant → MX reject
await run('Domaine inexistant MX reject', 'robert@domaineinexistantbidon12345.xyz', 'submit');
// 3. Email valide → passe
await run('Email valide → submit OK', 'robert@veridian.site', 'submit');
