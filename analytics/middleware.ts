// Middleware Next.js — edge runtime, utilise auth.config (sans Prisma)
// pour protéger /dashboard/**.
//
// En plus du guard auth, on injecte un header `x-pathname-url` avec l'URL
// complete entrante — les server components/layouts peuvent ainsi lire
// les searchParams depuis `headers()`. Next 15 ne passe PAS searchParams
// aux layouts, donc ce header est le hack officiel (Vercel le
// recommande explicitement).

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export default auth(async function middleware(req) {
  const { NextResponse } = await import('next/server');
  // On propage l'URL complete via un header applique a la REQUEST
  // downstream (le trick Next 15 pour que les layouts puissent lire
  // les searchParams via `headers()`). On passe donc le header dans
  // `request.headers` de `NextResponse.next` — Next l'injecte sur la
  // requete vers le serveur.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname-url', req.nextUrl.toString());
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
