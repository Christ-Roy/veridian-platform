import { describe, it, expect } from 'vitest';
import { daysBetween } from '@/lib/gsc';

describe('gsc / daysBetween', () => {
  it('returns single day when start == end', () => {
    const d = new Date('2026-04-10T00:00:00Z');
    expect(daysBetween(d, d)).toEqual(['2026-04-10']);
  });

  it('returns 7 days for a week range', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-04-07T00:00:00Z');
    const days = daysBetween(start, end);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-04-01');
    expect(days[6]).toBe('2026-04-07');
  });

  it('handles month boundary', () => {
    const start = new Date('2026-01-30T00:00:00Z');
    const end = new Date('2026-02-02T00:00:00Z');
    expect(daysBetween(start, end)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('handles leap year feb boundary', () => {
    const start = new Date('2024-02-28T00:00:00Z');
    const end = new Date('2024-03-01T00:00:00Z');
    expect(daysBetween(start, end)).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});
