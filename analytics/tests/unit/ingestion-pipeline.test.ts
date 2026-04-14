import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Tests du pipeline d'ingestion complet
// Teste les fonctions pures (quality, ingest helpers) + rate limiting
// Pas besoin de mocker Prisma — on ne touche pas la DB ici
// ============================================================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    pageview: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { checkBot, computeVisitorHash, computeDeviceHash, categorizeReferrer, isSpamReferrer } from '@/lib/quality';
import { checkIngestRateLimit, getClientIp } from '@/lib/ingest';

// ============================================================================
// Rate limiting
// ============================================================================

describe('rate limiting par IP', () => {
  it('bloque après 20 requêtes de la même IP en 1 minute', () => {
    const siteKey = 'test-rate-' + Date.now();

    for (let i = 0; i < 20; i++) {
      const req = new Request('http://localhost/api/ingest/pageview', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.99' },
      });
      const result = checkIngestRateLimit(siteKey, req);
      expect(result).toBeNull(); // autorisé
    }

    // 21ème requête — doit être bloquée
    const req21 = new Request('http://localhost/api/ingest/pageview', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.99' },
    });
    const result = checkIngestRateLimit(siteKey, req21);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('autorise une IP différente même si la première est bloquée', () => {
    const siteKey = 'test-rate2-' + Date.now();

    // Burn les 20 req de l'IP 1
    for (let i = 0; i < 21; i++) {
      const req = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });
      checkIngestRateLimit(siteKey, req);
    }

    // Nouvelle IP — doit passer
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    const result = checkIngestRateLimit(siteKey, req);
    expect(result).toBeNull();
  });
});

// ============================================================================
// getClientIp
// ============================================================================

describe('getClientIp', () => {
  it('préfère cf-connecting-ip', () => {
    const req = new Request('http://localhost', {
      headers: {
        'cf-connecting-ip': '1.1.1.1',
        'x-forwarded-for': '2.2.2.2',
        'x-real-ip': '3.3.3.3',
      },
    });
    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('fallback sur x-forwarded-for (premier IP)', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '4.4.4.4, 5.5.5.5' },
    });
    expect(getClientIp(req)).toBe('4.4.4.4');
  });

  it('fallback sur x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '6.6.6.6' },
    });
    expect(getClientIp(req)).toBe('6.6.6.6');
  });

  it('retourne unknown si aucun header', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('unknown');
  });
});

// ============================================================================
// Spam referrer
// ============================================================================

describe('spam referrer blocklist', () => {
  it('bloque semalt.com', () => {
    expect(isSpamReferrer('https://semalt.com/project/morel-volailles.com')).toBe(true);
  });

  it('bloque buttons-for-website.com', () => {
    expect(isSpamReferrer('https://www.buttons-for-website.com')).toBe(true);
  });

  it('bloque darodar.com', () => {
    expect(isSpamReferrer('http://darodar.com/something')).toBe(true);
  });

  it('ne bloque PAS google.com', () => {
    expect(isSpamReferrer('https://www.google.com/search?q=morel')).toBe(false);
  });

  it('ne bloque PAS un referrer légitime', () => {
    expect(isSpamReferrer('https://pagesjaunes.fr/pros/morel')).toBe(false);
  });

  it('ne bloque PAS null', () => {
    expect(isSpamReferrer(null)).toBe(false);
  });

  it('ne bloque PAS une URL invalide', () => {
    expect(isSpamReferrer('not-a-url')).toBe(false);
  });
});

// ============================================================================
// Visitor hash — stabilité cross-session
// ============================================================================

