// Auth.js v5 — config complete (Node runtime).
// Inclut Credentials provider + Prisma adapter.

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          platformRole: user.platformRole,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // On pipe `platformRole` du user (DB) a travers le JWT puis dans la
    // session pour que les server components et route handlers puissent
    // checker session.user.platformRole sans refaire une query DB.
    //
    // Piege edge runtime : ces callbacks sont dans auth.ts (Node runtime).
    // Le findUnique est execute depuis Node uniquement (api routes, server
    // components, server actions). Le middleware Edge utilise auth.config.ts
    // qui ne contient PAS ces callbacks — il lit juste le JWT existant
    // (pas de dependance Prisma).
    //
    // Revocation : si Robert est demote de SUPERADMIN -> MEMBER, le JWT
    // deja emis reste valide jusqu'a expiration (9 mois). Accepte pour v1
    // (solo user). Pour revoquer, clear les cookies manuellement.
    async jwt({ token, user }) {
      if (user && 'platformRole' in user && user.platformRole) {
        token.platformRole = user.platformRole as string;
      }
      if (!token.platformRole && token.email) {
        // Token existant sans platformRole (apres la migration) : on
        // hydrate depuis la DB une fois, ensuite c'est cache dans le JWT.
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { platformRole: true },
        });
        if (dbUser) token.platformRole = dbUser.platformRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.platformRole) {
        (
          session.user as typeof session.user & { platformRole?: string }
        ).platformRole = token.platformRole as string;
      }
      return session;
    },
  },
});
