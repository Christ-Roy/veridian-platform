#!/usr/bin/env node
/**
 * provision-from-gsc.mjs
 * ----------------------
 * Liste les proprietes GSC accessibles via les creds ADC courantes, puis
 * cree un Tenant + Site + GscProperty dans notre DB Analytics pour chaque
 * propriete qui n'existe pas encore.
 *
 * Idempotent : skippe les sites deja provisionnes.
 *
 * Prerequis :
 *   - gcloud auth application-default login (deja fait)
 *   - DATABASE_URL pointe sur la DB analytics
 *
 * Usage :
 *   DATABASE_URL=postgresql://... node scripts/provision-from-gsc.mjs
 */

import { PrismaClient } from '@prisma/client';

async function listSitesDirect() {
  const { spawnSync } = await import('node:child_process');
  const tokenRes = spawnSync(
    'gcloud',
    ['auth', 'application-default', 'print-access-token'],
    { encoding: 'utf8' },
  );
  if (tokenRes.status !== 0) {
    throw new Error('gcloud print-access-token failed: ' + tokenRes.stderr);
  }
  const token = tokenRes.stdout.trim();

  // Lire le quota project depuis le fichier ADC
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const adcPath = path.join(
    os.homedir(),
    '.config/gcloud/application_default_credentials.json',
  );
  const adc = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  const quotaProject =
    process.env.GSC_QUOTA_PROJECT || adc.quota_project_id || '';

  const res = await fetch(
    'https://searchconsole.googleapis.com/webmasters/v3/sites',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': quotaProject,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC listSites ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.siteEntry ?? [];
}

/**
 * Genere un slug a partir d'une property URL GSC.
 * sc-domain:veridian.site        → veridian-site
 * sc-domain:tramtech-depannage.fr → tramtech-depannage-fr
 * https://app.veridian.site/      → app-veridian-site
 */
function slugify(propertyUrl) {
  let s = propertyUrl;
  if (s.startsWith('sc-domain:')) s = s.slice('sc-domain:'.length);
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/\/$/, '');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function domainOf(propertyUrl) {
  if (propertyUrl.startsWith('sc-domain:')) {
    return propertyUrl.slice('sc-domain:'.length);
  }
  try {
    return new URL(propertyUrl).hostname;
  } catch {
    return propertyUrl;
  }
}

function tenantNameOf(propertyUrl) {
  const d = domainOf(propertyUrl);
  // "veridian.site" → "Veridian"
  const first = d.split('.')[0];
  return first
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const prisma = new PrismaClient();

console.log('[provision] listing GSC sites...');
const sites = await listSitesDirect();
console.log(`[provision] found ${sites.length} GSC properties`);

for (const site of sites) {
  const propertyUrl = site.siteUrl;
  const slug = slugify(propertyUrl);
  const domain = domainOf(propertyUrl);
  const name = tenantNameOf(propertyUrl);
  console.log(`\n[provision] ${propertyUrl}`);
  console.log(`  slug=${slug}  domain=${domain}  name=${name}`);

  // 1. Tenant — upsert par slug
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    create: { slug, name },
    update: {}, // ne touche pas si existe
  });
  console.log(`  tenant id=${tenant.id}`);

  // 2. Site — upsert par domain (dans le tenant)
  // Note : pas de @unique sur domain, on cherche d'abord
  let dbSite = await prisma.site.findFirst({
    where: { tenantId: tenant.id, domain, deletedAt: null },
  });
  if (!dbSite) {
    dbSite = await prisma.site.create({
      data: {
        tenantId: tenant.id,
        domain,
        name: `${name} — site principal`,
      },
    });
    console.log(`  site CREATED id=${dbSite.id} siteKey=${dbSite.siteKey}`);
  } else {
    console.log(`  site existe id=${dbSite.id} siteKey=${dbSite.siteKey}`);
  }

  // 3. GscProperty — upsert par siteId (relation 1-1)
  const gsc = await prisma.gscProperty.upsert({
    where: { siteId: dbSite.id },
    create: { siteId: dbSite.id, propertyUrl },
    update: { propertyUrl },
  });
  console.log(`  gscProperty ${gsc.id} → ${propertyUrl}`);
}

console.log('\n[provision] done.');
await prisma.$disconnect();
