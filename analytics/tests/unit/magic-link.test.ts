import { describe, it, expect } from 'vitest';
import {
  buildMagicLinkHtml,
  buildMagicLinkText,
  resolveMagicLinkBaseUrl,
  MAGIC_LINK_TTL_HOURS,
} from '@/lib/magic-link';

describe('buildMagicLinkHtml', () => {
  it("inclut l'URL et le nom du tenant", () => {
    const html = buildMagicLinkHtml('https://example.com/welcome?token=x', 'ACME Corp');
    expect(html).toContain('https://example.com/welcome?token=x');
    expect(html).toContain('ACME Corp');
  });

  it('escape les caracteres HTML dans le nom du tenant', () => {
    const html = buildMagicLinkHtml('https://x.com', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escape les quotes', () => {
    const html = buildMagicLinkHtml('https://x.com', `O'Brien "Co"`);
    expect(html).toContain('&#39;');
    expect(html).toContain('&quot;');
  });
});

describe('buildMagicLinkText', () => {
  it('inclut URL et tenant en texte plain', () => {
    const txt = buildMagicLinkText('https://x.com/welcome', 'ACME');
    expect(txt).toContain('https://x.com/welcome');
    expect(txt).toContain('ACME');
    expect(txt).not.toContain('<');
  });
});

describe('resolveMagicLinkBaseUrl', () => {
  it('preferer NEXTAUTH_URL', () => {
    const prev = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'https://override.example.com/';
    expect(resolveMagicLinkBaseUrl()).toBe('https://override.example.com');
    process.env.NEXTAUTH_URL = prev;
  });

  it('fallback sur hardcode si rien en env', () => {
    const a = process.env.NEXTAUTH_URL;
    const b = process.env.PUBLIC_TRACKER_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.PUBLIC_TRACKER_URL;
    expect(resolveMagicLinkBaseUrl()).toBe('https://analytics.app.veridian.site');
    if (a !== undefined) process.env.NEXTAUTH_URL = a;
    if (b !== undefined) process.env.PUBLIC_TRACKER_URL = b;
  });
});

describe('MAGIC_LINK_TTL_HOURS', () => {
  it('est 24h (contrainte produit)', () => {
    expect(MAGIC_LINK_TTL_HOURS).toBe(24);
  });
});
