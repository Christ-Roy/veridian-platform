/**
 * Bot detection — simple, robuste, low-maintenance.
 *
 * Philosophie : 2 booléens, pas de score 0-100.
 *   isBot = true  → détecté à l'ingestion, définitif, jamais compté
 *   interacted    → mis à true par le tracker quand il voit une interaction humaine
 *
 * Dashboard filtre : WHERE isBot = false AND interacted = true
 * On accepte ~1% de faux négatifs (vrais humains dont le beacon s'est perdu).
 * Zéro cron, zéro nettoyage.
 */

import { createHash } from 'crypto';

// ============================================================================
// Bot UA patterns — crawlers connus, IA bots, outils dev, headless
// ============================================================================

const BOT_UA_PATTERNS = [
  // Crawlers classiques
  /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i, /duckduckbot/i,
  /slurp/i, /facebot/i, /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /telegrambot/i, /discordbot/i, /pinterestbot/i,
  // Crawlers IA
  /gptbot/i, /chatgpt-user/i, /claudebot/i, /claude-web/i,
  /perplexitybot/i, /cohere-ai/i, /anthropic-ai/i, /youbot/i,
  /applebot-extended/i, /bytespider/i, /ccbot/i,
  // SEO crawlers
  /ahrefsbot/i, /semrushbot/i, /mj12bot/i, /dotbot/i,
  /blexbot/i, /rogerbot/i, /screaming frog/i, /sitebulb/i,
  // Archivage
  /archive\.org/i, /ia_archiver/i,
  // Headless / automation
  /headlesschrome/i, /phantomjs/i, /puppeteer/i, /playwright/i,
  /selenium/i, /chromedriver/i, /webdriver/i,
  // HTTP clients (pas des browsers)
  /httpclient/i, /python-requests/i, /python-urllib/i,
  /curl\//i, /wget\//i, /go-http-client/i, /httpx/i,
  /scrapy/i, /okhttp/i, /jakarta/i, /axios\//i, /node-fetch/i,
  /libwww-perl/i, /java\//i,
  // Generic bot pattern
  /bot\b/i, /crawl/i, /spider/i,
];

// ============================================================================
// Bot detection — simple binaire
// ============================================================================

export interface BotCheckInput {
  userAgent: string | null;
  webdriver?: boolean;
  viewportWidth?: number;
  screenWidth?: number;
  pluginsCount?: number;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  devicePixelRatio?: number;
  deviceType?: string | null; // mobile, tablet, desktop
}

export interface BotCheckResult {
  isBot: boolean;
  flags: string[];
}

export function checkBot(input: BotCheckInput): BotCheckResult {
  const flags: string[] = [];
  const ua = input.userAgent ?? '';

  // 1. Bot UA regex
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      flags.push('bot_ua');
      return { isBot: true, flags };
    }
  }

  // 2. navigator.webdriver
  if (input.webdriver === true) {
    flags.push('webdriver');
    return { isBot: true, flags };
  }

  // 3. Viewport/screen à 0 (headless)
  if (input.viewportWidth === 0 || input.screenWidth === 0) {
    flags.push('zero_viewport');
    return { isBot: true, flags };
  }

  // 4. devicePixelRatio aberrant
  if (input.devicePixelRatio !== undefined && input.devicePixelRatio !== null &&
      input.devicePixelRatio <= 0) {
    flags.push('invalid_dpr');
    return { isBot: true, flags };
  }

  // 5. maxTouchPoints === 0 sur mobile UA (faux mobile)
  if (input.maxTouchPoints === 0 && input.deviceType === 'mobile') {
    flags.push('fake_mobile');
    return { isBot: true, flags };
  }

  // 6. Empty/tiny UA (pas un vrai browser)
  if (!ua || ua.length < 15) {
    flags.push('empty_ua');
    return { isBot: true, flags };
  }

  return { isBot: false, flags };
}

// ============================================================================
// Spam referrer blocklist (inspiré de la liste Matomo/Plausible)
// ============================================================================

