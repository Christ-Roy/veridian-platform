import { describe, it, expect } from 'vitest';
import {
  checkBot,
  computeVisitorHash,
  computeDeviceHash,
  categorizeReferrer,
} from '@/lib/quality';

// ============================================================================
// checkBot — bot detection
// ============================================================================

describe('checkBot', () => {
  // --- Bots grotesques (UA regex) ---

  it('flags Googlebot', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('bot_ua');
  });

  it('flags GPTBot', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) GPTBot/1.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags ClaudeBot', () => {
    const r = checkBot({ userAgent: 'ClaudeBot/1.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags AhrefsBot', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)' });
    expect(r.isBot).toBe(true);
  });

  it('flags SemrushBot', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)' });
    expect(r.isBot).toBe(true);
  });

  it('flags curl', () => {
    const r = checkBot({ userAgent: 'curl/7.68.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags python-requests', () => {
    const r = checkBot({ userAgent: 'python-requests/2.28.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags wget', () => {
    const r = checkBot({ userAgent: 'Wget/1.21' });
    expect(r.isBot).toBe(true);
  });

  it('flags HeadlessChrome', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 HeadlessChrome/121.0.0.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags Puppeteer', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 Puppeteer' });
    expect(r.isBot).toBe(true);
  });

  it('flags Playwright', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 Playwright/1.40' });
    expect(r.isBot).toBe(true);
  });

  it('flags Selenium', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 Selenium' });
    expect(r.isBot).toBe(true);
  });

  it('flags node-fetch', () => {
    const r = checkBot({ userAgent: 'node-fetch/2.6.7' });
    expect(r.isBot).toBe(true);
  });

  it('flags axios', () => {
    const r = checkBot({ userAgent: 'axios/1.4.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags PerplexityBot', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 PerplexityBot/1.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags ByteSpider', () => {
    const r = checkBot({ userAgent: 'Mozilla/5.0 (compatible; Bytespider)' });
    expect(r.isBot).toBe(true);
  });

  it('flags FacebookExternalHit', () => {
    const r = checkBot({ userAgent: 'facebookexternalhit/1.1' });
    expect(r.isBot).toBe(true);
  });

  it('flags generic "bot" in UA', () => {
    const r = checkBot({ userAgent: 'SomeRandomBot/3.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags generic "spider" in UA', () => {
    const r = checkBot({ userAgent: 'MySpider/1.0' });
    expect(r.isBot).toBe(true);
  });

  it('flags generic "crawl" in UA', () => {
    const r = checkBot({ userAgent: 'DataCrawler/2.0' });
    expect(r.isBot).toBe(true);
  });

  // --- Signaux techniques ---

  it('flags navigator.webdriver = true', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      webdriver: true,
    });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('webdriver');
  });

  it('flags viewport width 0', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      viewportWidth: 0,
    });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('zero_viewport');
  });

  it('flags screen width 0', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      screenWidth: 0,
    });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('zero_viewport');
  });

  it('flags devicePixelRatio <= 0', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      devicePixelRatio: 0,
    });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('invalid_dpr');
  });

  it('flags maxTouchPoints=0 on mobile device', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari Mobile',
      deviceType: 'mobile',
      maxTouchPoints: 0,
    });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('fake_mobile');
  });

  it('flags empty user agent', () => {
    const r = checkBot({ userAgent: '' });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('empty_ua');
  });

  it('flags very short user agent', () => {
    const r = checkBot({ userAgent: 'short' });
    expect(r.isBot).toBe(true);
    expect(r.flags).toContain('empty_ua');
  });

  // --- Vrais humains (NE DOIVENT PAS être flaggés) ---

  it('passes Chrome desktop', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      deviceType: 'desktop',
      viewportWidth: 1920,
      screenWidth: 1920,
      devicePixelRatio: 1,
      maxTouchPoints: 0,
      pluginsCount: 5,
      hardwareConcurrency: 8,
    });
    expect(r.isBot).toBe(false);
    expect(r.flags).toEqual([]);
  });

  it('passes Safari mobile', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      deviceType: 'mobile',
      viewportWidth: 390,
      screenWidth: 390,
      devicePixelRatio: 3,
      maxTouchPoints: 5,
    });
    expect(r.isBot).toBe(false);
  });

  it('passes Firefox desktop', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      deviceType: 'desktop',
    });
    expect(r.isBot).toBe(false);
  });

  it('passes Edge desktop', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    });
    expect(r.isBot).toBe(false);
  });

  it('passes Samsung Internet mobile', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
      deviceType: 'mobile',
      maxTouchPoints: 5,
    });
    expect(r.isBot).toBe(false);
  });

  it('does not flag webdriver: false', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
      webdriver: false,
    });
    expect(r.isBot).toBe(false);
  });

  it('does not flag undefined signals', () => {
    const r = checkBot({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
    });
    expect(r.isBot).toBe(false);
  });
});

