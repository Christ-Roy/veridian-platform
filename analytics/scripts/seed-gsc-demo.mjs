#!/usr/bin/env node
/**
 * Seed GSC demo data — 30j de rows pour le site veridian.site.
 * Utilise pour tester/demo le dashboard GSC sans avoir a brancher l'OAuth.
 *
 * Usage :
 *   DATABASE_URL=... node scripts/seed-gsc-demo.mjs [siteId]
 *
 * Par defaut cible le site veridian.site dont l'id est connu en dev.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SITE_ID = process.argv[2] || 'cmnu64uzd0002tthippxt1upu';

const queries = [
  'serrurier lyon',
  'serrurier urgence',
  'ouverture porte claquée',
  'changement serrure',
  'veridian analytics',
  'tracker site vitrine',
  'google search console api',
  'saas tracking formulaires',
  'call tracking sip',
  'analytics open source',
];
const pages = [
  '/',
  '/contact',
  '/services',
  '/tarifs',
  '/blog',
  '/about',
];
const countries = ['fra', 'bel', 'che', 'mar', 'usa', 'gbr'];
const devices = ['desktop', 'mobile', 'tablet'];

console.log('[seed-gsc] targeting siteId:', SITE_ID);

const site = await prisma.site.findUnique({ where: { id: SITE_ID } });
if (!site) {
  console.error('[seed-gsc] site not found. List with:');
  console.error(
    '  ssh dev-pub \'docker exec analytics-test-db psql -U analytics -d analytics -c "SELECT id, domain FROM analytics.\\"Site\\""\'',
  );
  process.exit(1);
}
console.log('[seed-gsc] site:', site.domain);

// Clean before re-seed
const del = await prisma.gscDaily.deleteMany({ where: { siteId: SITE_ID } });
console.log('[seed-gsc] deleted', del.count, 'existing rows');

const rows = [];
const now = new Date();
for (let d = 89; d >= 0; d--) {
  // 90j d'historique
  const day = new Date(now.getTime() - d * 86400000);
  day.setUTCHours(0, 0, 0, 0);

  // Trend : legere croissance lineaire (meilleure performance dans le temps)
  const trendBoost = 1 + (89 - d) * 0.015;

  for (const query of queries) {
    for (const page of pages) {
      for (const country of countries) {
        for (const device of devices) {
          // Biais realiste : mobile + fra dominants
          const deviceMult =
            device === 'mobile' ? 3.5 : device === 'desktop' ? 1.5 : 0.5;
          const countryMult =
            country === 'fra' ? 5 : country === 'bel' ? 1.2 : 0.6;
          const base = deviceMult * countryMult * trendBoost;

          const impressions = Math.floor(Math.random() * 60 * base);
          if (impressions < 2) continue;

          const ctr = 0.01 + Math.random() * 0.12;
          const clicks = Math.round(impressions * ctr);
          const position = 3 + Math.random() * 20;

          rows.push({
            siteId: SITE_ID,
            day,
            query,
            page,
            country,
            device,
            searchType: 'web',
            clicks,
            impressions,
            ctr,
            position,
          });
        }
      }
    }
  }
}

console.log('[seed-gsc] inserting', rows.length, 'rows in batches of 500...');
const BATCH = 500;
for (let i = 0; i < rows.length; i += BATCH) {
  await prisma.gscDaily.createMany({
    data: rows.slice(i, i + BATCH),
    skipDuplicates: true,
  });
  if (i % 5000 === 0) {
    process.stdout.write('.');
  }
}
console.log('\n[seed-gsc] done');
await prisma.$disconnect();