const SPAM_REFERRER_DOMAINS = new Set([
  // Top spam referrers connus
  'semalt.com', 'buttons-for-website.com', 'darodar.com', 'econom.co',
  'ilovevitaly.com', 'priceg.com', 'savetubevideo.com', 'kambasoft.com',
  'lumb.co', 'hundjo.com', 'free-social-buttons.com', 'musicas.cc',
  'ranksonic.info', 'social-buttons.com', 'simple-share-buttons.com',
  'buy-cheap-online.info', 'best-seo-offer.com', 'best-seo-solution.com',
  'googlsucks.com', 'theguardlan.com', 'get-free-traffic-now.com',
  'event-tracking.com', 'acunetix-referrer.com', 'trafficmonetize.org',
  'webmonetizer.net', 'sitevaluation.org', 'see-ede.com', 'descargar-musica-gratis.net',
  'lifehacĸer.com', 'howtostopreferralspam.eu', 'o-o-6-o-o.com',
  'guardlink.org', 'pizza.veridian.site', // bloquer aussi nos propres tests si jamais
]);

export function isSpamReferrer(referrer: string | null): boolean {
  if (!referrer) return false;
  try {
    const domain = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    return SPAM_REFERRER_DOMAINS.has(domain);
  } catch {
    return false;
  }
}

// ============================================================================
// Referrer categorization
// ============================================================================

const SEARCH_ENGINES = /google\.|bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\.|ecosia\.|qwant\./i;
const SOCIAL_NETWORKS = /facebook\.|twitter\.|linkedin\.|instagram\.|tiktok\.|youtube\.|reddit\.|pinterest\.|x\.com/i;
const DIRECTORIES = /pagesjaunes\.|mappy\.|yelp\.|tripadvisor\.|trustpilot\./i;

export function categorizeReferrer(referrer: string | null): {
  domain: string | null;
  category: string;
} {
  if (!referrer || referrer.startsWith('cta:')) {
    return { domain: null, category: 'direct' };
  }
  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace(/^www\./, '');

    if (SEARCH_ENGINES.test(domain)) return { domain, category: 'search' };
    if (SOCIAL_NETWORKS.test(domain)) return { domain, category: 'social' };
    if (DIRECTORIES.test(domain)) return { domain, category: 'directory' };
    if (referrer.includes('utm_medium=email')) return { domain, category: 'email' };
    if (referrer.includes('gclid') || referrer.includes('utm_medium=cpc')) return { domain, category: 'ads' };

    return { domain, category: 'referral' };
  } catch {
    return { domain: null, category: 'direct' };
  }
}

// ============================================================================
// Visitor hash
// ============================================================================

/**
 * Visitor hash — identifie un visiteur unique (IP + UA).
 * Salé pour que le hash seul ne permette pas de retrouver l'IP.
 * L'IP brute est stockée séparément dans Pageview.ip pour les usages
 * qui en ont besoin (multi-device, réconciliation form, enrichissement)
 * et purgée après 90j via une simple query SQL.
 */
const SALT = process.env.VISITOR_HASH_SALT ?? 'veridian-default-salt-change-me';

export function computeVisitorHash(siteId: string, ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${SALT}:${siteId}:${ip}:${userAgent}`)
    .digest('hex');
}

/**
 * Device hash — identifie un device spécifique derrière une IP.
 * Permet de dire "3 devices différents ont visité depuis cette IP d'entreprise".
 * hash(ua + screenW + screenH + pixelRatio + lang + tz)
 */
export function computeDeviceHash(
  userAgent: string,
  screenWidth?: number,
  screenHeight?: number,
  pixelRatio?: number,
  lang?: string | null,
  tz?: string | null,
): string {
  return createHash('sha256')
    .update(`${userAgent}:${screenWidth ?? 0}:${screenHeight ?? 0}:${pixelRatio ?? 1}:${lang ?? ''}:${tz ?? ''}`)
    .digest('hex')
    .slice(0, 16); // 16 chars suffisent pour distinguer les devices
}
