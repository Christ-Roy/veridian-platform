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
    maxAge: 60 * 60 * 24 * 90, // 90 jours, meme pattern que le Hub
  },
} satisfies NextAuthConfig;
