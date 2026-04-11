import { describe, it, expect } from 'vitest';
import {
  SHADOW_MARKETING,
  buildMailto,
} from '@/lib/shadow-marketing';
import { KNOWN_SERVICES } from '@/lib/tenant-status';

describe('SHADOW_MARKETING', () => {
  it('a une entree pour chaque service connu', () => {
    for (const service of KNOWN_SERVICES) {
      const entry = SHADOW_MARKETING[service];
      expect(entry, `missing entry for ${service}`).toBeDefined();
      expect(entry.title).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.ctaLabel).toBeTruthy();
      expect(entry.emailSubject).toBeTruthy();
      expect(typeof entry.emailBodyTemplate).toBe('function');
    }
  });

  it('emailBodyTemplate injecte bien le domaine', () => {
    const body = SHADOW_MARKETING.calls.emailBodyTemplate('tramtech.fr');
    expect(body).toContain('tramtech.fr');
    expect(body.toLowerCase()).toContain('appel');
  });

  it('les textes ne contiennent pas de placeholder type Lorem/TODO', () => {
    for (const service of KNOWN_SERVICES) {
      const entry = SHADOW_MARKETING[service];
      expect(entry.title.toLowerCase()).not.toMatch(/lorem|todo|xxx|fixme/);
      expect(entry.description.toLowerCase()).not.toMatch(
        /lorem|todo|xxx|fixme/,
      );
    }
  });
});

describe('buildMailto', () => {
  it('construit un mailto bien forme avec subject et body encodes', () => {
    const mailto = buildMailto('calls', 'tramtech.fr');
    expect(mailto).toMatch(/^mailto:contact@veridian\.site\?/);
    expect(mailto).toContain('subject=');
    expect(mailto).toContain('body=');
    // Le domaine doit apparaitre dans le body encode
    expect(mailto).toContain(encodeURIComponent('tramtech.fr'));
  });

  it("utilise l'email de contact par defaut (contact@veridian.site)", () => {
    const mailto = buildMailto('gsc', 'example.com');
    expect(mailto.startsWith('mailto:contact@veridian.site?')).toBe(true);
  });

  it("accepte un email de contact custom", () => {
    const mailto = buildMailto('ads', 'example.com', 'hello@custom.com');
    expect(mailto.startsWith('mailto:hello@custom.com?')).toBe(true);
  });

  it('encode correctement le subject depuis SHADOW_MARKETING', () => {
    const mailto = buildMailto('pagespeed', 'example.com');
    const expectedSubject = encodeURIComponent(
      SHADOW_MARKETING.pagespeed.emailSubject,
    );
    expect(mailto).toContain(`subject=${expectedSubject}`);
  });
});
