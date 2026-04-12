'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { consumeMagicLink } from '@/lib/magic-link';
import { signIn } from '@/auth';

/**
 * Server action declenchee par le submit du formulaire /welcome.
 *
 * Sequence :
 *   1. Parse le formData (token, email, password)
 *   2. Consomme le token magic link (atomique, delete la row)
 *   3. Si OK : upsert le password sur le user (cree si inexistant), puis
 *      appelle signIn credentials qui redirige vers /dashboard
 *   4. Si KO : redirect /welcome?error=... pour afficher le message
 *
 * Edge cases :
 *   - User sans passwordHash (premier magic link) : on hash le password
 *     fourni et on store
 *   - User avec passwordHash (resend de magic link) : on REMPLACE le
 *     password — c'est l'UX la plus simple, Robert n'a pas a reset
 *     separement. Alternative : ignorer le nouveau password et utiliser
 *     l'ancien. On choisit replace pour rester explicite.
 *   - Si signIn throw, NextJS renvoie vers /login?error — on catch pour
 *     fallback vers /welcome avec message clair.
 */
export async function setPasswordAndLoginAction(formData: FormData) {
  const token = String(formData.get('token') || '');
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  if (!token || !email || password.length < 6) {
    redirect(
      `/welcome?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&error=invalid`,
    );
  }

  const result = await consumeMagicLink(email, token);
  if (!result.ok) {
    redirect(
      `/welcome?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&error=${result.reason}`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      // Par defaut les nouveaux users sont MEMBER — seul le seed ou un
      // SUPERADMIN peut bump un autre user en SUPERADMIN.
    },
    update: {
      passwordHash,
    },
  });

  // signIn credentials — succes = redirect /dashboard (via auth.config.ts
  // signIn page qui fait fallback dashboard). En cas d'erreur on ne catch
  // pas : signIn throws un redirect NEXT_REDIRECT que Next.js doit laisser
  // passer pour que le browser suive.
  await signIn('credentials', {
    email,
    password,
    redirectTo: '/dashboard',
  });
}