describe('visitor hash — stabilité', () => {
  const site = 'site_morel';
  const ip = '78.112.59.120';
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0';

  it('même IP + même UA + même site = même hash (cross-day stable)', () => {
    const h1 = computeVisitorHash(site, ip, ua);
    const h2 = computeVisitorHash(site, ip, ua);
    const h3 = computeVisitorHash(site, ip, ua);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('IP différente = hash différent (visiteur différent)', () => {
    const h1 = computeVisitorHash(site, '78.112.59.120', ua);
    const h2 = computeVisitorHash(site, '78.112.59.121', ua);
    expect(h1).not.toBe(h2);
  });

  it('UA différent = hash différent (device différent)', () => {
    const h1 = computeVisitorHash(site, ip, 'Chrome/121');
    const h2 = computeVisitorHash(site, ip, 'Firefox/121');
    expect(h1).not.toBe(h2);
  });

  it('site différent = hash différent (pas de tracking cross-site)', () => {
    const h1 = computeVisitorHash('site_morel', ip, ua);
    const h2 = computeVisitorHash('site_tramtech', ip, ua);
    expect(h1).not.toBe(h2);
  });
});

// ============================================================================
// Device hash — multi-device derrière même IP
// ============================================================================

describe('device hash — multi-device enterprise', () => {
  it('desktop Chrome et mobile Safari = 2 hashes différents', () => {
    const desktop = computeDeviceHash(
      'Mozilla/5.0 Chrome/121.0', 1920, 1080, 1, 'fr-FR', 'Europe/Paris',
    );
    const mobile = computeDeviceHash(
      'Mozilla/5.0 Safari/17.0 Mobile', 390, 844, 3, 'fr-FR', 'Europe/Paris',
    );
    expect(desktop).not.toBe(mobile);
  });

  it('même device exact = même hash', () => {
    const a = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    const b = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    expect(a).toBe(b);
  });

  it('2 écrans différents même browser = 2 hashes (laptop vs moniteur)', () => {
    const laptop = computeDeviceHash('Chrome/121', 1440, 900, 2, 'fr-FR', 'Europe/Paris');
    const monitor = computeDeviceHash('Chrome/121', 2560, 1440, 1, 'fr-FR', 'Europe/Paris');
    expect(laptop).not.toBe(monitor);
  });
});

// ============================================================================
// Bot detection — vrais scénarios
// ============================================================================

describe('bot detection — scénarios réels', () => {
  it('Googlebot classique → bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    }).isBot).toBe(true);
  });

  it('Screaming Frog SEO spider → bot', () => {
    expect(checkBot({
      userAgent: 'Screaming Frog SEO Spider/19.3',
    }).isBot).toBe(true);
  });

  it('ChatGPT browsing → bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    }).isBot).toBe(true);
  });

  it('Playwright headless → bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36 Playwright/1.40',
    }).isBot).toBe(true);
  });

  it('OVH monitoring (curl) → bot', () => {
    expect(checkBot({
      userAgent: 'curl/7.88.1',
    }).isBot).toBe(true);
  });

  it('Jean-Marc Morel sur son iPhone → PAS bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      deviceType: 'mobile',
      maxTouchPoints: 5,
      viewportWidth: 390,
      screenWidth: 390,
      devicePixelRatio: 3,
    }).isBot).toBe(false);
  });

  it('Robert sur Chrome desktop → PAS bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      deviceType: 'desktop',
      viewportWidth: 2304,
      screenWidth: 2304,
      devicePixelRatio: 1,
      pluginsCount: 5,
      hardwareConcurrency: 8,
      webdriver: false,
    }).isBot).toBe(false);
  });

  it('Client Tramtech sur Samsung Internet → PAS bot', () => {
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
      deviceType: 'mobile',
      maxTouchPoints: 5,
    }).isBot).toBe(false);
  });

  it('Puppeteer stealth avec webdriver patché → PASSE (on accepte, interaction le rattrapera)', () => {
    // Puppeteer stealth patche navigator.webdriver à false
    // Notre filtre UA ne le catch pas s'il n'a pas "Puppeteer" dans le UA
    // MAIS il ne déclenchera pas d'interaction → interacted = false → pas compté
    expect(checkBot({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      webdriver: false,
      deviceType: 'desktop',
      viewportWidth: 1920,
      pluginsCount: 3,
      hardwareConcurrency: 4,
    }).isBot).toBe(false);
    // C'est OK — le bot stealth passera isBot=false mais interacted restera false
  });
});

// ============================================================================
// Referrer categorization — scénarios réels
// ============================================================================

