import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const trackerPath = resolve(__dirname, '../../public/tracker.js');
const trackerCode = readFileSync(trackerPath, 'utf-8');

describe('tracker.js — static analysis', () => {
  it('is valid JavaScript (no syntax errors)', () => {
    // If this throws, the tracker has a syntax error
    expect(() => new Function(trackerCode)).not.toThrow();
  });

  it('is wrapped in an IIFE', () => {
    // Comment header before the IIFE is fine
    expect(trackerCode).toContain('(function () {');
    expect(trackerCode).toMatch(/\}\)\(\);\s*$/);
  });

  it('reads data-site-key from script tag', () => {
    expect(trackerCode).toContain("getAttribute('data-site-key')");
  });

  it('sends pageview to /api/ingest/pageview', () => {
    expect(trackerCode).toContain('/api/ingest/pageview');
  });

  it('sends form data to /api/ingest/form', () => {
    expect(trackerCode).toContain('/api/ingest/form');
  });

  it('sends interaction beacon to /api/ingest/interaction', () => {
    expect(trackerCode).toContain('/api/ingest/interaction');
  });

  it('sends session-end beacon to /api/ingest/session-end', () => {
    expect(trackerCode).toContain('/api/ingest/session-end');
  });

  it('does NOT send to /api/ingest/abandoned (removed)', () => {
    expect(trackerCode).not.toContain('/api/ingest/abandoned');
  });

  it('sets x-site-key header', () => {
    expect(trackerCode).toContain("'x-site-key'");
  });

  it('uses sessionStorage for session ID', () => {
    expect(trackerCode).toContain('sessionStorage');
    expect(trackerCode).toContain('_veridian_sid');
  });

  it('uses keepalive: true for fetch', () => {
    expect(trackerCode).toContain('keepalive: true');
  });

  it('uses credentials: omit (no cookies)', () => {
    expect(trackerCode).toContain("credentials: 'omit'");
  });

  // --- Enriched signals ---

  it('collects screen dimensions', () => {
    expect(trackerCode).toContain('scr.width');
    expect(trackerCode).toContain('scr.height');
  });

  it('collects viewport dimensions', () => {
    expect(trackerCode).toContain('innerWidth');
    expect(trackerCode).toContain('innerHeight');
  });

  it('collects devicePixelRatio', () => {
    expect(trackerCode).toContain('devicePixelRatio');
  });

  it('collects language', () => {
    expect(trackerCode).toContain('nav.language');
  });

  it('collects timezone', () => {
    expect(trackerCode).toContain('Intl.DateTimeFormat');
    expect(trackerCode).toContain('timeZone');
  });

  it('collects navigator.webdriver signal', () => {
    expect(trackerCode).toContain('nav.webdriver');
  });

  it('collects navigator.plugins count', () => {
    expect(trackerCode).toContain('nav.plugins');
  });

  it('collects hardwareConcurrency', () => {
    expect(trackerCode).toContain('hardwareConcurrency');
  });

  it('collects maxTouchPoints', () => {
    expect(trackerCode).toContain('maxTouchPoints');
  });

  it('collects network connection info', () => {
    expect(trackerCode).toContain('nav.connection');
    expect(trackerCode).toContain('effectiveType');
  });

  // --- UTM & click IDs ---

  it('collects all UTM parameters', () => {
    expect(trackerCode).toContain('utm_source');
    expect(trackerCode).toContain('utm_medium');
    expect(trackerCode).toContain('utm_campaign');
    expect(trackerCode).toContain('utm_term');
    expect(trackerCode).toContain('utm_content');
  });

  it('collects gclid and fbclid', () => {
    expect(trackerCode).toContain('gclid');
    expect(trackerCode).toContain('fbclid');
  });

  // --- Interaction detection ---

  it('listens for scroll events', () => {
    expect(trackerCode).toContain("'scroll'");
  });

  it('listens for mousemove events', () => {
    expect(trackerCode).toContain("'mousemove'");
  });

  it('listens for touchstart and touchmove', () => {
    expect(trackerCode).toContain("'touchstart'");
    expect(trackerCode).toContain("'touchmove'");
  });

  it('listens for keydown events', () => {
    expect(trackerCode).toContain("'keydown'");
  });

  it('requires scroll >= 200px to mark interaction', () => {
    expect(trackerCode).toContain('scrollTotal >= 200');
  });

  it('requires mousemove >= 50px to mark interaction', () => {
    expect(trackerCode).toContain('mouseTotal >= 50');
  });

  it('requires click > 100ms after pageload', () => {
    expect(trackerCode).toContain('> 100');
  });

  it('requires touch > 30px delta', () => {
    expect(trackerCode).toContain('> 30');
  });

  it('skips Tab and Escape keys', () => {
    expect(trackerCode).toContain("'Tab'");
    expect(trackerCode).toContain("'Escape'");
  });

  it('only sends interaction beacon once per page', () => {
    expect(trackerCode).toContain('if (interactionSent) return');
  });

  // --- Session-end ---

  it('hooks beforeunload for session-end', () => {
    expect(trackerCode).toContain("'beforeunload'");
  });

  it('hooks visibilitychange for session-end', () => {
    expect(trackerCode).toContain("'visibilitychange'");
    expect(trackerCode).toContain("'hidden'");
  });

  it('sends timeOnPage in session-end', () => {
    expect(trackerCode).toContain('timeOnPage');
  });

  it('sends scrollDepthMax in session-end', () => {
    expect(trackerCode).toContain('scrollDepthMax');
  });

  // --- SPA tracking ---

  it('intercepts history.pushState for SPA', () => {
    expect(trackerCode).toContain('history.pushState');
  });

  it('listens for popstate', () => {
    expect(trackerCode).toContain("'popstate'");
  });

  // --- CTA tracking ---

  it('tracks tel: links', () => {
    expect(trackerCode).toContain("'tel:'");
    expect(trackerCode).toContain("'cta:tel:'");
  });

  it('tracks mailto: links', () => {
    expect(trackerCode).toContain("'mailto:'");
    expect(trackerCode).toContain("'cta:mailto'");
  });

  it('tracks data-veridian-cta attributes', () => {
    expect(trackerCode).toContain('data-veridian-cta');
  });

  // --- Form tracking ---

  it('supports data-veridian-track=auto', () => {
    expect(trackerCode).toContain("'auto'");
    expect(trackerCode).toContain('data-veridian-track');
  });

  it('serializes form data with FormData', () => {
    expect(trackerCode).toContain('new FormData');
  });

  // --- Debug mode ---

  it('supports veridian_debug query param', () => {
    expect(trackerCode).toContain('veridian_debug');
  });

  // --- Size check ---

  it('is under 15KB with comments (lightweight enough)', () => {
    expect(trackerCode.length).toBeLessThan(15360);
  });
});
