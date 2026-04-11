#!/usr/bin/env node
// ============================================================================
// gsc-oauth-bootstrap.mjs
// ----------------------------------------------------------------------------
// Recupere un refresh_token Google Search Console pour le compte courant.
// A executer UNE SEULE FOIS sur ton laptop. Colle ensuite le refresh_token
// dans .env de l'instance Analytics comme GSC_REFRESH_TOKEN.
//
// Prerequis (dans .env ou en export) :
//   GSC_CLIENT_ID=<client id OAuth "Desktop app" cree dans GCP>
//   GSC_CLIENT_SECRET=<client secret>
//
// Comment creer le OAuth client :
//   1. https://console.cloud.google.com/ (projet veridian-preprod)
//   2. APIs & Services > Credentials
//   3. Create Credentials > OAuth client ID > Application type "Desktop app"
//   4. Nom : "Veridian Analytics GSC"
//   5. Download JSON → copie client_id et client_secret ici
//   6. APIs & Services > Library > activer "Google Search Console API"
//
// Usage :
//   node scripts/gsc-oauth-bootstrap.mjs
// ============================================================================

import http from 'node:http';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.resolve(process.cwd(), '.env.local');
const CLIENT_ID = process.env.GSC_CLIENT_ID;
const CLIENT_SECRET = process.env.GSC_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '[gsc] ERROR: GSC_CLIENT_ID et GSC_CLIENT_SECRET doivent etre dans l\'env',
  );
  console.error('  export GSC_CLIENT_ID="..."');
  console.error('  export GSC_CLIENT_SECRET="..."');
  console.error('  node scripts/gsc-oauth-bootstrap.mjs');
  process.exit(1);
}

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // force refresh_token

console.log('\n=== Veridian Analytics — GSC OAuth bootstrap ===\n');
console.log('Ouvre cette URL dans ton navigateur :\n');
console.log('  ' + authUrl.toString() + '\n');

// Tente d'ouvrir automatiquement (xdg-open sur Linux)
try {
  spawn('xdg-open', [authUrl.toString()], { detached: true, stdio: 'ignore' });
} catch {}

// Ecoute le callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400);
    res.end(`OAuth error: ${err}`);
    console.error('[gsc] OAuth error:', err);
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400);
    res.end('missing code');
    return;
  }

  console.log('[gsc] code recu, echange contre tokens...');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`token exchange failed ${tokenRes.status}: ${text}`);
    }

    const tokens = await tokenRes.json();

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<h1>OK</h1><p>Refresh token recupere. Retourne dans le terminal.</p>',
    );

    console.log('\n==========================================================');
    console.log('  REFRESH TOKEN :');
    console.log('==========================================================');
    console.log('');
    console.log('  ' + tokens.refresh_token);
    console.log('');
    console.log('==========================================================');
    console.log('');
    console.log('Pour l\'utiliser en dev (sur le laptop) :');
    console.log('  ajoute dans .env.local :');
    console.log('    GSC_CLIENT_ID=' + CLIENT_ID);
    console.log('    GSC_CLIENT_SECRET=<secret>');
    console.log('    GSC_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('');
    console.log('Pour l\'utiliser sur dev-server :');
    console.log('  ssh dev-pub "cat >> ~/analytics-src/.env" <<EOF');
    console.log('  GSC_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('  EOF');
    console.log('  ssh dev-pub "systemctl --user restart analytics-dev"');
    console.log('');

    // Write to .env.local if it doesn't have it yet
    if (fs.existsSync(ENV_PATH)) {
      const current = fs.readFileSync(ENV_PATH, 'utf8');
      if (!current.includes('GSC_REFRESH_TOKEN=')) {
        fs.appendFileSync(
          ENV_PATH,
          `\nGSC_REFRESH_TOKEN=${tokens.refresh_token}\n`,
        );
        console.log('[gsc] ajoute automatiquement dans .env.local');
      } else {
        console.log(
          '[gsc] .env.local contient deja GSC_REFRESH_TOKEN, pas touche.',
        );
      }
    }

    server.close();
    process.exit(0);
  } catch (e) {
    console.error('[gsc] ERROR:', e);
    res.writeHead(500);
    res.end('error');
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT, '127.0.0.1', () => {
  console.log(`[gsc] en attente sur ${REDIRECT_URI}...\n`);
});

// Timeout 5 min
setTimeout(() => {
  console.error('[gsc] timeout — relance le script');
  process.exit(1);
}, 300_000).unref();
