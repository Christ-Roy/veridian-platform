/**
 * Google Search Console — client minimal.
 *
 * Strategie POC (option a) :
 *   - Un SEUL refresh_token Google (celui de Robert, owner sur toutes les
 *     proprietes) stocke dans l'env GSC_REFRESH_TOKEN.
 *   - GSC_CLIENT_ID + GSC_CLIENT_SECRET : OAuth client "Desktop" cree dans GCP.
 *
 * API utilisee : https://searchconsole.googleapis.com/v1/sites/{siteUrl}/searchAnalytics/query
 * Scope OAuth : https://www.googleapis.com/auth/webmasters.readonly
 * Doc : https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope?: string;
};

export type GscDimension =
  | 'date'
  | 'query'
  | 'page'
  | 'country'
  | 'device'
  | 'searchAppearance';

export type GscSearchType =
  | 'web'
  | 'image'
  | 'video'
  | 'news'
  | 'discover'
  | 'googleNews';

export type GscRawRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export class GscConfigError extends Error {}
export class GscApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Deux modes d'authentification supportes :
 *
 * 1. ADC (Application Default Credentials) — prefere quand dispo.
 *    Lit ~/.config/gcloud/application_default_credentials.json ou
 *    $GOOGLE_APPLICATION_CREDENTIALS. Requiert un GSC_QUOTA_PROJECT pour
 *    le header x-goog-user-project.
 *
 * 2. Refresh token — fallback. GSC_CLIENT_ID + GSC_CLIENT_SECRET +
 *    GSC_REFRESH_TOKEN dans .env.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

type AuthMode = 'adc' | 'refresh_token';

function detectAuthMode(): AuthMode | null {
  // Prefer refresh_token si explicitement configure
  if (
    process.env.GSC_CLIENT_ID &&
    process.env.GSC_CLIENT_SECRET &&
    process.env.GSC_REFRESH_TOKEN
  ) {
    return 'refresh_token';
  }
  // Sinon ADC si on a les fichiers
  const adcPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(os.homedir(), '.config/gcloud/application_default_credentials.json');
  if (fs.existsSync(adcPath)) {
    return 'adc';
  }
  return null;
}

type AdcCredFile = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  type: string;
  quota_project_id?: string;
};

function readAdc(): AdcCredFile {
  const p =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(os.homedir(), '.config/gcloud/application_default_credentials.json');
  if (!fs.existsSync(p)) {
    throw new GscConfigError(
      `ADC file not found at ${p}. Run: gcloud auth application-default login --scopes='https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters.readonly'`,
    );
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as AdcCredFile;
}

function readRefreshTokenEnv() {
  const clientId = process.env.GSC_CLIENT_ID;
  const clientSecret = process.env.GSC_CLIENT_SECRET;
  const refreshToken = process.env.GSC_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GscConfigError(
      'GSC not configured — set GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN or login with gcloud auth application-default login',
    );
  }
  return { clientId, clientSecret, refreshToken };
}

/**
 * Retourne le quota project a passer dans x-goog-user-project.
 * Priority : GSC_QUOTA_PROJECT env > quota_project_id dans le ADC file > null
 * (en mode refresh_token on n'utilise pas de quota project — pas necessaire)
 */
export function readQuotaProject(): string | null {
  if (process.env.GSC_QUOTA_PROJECT) return process.env.GSC_QUOTA_PROJECT;
  try {
    const adc = readAdc();
    if (adc.quota_project_id) return adc.quota_project_id;
  } catch {}
  return null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const mode = detectAuthMode();
  if (!mode) {
    throw new GscConfigError(
      'GSC auth not configured — use "gcloud auth application-default login" or set GSC_REFRESH_TOKEN env vars',
    );
  }

  let clientId: string;
  let clientSecret: string;
  let refreshToken: string;

  if (mode === 'adc') {
    const adc = readAdc();
    clientId = adc.client_id;
    clientSecret = adc.client_secret;
    refreshToken = adc.refresh_token;
  } else {
    const env = readRefreshTokenEnv();
    clientId = env.clientId;
    clientSecret = env.clientSecret;
    refreshToken = env.refreshToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GscApiError(
      `token refresh failed (${mode}): ${text.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as GoogleTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Query search analytics for a GSC property on a date range with arbitrary
 * dimensions breakdown. Returns up to 25000 rows per call (GSC hard limit).
 */
function authHeaders(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const qp = readQuotaProject();
  if (qp) h['x-goog-user-project'] = qp;
  return h;
}

/**
 * Liste toutes les proprietes GSC auxquelles le compte authentifie a acces.
 * Correspond a GET /webmasters/v3/sites.
 */
export async function listSites(): Promise<
  Array<{ siteUrl: string; permissionLevel: string }>
> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    'https://searchconsole.googleapis.com/webmasters/v3/sites',
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new GscApiError(
      `listSites failed: ${text.slice(0, 300)}`,
      res.status,
    );
  }
  const data = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };
  return data.siteEntry ?? [];
}

export async function querySearchAnalytics(opts: {
  propertyUrl: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions: GscDimension[];
  searchType?: GscSearchType;
  rowLimit?: number;
  startRow?: number;
}): Promise<GscRawRow[]> {
  const accessToken = await getAccessToken();
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(opts.propertyUrl)}/searchAnalytics/query`;

  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions,
    rowLimit: opts.rowLimit ?? 5000,
    startRow: opts.startRow ?? 0,
    dataState: 'final',
  };
  if (opts.searchType) {
    body.type = opts.searchType;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GscApiError(
      `searchAnalytics.query failed for ${opts.propertyUrl}: ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as { rows?: GscRawRow[] };
  return data.rows ?? [];
}

/**
 * Pagine sur searchAnalytics.query jusqu'a ce qu'on ait tout.
 * Utile quand on a plus de rowLimit resultats.
 */
export async function queryAllRows(opts: {
  propertyUrl: string;
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
  searchType?: GscSearchType;
  pageSize?: number;
  maxPages?: number;
}): Promise<GscRawRow[]> {
  const pageSize = opts.pageSize ?? 5000;
  const maxPages = opts.maxPages ?? 10; // 50k rows max par defaut
  const out: GscRawRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await querySearchAnalytics({
      ...opts,
      rowLimit: pageSize,
      startRow: page * pageSize,
    });
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Genere la liste des jours entre startDate et endDate inclus (YYYY-MM-DD).
 */
export function daysBetween(startDate: Date, endDate: Date): string[] {
  const out: string[] = [];
  const cur = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ),
  );
  const end = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ),
  );
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Parse une ligne brute GSC selon l'ordre des dimensions demandees.
 * Retourne un objet normalise prêt a etre inséré dans GscDaily.
 */
export function parseRow(
  raw: GscRawRow,
  dimensions: GscDimension[],
  day: string,
  searchType: GscSearchType,
): {
  day: string;
  query: string;
  page: string;
  country: string;
  device: string;
  searchType: GscSearchType;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
} {
  const byDim: Record<string, string> = {};
  for (let i = 0; i < dimensions.length; i++) {
    byDim[dimensions[i]] = raw.keys[i] ?? '';
  }
  return {
    day: byDim.date || day,
    query: byDim.query || '',
    page: byDim.page || '',
    country: byDim.country || '(zz)',
    device: byDim.device || 'unknown',
    searchType,
    clicks: Math.round(raw.clicks),
    impressions: Math.round(raw.impressions),
    ctr: raw.ctr,
    position: raw.position,
  };
}
