#!/usr/bin/env node
/**
 * Dry-run de verification du tracking Analytics.
 *
 * Lance un vrai browser headless (Chromium via Playwright), visite le site
 * cible, clique sur les CTA, soumet un formulaire, et verifie que les
 * events remontent bien dans l'API Analytics.
 *
 * Usage :
 *   node scripts/dry-run-tracking.mjs <SITE_URL> <SITE_KEY> [ANALYTICS_URL]
 *
 * Exemples :
 *   # Tester le site de demo contre le staging
 *   node scripts/dry-run-tracking.mjs https://demo.veridian.site cmnw81obc0006ttfos0eefjtc https://analytics-staging.veridian.site
 *
 *   # Tester Tramtech contre le staging
 *   node scripts/dry-run-tracking.mjs https://tramtech-depannage.fr sk_xxx https://analytics-staging.veridian.site
 *
 * Prerequis : pnpm exec playwright install chromium
 */

import { chromium } from '@playwright/test';

const SITE_URL = process.argv[2];
const SITE_KEY = process.argv[3];
const ANALYTICS_URL = process.argv[4] || 'https://analytics-staging.veridian.site';
const ADMIN_KEY = process.env.ANALYTICS_ADMIN_KEY || 'Gq5024vsBTfjKH2sxMvL8uNvcBpkSk7VMlPxkdlCoKI=';

if (!SITE_URL || !SITE_KEY) {
  console.error('Usage: node scripts/dry-run-tracking.mjs <SITE_URL> <SITE_KEY> [ANALYTICS_URL]');
  process.exit(1);
}

// Recupere les counts actuels pour comparer apres le dry-run
async function getCounts(slug) {
  try {
    const res = await fetch(`${ANALYTICS_URL}/api/admin/tenants/${slug}/status`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sites?.[0]?.counts28d || null;
  } catch {
    return null;
  }
}

// Trouve le tenant slug depuis la site key
async function findTenantSlug() {
  try {
    const res = await fetch(`${ANALYTICS_URL}/api/admin/tenants`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const t of data.tenants) {
      for (const s of t.sites || []) {
        if (s.siteKey === SITE_KEY) return t.slug;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function run() {
  console.log('\n=== DRY-RUN TRACKING VERIDIAN ANALYTICS ===\n');
  console.log('Site :', SITE_URL);
  console.log('SiteKey :', SITE_KEY);
  console.log('Analytics :', ANALYTICS_URL);

  // Trouver le tenant
  const slug = await findTenantSlug();
  console.log('Tenant :', slug || '(non trouve — les counts ne seront pas verifies)');

  // Counts avant
  const before = slug ? await getCounts(slug) : null;
  if (before) {
    console.log('\nCounts AVANT :', JSON.stringify(before));
  }

  // Lancer le browser
  console.log('\n--- Lancement browser headless ---\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Veridian-DryRun/1.0 (Playwright)',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Intercepter les requetes vers /api/ingest pour logger
  const events = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/ingest/')) {
      events.push({
        type: req.url().split('/api/ingest/')[1],
        method: req.method(),
        body: req.postData(),
      });
    }
  });

  // 1. Visiter la page d'accueil
  console.log('1. Visite', SITE_URL);
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000); // laisser le tracker envoyer le pageview
  console.log('   Titre :', await page.title());

  // 2. Chercher et cliquer les CTA
  console.log('\n2. Test des CTA :');

  // CTA tel:
  const telLinks = await page.$$('a[href^="tel:"]');
  console.log('   Liens tel: trouvés :', telLinks.length);
  if (telLinks.length > 0) {
    await telLinks[0].click();
    await page.waitForTimeout(500);
    console.log('   ✓ Clic sur lien tel: envoye');
  }

  // CTA data-veridian-cta
  const ctaButtons = await page.$$('[data-veridian-cta]');
  console.log('   Boutons data-veridian-cta trouvés :', ctaButtons.length);
  for (const btn of ctaButtons) {
    const name = await btn.getAttribute('data-veridian-cta');
    // Ne pas cliquer sur les liens qui naviguent (on reste sur la page)
    const tag = await btn.evaluate((el) => el.tagName);
    if (tag === 'BUTTON') {
      await btn.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Clic CTA :', name);
    } else {
      console.log('   → CTA (lien) :', name, '- pas cliqué (naviguerait)');
    }
  }

  // 3. Naviguer sur /contact et soumettre un formulaire
  console.log('\n3. Test formulaire :');
  try {
    await page.goto(SITE_URL + '/contact', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);

    // Chercher un formulaire
    const forms = await page.$$('form');
    console.log('   Formulaires trouvés :', forms.length);

    if (forms.length > 0) {
      // Remplir les champs standard
      const fillIfExists = async (selector, value) => {
        const el = await page.$(selector);
        if (el) {
          await el.fill(value);
          return true;
        }
        return false;
      };

      await fillIfExists('input[name="email"], input[type="email"]', 'dryrun@veridian-test.fr');
      await fillIfExists('input[name="phone"], input[type="tel"]', '+33600000000');
      await fillIfExists('input[name="entreprise"], input[name="company"]', 'DryRun Corp');
      await fillIfExists('textarea[name="message"], textarea', 'Message de test dry-run Veridian Analytics');

      // Submit
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(2000);
        console.log('   ✓ Formulaire soumis');
      } else {
        console.log('   ⚠ Pas de bouton submit trouvé');
      }
    } else {
      console.log('   ⚠ Pas de formulaire sur /contact');
    }
  } catch (e) {
    console.log('   ⚠ /contact inaccessible :', e.message?.slice(0, 100));
  }

  // 4. Résumé des events interceptés
  console.log('\n4. Events interceptés :', events.length);
  for (const ev of events) {
    let detail = '';
    try {
      const body = JSON.parse(ev.body || '{}');
      detail = body.referrer
        ? `referrer=${body.referrer}`
        : body.formName
          ? `form=${body.formName}`
          : `path=${body.path}`;
    } catch { /* noop */ }
    console.log(`   → ${ev.type} ${ev.method} ${detail}`);
  }

  await browser.close();

  // 5. Vérifier les counts après
  if (slug) {
    await new Promise((r) => setTimeout(r, 3000)); // laisser le temps à l'API de traiter
    const after = await getCounts(slug);
    if (after && before) {
      console.log('\n5. Counts APRES :', JSON.stringify(after));
      console.log('\n=== DELTA ===');
      console.log('   Pageviews  :', before.pageviews, '→', after.pageviews, `(+${after.pageviews - before.pageviews})`);
      console.log('   Forms      :', before.formSubmissions, '→', after.formSubmissions, `(+${after.formSubmissions - before.formSubmissions})`);
      console.log('   Calls      :', before.sipCalls, '→', after.sipCalls, `(+${after.sipCalls - before.sipCalls})`);

      const ok = after.pageviews > before.pageviews;
      console.log('\n' + (ok ? '✅ TRACKING OK — les pageviews remontent' : '❌ TRACKING KO — aucun pageview détecté'));
    }
  }

  console.log('\n=== FIN DRY-RUN ===\n');
}

run().catch((e) => {
  console.error('Dry-run failed:', e.message);
  process.exit(1);
});
