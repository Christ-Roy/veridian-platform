// Augmentation des types next-auth pour exposer `platformRole` sur User et Session.
// Le platformRole est injecte par le callback JWT depuis la DB (voir auth.ts).
//
// Nom explicite : `platformRole` (pas `role`) pour eviter la collision avec
// MembershipRole qui est scope tenant. platformRole est scope plateforme.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    platformRole?: string;
  }

  interface Session {
    user: {
      platformRole?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    platformRole?: string;
  }
}