// ============================================================================
// computeVisitorHash
// ============================================================================

describe('computeVisitorHash', () => {
  it('produces a hex string', () => {
    const h = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    const b = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    expect(a).toBe(b);
  });

  it('differs for different IPs', () => {
    const a = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    const b = computeVisitorHash('site1', '5.6.7.8', 'Chrome/121');
    expect(a).not.toBe(b);
  });

  it('differs for different UAs', () => {
    const a = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    const b = computeVisitorHash('site1', '1.2.3.4', 'Firefox/121');
    expect(a).not.toBe(b);
  });

  it('differs for different sites', () => {
    const a = computeVisitorHash('site1', '1.2.3.4', 'Chrome/121');
    const b = computeVisitorHash('site2', '1.2.3.4', 'Chrome/121');
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// computeDeviceHash
// ============================================================================

describe('computeDeviceHash', () => {
  it('produces a 16-char hex string', () => {
    const h = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic', () => {
    const a = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    const b = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    expect(a).toBe(b);
  });

  it('differs for different screen sizes (multi-device behind same IP)', () => {
    const desktop = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    const mobile = computeDeviceHash('Chrome/121', 390, 844, 3, 'fr-FR', 'Europe/Paris');
    expect(desktop).not.toBe(mobile);
  });

  it('differs for different UAs (Chrome vs Safari same screen)', () => {
    const chrome = computeDeviceHash('Chrome/121', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    const safari = computeDeviceHash('Safari/17', 1920, 1080, 1, 'fr-FR', 'Europe/Paris');
    expect(chrome).not.toBe(safari);
  });

  it('handles undefined values gracefully', () => {
    const h = computeDeviceHash('Chrome/121');
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ============================================================================
// categorizeReferrer
// ============================================================================

describe('categorizeReferrer', () => {
  it('returns direct for null', () => {
    expect(categorizeReferrer(null)).toEqual({ domain: null, category: 'direct' });
  });

  it('returns direct for empty string', () => {
    expect(categorizeReferrer('')).toEqual({ domain: null, category: 'direct' });
  });

  it('returns direct for CTA referrers', () => {
    expect(categorizeReferrer('cta:tel:+33612345678')).toEqual({ domain: null, category: 'direct' });
    expect(categorizeReferrer('cta:mailto')).toEqual({ domain: null, category: 'direct' });
  });

  it('categorizes Google as search', () => {
    const r = categorizeReferrer('https://www.google.com/search?q=morel+volailles');
    expect(r.domain).toBe('google.com');
    expect(r.category).toBe('search');
  });

  it('categorizes Bing as search', () => {
    const r = categorizeReferrer('https://www.bing.com/search?q=test');
    expect(r.category).toBe('search');
  });

  it('categorizes DuckDuckGo as search', () => {
    const r = categorizeReferrer('https://duckduckgo.com/?q=test');
    expect(r.category).toBe('search');
  });

  it('categorizes Facebook as social', () => {
    const r = categorizeReferrer('https://www.facebook.com/some-page');
    expect(r.category).toBe('social');
  });

  it('categorizes LinkedIn as social', () => {
    const r = categorizeReferrer('https://www.linkedin.com/feed');
    expect(r.category).toBe('social');
  });

  it('categorizes Instagram as social', () => {
    const r = categorizeReferrer('https://www.instagram.com/p/abc');
    expect(r.category).toBe('social');
  });

  it('categorizes x.com as social', () => {
    const r = categorizeReferrer('https://x.com/user/status/123');
    expect(r.category).toBe('social');
  });

  it('categorizes PagesJaunes as directory', () => {
    const r = categorizeReferrer('https://www.pagesjaunes.fr/pros/123');
    expect(r.category).toBe('directory');
  });

  it('categorizes unknown domain as referral', () => {
    const r = categorizeReferrer('https://some-blog.fr/article');
    expect(r.domain).toBe('some-blog.fr');
    expect(r.category).toBe('referral');
  });

  it('strips www from domain', () => {
    const r = categorizeReferrer('https://www.some-blog.fr/article');
    expect(r.domain).toBe('some-blog.fr');
  });

  it('returns direct for invalid URL', () => {
    expect(categorizeReferrer('not-a-url')).toEqual({ domain: null, category: 'direct' });
  });
});
