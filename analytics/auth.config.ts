// Auth.js v5 — config edge-safe (sans Prisma, sans bcrypt).
// Utilisee par le middleware Next.js qui tourne en Edge runtime.

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [], // Les providers reels sont dans auth.ts (Node runtime)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      if (isOnDashboard) {
        return isLoggedIn;
      }
      return true;
    },
  },
  session: {
    strategy: 'jwt',
    // 9 mois — Robert envoie un magic link aux clients, ils cliquent une
    // fois et restent loggues toute la saison. Evite la friction d'un
    // "reconnectez-vous" qui tue le SaaS cadeau.
    maxAge: 60 * 60 * 24 * 30 * 9,
  },
} satisfies NextAuthConfig;