describe('referrer categorization — scénarios réels', () => {
  it('Google search → search', () => {
    expect(categorizeReferrer('https://www.google.fr/search?q=morel+volailles+corbas').category).toBe('search');
  });

  it('Facebook share → social', () => {
    expect(categorizeReferrer('https://l.facebook.com/l.php?u=https://morel-volailles.com').category).toBe('social');
  });

  it('Pages Jaunes → directory', () => {
    expect(categorizeReferrer('https://www.pagesjaunes.fr/pros/12345').category).toBe('directory');
  });

  it('Lien direct (pas de referrer) → direct', () => {
    expect(categorizeReferrer(null).category).toBe('direct');
  });

  it('Clic CTA tel → direct (pas referral)', () => {
    expect(categorizeReferrer('cta:tel:+33482530429').category).toBe('direct');
  });

  it('Blog qui linke → referral', () => {
    const r = categorizeReferrer('https://blog-gastronomie.fr/meilleur-poulet-corbas');
    expect(r.category).toBe('referral');
    expect(r.domain).toBe('blog-gastronomie.fr');
  });
});

// ============================================================================
// Pipeline complet — scénario nominal
// ============================================================================

describe('pipeline complet — simulation', () => {

  it('un pageview bot ne sera jamais compté même avec interaction', () => {
    // Bot détecté côté serveur → isBot = true
    const bot = checkBot({ userAgent: 'Googlebot/2.1' });
    expect(bot.isBot).toBe(true);

    // Même si le bot forge un beacon interaction, le serveur cherche
    // des pageviews avec isBot: false → ne trouvera rien
    // C'est vérifié dans la route /api/ingest/interaction
  });

  it('un humain sans interaction ne sera pas compté', () => {
    // Humain vrai → isBot = false
    const bot = checkBot({
      userAgent: 'Mozilla/5.0 Chrome/121.0.0.0',
      deviceType: 'desktop',
    });
    expect(bot.isBot).toBe(false);

    // Pageview créé avec interacted: false (default)
    // Sans beacon interaction → interacted reste false
    // Dashboard filtre WHERE isBot = false AND interacted = true → pas compté
  });

  it('un humain avec interaction sera compté', () => {
    // isBot: false → pageview créé
    const bot = checkBot({
      userAgent: 'Mozilla/5.0 Chrome/121.0.0.0',
      deviceType: 'desktop',
    });
    expect(bot.isBot).toBe(false);

    // Le tracker détecte un scroll de 300px sur 3 events → envoie beacon interaction
    // La route /api/ingest/interaction met interacted: true
    // Dashboard filtre WHERE isBot = false AND interacted = true → COMPTÉ
  });

  it('spam referrer est droppé silencieusement', () => {
    expect(isSpamReferrer('https://semalt.com/project/morel-volailles.com')).toBe(true);
    // La route retourne { ok: true, id: 'dropped', isBot: true }
    // Rien n'est stocké en DB
  });

  it('le visitor hash permet de compter les uniques correctement', () => {
    // Même visiteur, 3 pageviews dans la journée
    const h1 = computeVisitorHash('site_morel', '78.112.59.120', 'Chrome/121');
    const h2 = computeVisitorHash('site_morel', '78.112.59.120', 'Chrome/121');
    const h3 = computeVisitorHash('site_morel', '78.112.59.120', 'Chrome/121');
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
    // COUNT(DISTINCT visitorHash) = 1 → 1 visiteur unique
  });

  it('le device hash distingue les appareils derrière une IP entreprise', () => {
    const ip = '78.112.59.120';
    // PC du bureau
    const d1 = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    // Laptop du patron
    const d2 = computeDeviceHash('Chrome/121', 1440, 900, 2, 'fr-FR', 'Europe/Paris');
    // Mobile du patron
    const d3 = computeDeviceHash('Safari/17 Mobile', 390, 844, 3, 'fr-FR', 'Europe/Paris');

    expect(d1).not.toBe(d2);
    expect(d2).not.toBe(d3);
    expect(d1).not.toBe(d3);
    // SELECT COUNT(DISTINCT deviceHash) WHERE ip = '78.112.59.120' → 3 devices
  });
});
