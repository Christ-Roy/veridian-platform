import { describe, it, expect } from 'vitest';
import {
  buildTrackerSnippet,
  detectServices,
  buildNextSteps,
  KNOWN_SERVICES,
} from '@/lib/tenant-status';

describe('buildTrackerSnippet', () => {
  it('construit un snippet HTML avec site-key et base url', () => {
    const s = buildTrackerSnippet('sk_test_123', 'https://analytics.app.veridian.site');
    expect(s).toContain('src="https://analytics.app.veridian.site/tracker.js"');
    expect(s).toContain('data-site-key="sk_test_123"');
    expect(s).toContain('data-veridian-track="auto"');
    expect(s).toContain('async');
  });

  it('respecte la base url sans trailing slash', () => {
    const s = buildTrackerSnippet('sk_x', 'http://localhost:3100');
    expect(s).toContain('src="http://localhost:3100/tracker.js"');
  });
});

describe('detectServices', () => {
  it('marque pageviews actif si au moins 1 pageview', () => {
    const { active, inactive } = detectServices({
      pageviews: 1,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
      hasGscProperty: false,
    });
    expect(active).toContain('pageviews');
    expect(inactive).not.toContain('pageviews');
    expect(inactive).toContain('forms');
    expect(inactive).toContain('calls');
    expect(inactive).toContain('gsc');
  });

  it('marque gsc actif uniquement si propriete attachee ET rows > 0', () => {
    // Propriete attachee mais pas encore synce
    const a = detectServices({
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
      hasGscProperty: true,
    });
    expect(a.active).not.toContain('gsc');
    expect(a.inactive).toContain('gsc');

    // Propriete attachee et data en base
    const b = detectServices({
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 100,
      hasGscProperty: true,
    });
    expect(b.active).toContain('gsc');

    // Pas de propriete meme avec des rows (cas theorique)
    const c = detectServices({
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 10,
      hasGscProperty: false,
    });
    expect(c.active).not.toContain('gsc');
  });

  it('ads, pagespeed et push sont inactifs quand pas de data correspondante', () => {
    const { active, inactive } = detectServices({
      pageviews: 100,
      formSubmissions: 5,
      sipCalls: 2,
      gscRows: 50,
      hasGscProperty: true,
      pushSubscriptions: 0,
    });
    expect(active).toEqual(['pageviews', 'forms', 'calls', 'gsc']);
    expect(inactive).toEqual(['ads', 'pagespeed', 'push']);
  });

  it('push est actif quand des abonnements existent', () => {
    const { active } = detectServices({
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
      hasGscProperty: false,
      pushSubscriptions: 3,
    });
    expect(active).toContain('push');
  });

  it("active + inactive couvrent bien l'ensemble des KNOWN_SERVICES sans duplication", () => {
    const { active, inactive } = detectServices({
      pageviews: 1,
      formSubmissions: 1,
      sipCalls: 0,
      gscRows: 0,
      hasGscProperty: false,
    });
    const all = [...active, ...inactive].sort();
    expect(all).toEqual([...KNOWN_SERVICES].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('buildNextSteps', () => {
  const baseSite = { domain: 'example.com', gscProperty: null };

  it('suggere de coller le snippet si aucun pageview', () => {
    const steps = buildNextSteps(baseSite, {
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
    });
    expect(steps.some((s) => s.includes('Coller le snippet tracker'))).toBe(true);
  });

  it('ne suggere plus de coller le snippet si des pageviews existent', () => {
    const steps = buildNextSteps(baseSite, {
      pageviews: 10,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
    });
    expect(steps.some((s) => s.includes('Coller le snippet tracker'))).toBe(false);
  });

  it("suggere d'attacher GSC si aucune propriete", () => {
    const steps = buildNextSteps(baseSite, {
      pageviews: 0,
      formSubmissions: 0,
      sipCalls: 0,
      gscRows: 0,
    });
    expect(steps.some((s) => s.includes('Attacher une propriete Google Search Console'))).toBe(
      true,
    );
  });

  it('suggere de sync si propriete attachee mais pas de rows', () => {
    const steps = buildNextSteps(
      { domain: 'example.com', gscProperty: { propertyUrl: 'sc-domain:example.com' } },
      {
        pageviews: 0,
        formSubmissions: 0,
        sipCalls: 0,
        gscRows: 0,
      },
    );
    expect(steps.some((s) => s.includes('Lancer une premiere sync GSC'))).toBe(true);
  });

  it('inclut toujours les next steps futurs (ads + pagespeed) pour le shadow marketing', () => {
    const steps = buildNextSteps(baseSite, {
      pageviews: 1000,
      formSubmissions: 50,
      sipCalls: 20,
      gscRows: 500,
    });
    expect(steps.some((s) => s.includes('Google Ads'))).toBe(true);
    expect(steps.some((s) => s.includes('PageSpeed'))).toBe(true);
  });
});
