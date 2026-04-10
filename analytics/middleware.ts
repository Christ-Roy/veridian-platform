// Middleware Next.js — edge runtime, utilise auth.config (sans Prisma)
// pour protéger /dashboard/**.

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
