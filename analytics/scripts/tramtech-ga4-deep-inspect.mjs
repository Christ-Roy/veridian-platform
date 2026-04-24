/**
 * Deep inspection des payloads GA4 pour valider :
 * - Enhanced Conversions : em (email hashé), ph (phone hashé) présents
 * - gclid propagé dans les events
 * - Conversion events (form_submit, phone_click) avec les bons params
 * - GCS consent signal cohérent avec le scénario
 */
import { chromium } from '@playwright/test';
import { createHash } from 'crypto';

const BASE = process.env.BASE_URL || 'https://tramtech-depannage.fr';
const PAGE_URL = `${BASE}/depannage-sanibroyeur-lyon?gclid=DEEP_TEST_67890&utm_source=google&utm_medium=cpc`;

function sha256Hex(s) {
  return createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
}

async function runScenario(name, action) {
  console.log(`\n╔══════ ${name.toUpperCase()} ══════╗`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const rawHits = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('google-analytics.com/g/collect') || u.includes('analytics.google.com/g/collect')) {
      const url = new globalThis.URL(u);
      const post = req.postData();
      rawHits.push({ url: u, query: Object.fromEntries(url.searchParams), post });
    }
  });

  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  if (action === 'accept') {
    await page.click('button:has-text("Accepter")').catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Clic tel
  const tel = await page.$('a[href^="tel:"]');
  if (tel) {
    await tel.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(1500);
  }

  // Submit form
  const form = await page.$('form[data-veridian-track="landing-contact"]');
  if (form) {
    await form.scrollIntoViewIfNeeded();
    await page.fill('input[name="nomComplet"]', 'John Durand');
    await page.fill('input[name="telephone"]', '0612345678');
    await page.fill('input[name="email"]', 'john.durand@example.com');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4500);
  }

  await browser.close();

  // Analyse
  console.log(`  Total hits GA4: ${rawHits.length}`);
  const expectedEmailHash = sha256Hex('john.durand@example.com');
  const expectedPhoneHash = sha256Hex('+33612345678');
  const expectedPhoneRaw = sha256Hex('0612345678');

  const findings = {
    hasConsentSignal: false,
    hasPhoneClick: false,
    hasFormSubmit: false,
    hasFormSubmitCustomParam: false,
    hasEmailHash: false,
    hasPhoneHash: false,
    hasGclid: false,
    gcsValues: new Set(),
  };

  for (const [i, hit] of rawHits.entries()) {
    const q = hit.query;
    const en = q.en;
    const gcs = q.gcs;
    if (gcs) findings.gcsValues.add(gcs);

    console.log(`  [${i+1}] en=${en || '?'} gcs=${gcs || '?'}`);

    // Parse body (events batch)
    const body = hit.post || '';
    const lines = body.split('\n');
    // Chaque ligne = un event avec params query-string style
    for (const line of lines) {
      if (!line.trim()) continue;
      const lp = new globalThis.URLSearchParams(line);
      const lineEn = lp.get('en') || en;
      // Look for enhanced conversions params (in query or body)
      const allParams = { ...Object.fromEntries(lp), ...q };
      // em/ph sont potentiellement sur le hit user_data via up.* ou direct
      for (const [k, v] of Object.entries(allParams)) {
        if (k.toLowerCase() === 'em' || k.endsWith('.em') || k === 'user_data.email_address' || k === 'ep.user_data.email_address') {
          findings.hasEmailHash = true;
          console.log(`      ✓ email param found: ${k}=${v.slice(0, 20)}... (attendu: ${expectedEmailHash.slice(0,20)}...)`);
        }
        if (k.toLowerCase() === 'ph' || k.endsWith('.ph') || k === 'user_data.phone_number' || k === 'ep.user_data.phone_number') {
          findings.hasPhoneHash = true;
          console.log(`      ✓ phone param found: ${k}=${v.slice(0, 20)}...`);
        }
        if (k === 'epn.gclid' || k === 'ep.gclid' || k === 'gclid') {
          findings.hasGclid = true;
        }
      }
      if (lineEn === 'phone_click' || en === 'phone_click') findings.hasPhoneClick = true;
      if (lineEn === 'form_submit' || en === 'form_submit') {
        findings.hasFormSubmit = true;
        if (allParams['ep.form_name']) findings.hasFormSubmitCustomParam = true;
      }
    }

    // Dump keys intéressants de la query
    const interestingKeys = Object.keys(q).filter(k =>
      /^(ep\.|epn\.|up\.|upn\.|user_|em$|ph$)/.test(k) || k === 'gcs' || k === 'gcd'
    );
    if (interestingKeys.length) {
      console.log(`      params: ${interestingKeys.map(k => `${k}=${q[k]?.slice(0,30)}`).join(' | ')}`);
    }

    // Body dump si présent
    if (body && body.length > 0) {
      const bodyKeys = new globalThis.URLSearchParams(body);
      const bodyInteresting = {};
      for (const [k, v] of bodyKeys) {
        if (/^(ep\.|epn\.|up\.|upn\.|user_|em$|ph$)/.test(k) || k === 'en') {
          bodyInteresting[k] = v.slice(0, 40);
        }
      }
      if (Object.keys(bodyInteresting).length) {
        console.log(`      body: ${JSON.stringify(bodyInteresting)}`);
      }
    }
  }

  console.log(`\n  RÉSUMÉ:`);
  console.log(`    phone_click présent: ${findings.hasPhoneClick ? '✅' : '❌'}`);
  console.log(`    form_submit présent: ${findings.hasFormSubmit ? '✅' : '❌'}`);
  console.log(`    form_submit avec form_name: ${findings.hasFormSubmitCustomParam ? '✅' : '❌'}`);
  console.log(`    Enhanced Conv email hash: ${findings.hasEmailHash ? '✅' : '❌ MANQUE'}`);
  console.log(`    Enhanced Conv phone hash: ${findings.hasPhoneHash ? '✅' : '❌ MANQUE'}`);
  console.log(`    gclid propagé: ${findings.hasGclid ? '✅' : '⚠️ pas propagé automatiquement à GA4'}`);
  console.log(`    gcs values: ${[...findings.gcsValues].join(', ')}`);

  return findings;
}

console.log(`Target: ${BASE}`);
console.log(`Email attendu (hash): ${sha256Hex('john.durand@example.com')}`);
console.log(`Phone attendu +33 (hash): ${sha256Hex('+33612345678')}`);

await runScenario('no consent (default)', 'none');
await runScenario('consent granted', 'accept');
