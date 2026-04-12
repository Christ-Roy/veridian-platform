// Guards cote app pour la console /admin (Robert SUPERADMIN).
//
// Distinction importante avec lib/admin-auth.ts :
//   - admin-auth.ts : protege les routes /api/admin/* via dual-auth :
//     soit `x-admin-key` (M2M, skill analytics-provision, scripts), soit
//     une session Auth.js avec platformRole === 'SUPERADMIN' (UI /admin)
//   - admin-guard.ts : helpers purs pour la couche session uniquement.
//     Utilise en tete des pages /admin et des server actions UI.
//
// Le nom du champ est `platformRole` (pas `role`) pour eviter la
// collision avec MembershipRole (tenant-scoped). platformRole est scope
// plateforme : MEMBER ou SUPERADMIN.

import type { Session } from 'next-auth';

export const SUPERADMIN_ROLE = 'SUPERADMIN';

/**
 * Shape minimaliste de ce qu'on lit sur la session — evite de coupler le
 * test unit a l'integralite de next-auth. Toute session Auth.js satisfait
 * cette shape grace a l'augmentation de types dans `types/next-auth.d.ts`.
 */
export interface SessionLike {
  user?: {
    email?: string | null;
    platformRole?: string | null;
  } | null;
}

/**
 * True si la session correspond a un superadmin plateforme (Robert).
 * False dans tous les autres cas (pas de session, pas de platformRole,
 * platformRole != SUPERADMIN).
 */
export function isSuperadmin(
  session: SessionLike | Session | null | undefined,
): boolean {
  if (!session || !session.user) return false;
  const role = (session.user as { platformRole?: string | null }).platformRole;
  return role === SUPERADMIN_ROLE;
}

/**
 * Erreur lancee quand une page ou server action protegee est appelee
 * sans session superadmin. Les callers peuvent catch et re-throw en
 * redirect('/dashboard') ou notFound() selon le contexte.
 */
export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Throw si la session n'est pas superadmin. Utilise en tete de server
 * component / server action. Le caller doit attraper ForbiddenError et
 * rediriger (pas de redirect direct ici pour rester testable en unit).
 */
export function requireSuperadmin(
  session: SessionLike | Session | null | undefined,
): asserts session is SessionLike & {
  user: { email: string; platformRole: string };
} {
  if (!isSuperadmin(session)) {
    throw new ForbiddenError('superadmin_required');
  }
}
