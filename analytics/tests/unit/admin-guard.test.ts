import { describe, it, expect } from 'vitest';
import {
  isSuperadmin,
  requireSuperadmin,
  ForbiddenError,
} from '@/lib/admin-guard';

describe('isSuperadmin', () => {
  it('false si session null', () => {
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
  });

  it('false si session sans user', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isSuperadmin({} as any)).toBe(false);
  });

  it('false si user sans role', () => {
    expect(
      isSuperadmin({ user: { email: 'foo@bar.com' } }),
    ).toBe(false);
  });

  it('false si role MEMBER', () => {
    expect(
      isSuperadmin({ user: { email: 'foo@bar.com', platformRole: 'MEMBER' } }),
    ).toBe(false);
  });

  it('false si role casse ou bizarre', () => {
    expect(
      isSuperadmin({ user: { email: 'foo@bar.com', platformRole: 'superadmin' } }),
    ).toBe(false);
    expect(
      isSuperadmin({ user: { email: 'foo@bar.com', platformRole: 'ADMIN' } }),
    ).toBe(false);
  });

  it('true si role SUPERADMIN', () => {
    expect(
      isSuperadmin({ user: { email: 'robert@veridian.site', platformRole: 'SUPERADMIN' } }),
    ).toBe(true);
  });
});

describe('requireSuperadmin', () => {
  it('throw ForbiddenError si pas superadmin', () => {
    expect(() => requireSuperadmin(null)).toThrow(ForbiddenError);
    expect(() =>
      requireSuperadmin({ user: { email: 'a@b.c', platformRole: 'MEMBER' } }),
    ).toThrow(ForbiddenError);
  });

  it('ne throw pas si superadmin', () => {
    expect(() =>
      requireSuperadmin({
        user: { email: 'robert@veridian.site', platformRole: 'SUPERADMIN' },
      }),
    ).not.toThrow();
  });

  it("l'erreur porte un message explicite", () => {
    try {
      requireSuperadmin(null);
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as Error).message).toBe('superadmin_required');
    }
  });
});
