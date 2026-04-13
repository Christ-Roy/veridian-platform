'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const emailSchema = z.object({
  newEmail: z.string().email('Email invalide').max(255),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Minimum 8 caractères'),
  confirmPassword: z.string(),
});

export async function updateEmail(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: 'Non authentifié' };

  const parsed = emailSchema.safeParse({
    newEmail: formData.get('newEmail'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { newEmail } = parsed.data;
  if (newEmail === session.user.email) {
    return { ok: false, error: 'Même email que l\'actuel' };
  }

  const existing = await prisma.user.findUnique({
    where: { email: newEmail },
  });
  if (existing) {
    return { ok: false, error: 'Cet email est déjà utilisé' };
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { email: newEmail },
  });

  // Note : le JWT contient l'ancien email, il faut se déconnecter/reconnecter
  // pour que le nouveau email soit pris en compte dans la session.
  return { ok: true };
}

export async function updatePassword(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: 'Non authentifié' };

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Les mots de passe ne correspondent pas' };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    return { ok: false, error: 'Compte sans mot de passe' };
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, error: 'Mot de passe actuel incorrect' };
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email: session.user.email },
    data: { passwordHash: hash },
  });

  return { ok: true };
}
