import { describe, it, expect } from 'vitest';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

describe('cn', () => {
  it('joins classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });
  it('dedupes tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
  it('handles falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });
});

describe('formatNumber', () => {
  it('formats FR locale with spaces', () => {
    // Intl FR : 1234 → "1 234" (espace insecable)
    const out = formatNumber(1234);
    expect(out.replace(/\s/g, '')).toBe('1234');
    expect(out).toContain('1');
    expect(out).toContain('234');
  });
  it('handles 0', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('adds + sign for positive', () => {
    expect(formatPercent(15.5, 1)).toBe('+15.5%');
  });
  it('no sign for negative', () => {
    expect(formatPercent(-5.2, 1)).toBe('-5.2%');
  });
  it('0 has no sign', () => {
    expect(formatPercent(0, 0)).toBe('0%');
  });
});
