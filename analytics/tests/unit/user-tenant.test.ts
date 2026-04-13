import { describe, it, expect } from 'vitest';
import {
  isServiceActive,
  computeLockedHrefs,
  aggregateActiveServices,
  computeScore,
  scoreLabel,
  ROUTE_TO_SERVICE,
} from '@/lib/user-tenant';
import { KNOWN_SERVICES, type TenantStatus } from '@/lib/tenant-status';

describe('isServiceActive', () => {
  it('true quand le service est present', () => {
    expect(isServiceActive(['pageviews', 'gsc'], 'gsc')).toBe(true);
  });

  it('false quand le service est absent', () => {
    expect(isServiceActive(['pageviews'], 'calls')).toBe(false);
  });

  it('false sur une liste vide', () => {
    expect(isServiceActive([], 'forms')).toBe(false);
  });
});

describe('ROUTE_TO_SERVICE', () => {
  it('expose les 3 routes guardees du MVP', () => {
    expect(ROUTE_TO_SERVICE['/dashboard/forms']).toBe('forms');
    expect(ROUTE_TO_SERVICE['/dashboard/calls']).toBe('calls');
    expect(ROUTE_TO_SERVICE['/dashboard/gsc']).toBe('gsc');
  });

  it("n'inclut PAS la home /dashboard (jamais lockee)", () => {
    expect(ROUTE_TO_SERVICE['/dashboard']).toBeUndefined();
  });

  it('chaque entree mappe vers un ServiceKey connu', () => {
    for (const service of Object.values(ROUTE_TO_SERVICE)) {
      expect(KNOWN_SERVICES).toContain(service);
    }
  });
});

describe('computeLockedHrefs', () => {
  it('aucune route lockee si tous les services concernes sont actifs', () => {
    const locked = computeLockedHrefs(['forms', 'calls', 'gsc', 'push']);
    expect(locked).toEqual([]);
  });

  it('lock forms quand seul gsc est actif', () => {
    const locked = computeLockedHrefs(['gsc']);
    expect(locked).toContain('/dashboard/forms');
    expect(locked).toContain('/dashboard/calls');
    expect(locked).not.toContain('/dashboard/gsc');
  });

  it('lock toutes les routes si aucun service actif', () => {
    const locked = computeLockedHrefs([]);
    expect(locked).toEqual(
      expect.arrayContaining([
        '/dashboard/forms',
        '/dashboard/calls',
        '/dashboard/gsc',
      ]),
    );
    // 4 routes lockees : forms, calls, gsc, push
    expect(locked.length).toBe(4);
  });

  it('lock toutes les routes quand activeServices est null (fallback DB error)', () => {
    const locked = computeLockedHrefs(null);
    expect(locked.length).toBeGreaterThanOrEqual(4);
    expect(locked).toContain('/dashboard/forms');
    expect(locked).toContain('/dashboard/calls');
    expect(locked).toContain('/dashboard/gsc');
  });

  it("n'inclut jamais /dashboard (home) dans les lockees", () => {
    expect(computeLockedHrefs([])).not.toContain('/dashboard');
    expect(computeLockedHrefs(null)).not.toContain('/dashboard');
  });
});

describe('aggregateActiveServices', () => {
  function makeStatus(sitesActive: string[][]): TenantStatus {
    return {
      tenant: {
        id: 't1',
        slug: 'test',
        name: 'Test',
        createdAt: new Date(),
        members: [],
      },
      pushSubscriptionsCount: 0,
      summary: {
        sitesCount: sitesActive.length,
        totalActiveServices: 0,
        totalInactiveServices: 0,
        hasAnyIngestedData: true,
      },
      sites: sitesActive.map((active, i) => ({
        id: `s${i}`,
        domain: `example-${i}.com`,
        name: `Site ${i}`,
        siteKey: `sk_${i}`,
        createdAt: new Date(),
        gsc: null,
        counts28d: {
          pageviews: 0,
          formSubmissions: 0,
          sipCalls: 0,
            ctaClicks: 0,
          gscRows: 0,
          gscClicks: 0,
          gscImpressions: 0,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeServices: active as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inactiveServices: [] as any,
        trackerSnippet: '',
        nextSteps: [],
      })),
    };
  }

  it('renvoie [] si status null', () => {
    expect(aggregateActiveServices(null)).toEqual([]);
  });

  it('union des services actifs de tous les sites', () => {
    const s = makeStatus([
      ['pageviews', 'gsc'],
      ['forms'],
    ]);
    const result = aggregateActiveServices(s);
    expect(result).toContain('pageviews');
    expect(result).toContain('gsc');
    expect(result).toContain('forms');
    expect(result).not.toContain('calls');
  });

  it("l'ordre du resultat suit KNOWN_SERVICES (deterministe)", () => {
    const s = makeStatus([['gsc', 'pageviews', 'forms']]);
    const result = aggregateActiveServices(s);
    // pageviews vient avant forms, forms avant gsc dans KNOWN_SERVICES
    expect(result).toEqual(['pageviews', 'forms', 'gsc']);
  });

  it('deduplique quand plusieurs sites partagent un service', () => {
    const s = makeStatus([['pageviews'], ['pageviews', 'gsc']]);
    const result = aggregateActiveServices(s);
    expect(result.filter((x) => x === 'pageviews').length).toBe(1);
  });
});

describe('computeScore', () => {
  it('0 pour aucun service', () => {
    expect(computeScore([]).score).toBe(0);
  });

  it('20 par service actif', () => {
    expect(computeScore(['pageviews']).score).toBe(20);
    expect(computeScore(['pageviews', 'forms']).score).toBe(40);
  });

  it('cape a 100 si plus de 5 services', () => {
    expect(
      computeScore(['pageviews', 'forms', 'calls', 'gsc', 'ads', 'pagespeed'])
        .score,
    ).toBe(100);
  });
});

describe('scoreLabel', () => {
  it('retourne des labels coherents', () => {
    expect(scoreLabel(100).tone).toBe('great');
    expect(scoreLabel(80).tone).toBe('great');
    expect(scoreLabel(60).tone).toBe('good');
    expect(scoreLabel(40).tone).toBe('fair');
    expect(scoreLabel(0).tone).toBe('low');
  });
});
