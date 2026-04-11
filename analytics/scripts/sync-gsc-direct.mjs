#!/usr/bin/env node
/**
 * sync-gsc-direct.mjs
 * Sync GSC → DB en direct, sans passer par l'API admin.
 * Utilise les creds ADC + postgres via le DATABASE_URL.
 *
 * Usage :
 *   DATABASE_URL=... node scripts/sync-gsc-direct.mjs [days] [siteId]
 */
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const prisma = new PrismaClient();

const DAYS = parseInt(process.argv[2] || '28', 10);
const SITE_ID_FILTER = process.argv[3] || null;
const SEARCH_TYPE = 'web';

// --- auth ---
function getAccessToken() {
  const res = spawnSync(
    'gcloud',
    ['auth', 'application-default', 'print-access-token'],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) throw new Error('gcloud token: ' + res.stderr);
  return res.stdout.trim();
}

const adcPath = path.join(
  os.homedir(),
  '.config/gcloud/application_default_credentials.json',
);
const adc = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
const quotaProject =
  process.env.GSC_QUOTA_PROJECT || adc.quota_project_id || '';
let accessToken = getAccessToken();

async function gscQuery(propertyUrl, body) {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': quotaProject,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    // Token refresh
    accessToken = getAccessToken();
    return gscQuery(propertyUrl, body);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// --- sync ---
const props = await prisma.gscProperty.findMany({
  where: SITE_ID_FILTER ? { siteId: SITE_ID_FILTER } : undefined,
  include: { site: { select: { id: true, domain: true } } },
});
console.log(`[sync] ${props.length} GSC properties, ${DAYS}j each`);

const endDate = new Date(Date.now() - 2 * 86400000);
const startDate = new Date(endDate.getTime() - (DAYS - 1) * 86400000);
const startStr = startDate.toISOString().slice(0, 10);
const endStr = endDate.toISOString().slice(0, 10);
console.log(`[sync] range ${startStr} → ${endStr}`);

for (const prop of props) {
  const t0 = Date.now();
  console.log(`\n[sync] ${prop.site.domain}  (${prop.propertyUrl})`);

  // Pagine par pages de 5000
  const allRows = [];
  let startRow = 0;
  const pageSize = 5000;
  for (let page = 0; page < 20; page++) {
    const data = await gscQuery(prop.propertyUrl, {
      startDate: startStr,
      endDate: endStr,
      dimensions: ['date', 'query', 'page', 'country', 'device'],
      type: SEARCH_TYPE,
      rowLimit: pageSize,
      startRow,
      dataState: 'final',
    });
    const rows = data.rows || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    startRow += pageSize;
  }
  console.log(`  pulled ${allRows.length} rows`);

  if (allRows.length === 0) continue;

  // Delete existing rows in the range for this property
  await prisma.gscDaily.deleteMany({
    where: {
      siteId: prop.siteId,
      day: { gte: startDate, lte: endDate },
      searchType: SEARCH_TYPE,
    },
  });

  // Insert batch 500
  const mapped = allRows.map((r) => {
    const [day, query, page, country, device] = r.keys;
    return {
      siteId: prop.siteId,
      day: new Date(day + 'T00:00:00Z'),
      query: query || '',
      page: page || '',
      country: country || '(zz)',
      device: device || 'unknown',
      searchType: SEARCH_TYPE,
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position,
    };
  }).filter((r) => r.query && r.page);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const res = await prisma.gscDaily.createMany({
      data: mapped.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    inserted += res.count;
  }

  await prisma.gscProperty.update({
    where: { id: prop.id },
    data: { lastSyncAt: new Date() },
  });

  const ms = Date.now() - t0;
  console.log(`  ✓ ${inserted} rows inserted  (${ms}ms)`);
}

console.log('\n[sync] done');
await prisma.$disconnect();
