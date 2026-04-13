// OTP 2FA par email — code 6 chiffres stocké dans VerificationToken.
//
// Réutilise le modèle VerificationToken natif Auth.js pour éviter de
// créer une table dédiée. Le code expire après 10 minutes.
//
// Flow :
//   1. Login credentials OK → generateOtp(email) → code stocké + email envoyé
//   2. User saisit le code → verifyOtp(email, code) → true/false
//   3. Si true → signIn credentials (le mdp a déjà été validé en step 1)

import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

const OTP_TTL_MINUTES = 10;
const OTP_IDENTIFIER_PREFIX = 'otp:';

/** Génère un code OTP 6 chiffres et le stocke en DB. */
export async function generateOtp(email: string): Promise<string> {
  const code = crypto.randomInt(100000, 999999).toString();
  const identifier = `${OTP_IDENTIFIER_PREFIX}${email}`;
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Supprime les anciens OTP pour cet email
  await prisma.verificationToken.deleteMany({
    where: { identifier },
  });

  await prisma.verificationToken.create({
    data: { identifier, token: code, expires },
  });

  return code;
}

/** Vérifie et consomme un OTP. Retourne true si valide. */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<boolean> {
  const identifier = `${OTP_IDENTIFIER_PREFIX}${email}`;

  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: code } },
  });

  if (!row) return false;
  if (row.expires < new Date()) {
    await prisma.verificationToken
      .delete({ where: { identifier_token: { identifier, token: code } } })
      .catch(() => null);
    return false;
  }

  // Consomme le token (one-shot)
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token: code } },
  });

  return true;
}

/**
 * Crée un token one-shot "otp-verified" qui prouve que l'OTP a été validé.
 * Utilisé par la page /login/verify pour faire le signIn sans re-demander
 * le mot de passe. Le token expire après 2 minutes (juste le temps du redirect).
 */
export async function createOtpVerifiedToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const identifier = `otp-verified:${email}`;
  const expires = new Date(Date.now() + 2 * 60 * 1000);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });

  return token;
}

/**
 * Vérifie et consomme un token "otp-verified". One-shot.
 * Appelé depuis auth.ts authorize() quand le password commence par "otp-verified:".
 */
export async function consumeOtpVerifiedToken(
  email: string,
  token: string,
): Promise<boolean> {
  const identifier = `otp-verified:${email}`;
  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });
  if (!row || row.expires < new Date()) {
    if (row) {
      await prisma.verificationToken
        .delete({ where: { identifier_token: { identifier, token } } })
        .catch(() => null);
    }
    return false;
  }
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token } },
  });
  return true;
}

/** Envoie le code OTP par email via Brevo. */
export async function sendOtpEmail(
  email: string,
  code: string,
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL || 'contact@veridian.site';
  const senderName = process.env.BREVO_SENDER_NAME || 'Veridian Analytics';

  if (!apiKey) {
    console.log(`[2fa] BREVO_API_KEY not set — OTP for ${email}: ${code}`);
    return;
  }

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin:0 0 16px;font-size:20px;">Code de vérification</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
    Votre code de connexion Veridian Analytics :
  </p>
  <p style="margin:24px 0;text-align:center;">
    <span style="display:inline-block;background:#f0f9ff;padding:16px 32px;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#2563eb;">${code}</span>
  </p>
  <p style="margin:16px 0;font-size:12px;color:#666;">
    Ce code expire dans ${OTP_TTL_MINUTES} minutes. Si vous n'avez pas demandé ce code, ignorez cet email.
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
  <p style="margin:0;font-size:11px;color:#999;">Veridian Analytics — contact@veridian.site</p>
</body></html>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: sender, name: senderName },
      to: [{ email }],
      subject: `${code} — Code de connexion Veridian Analytics`,
      htmlContent: html,
      textContent: `Votre code de connexion Veridian Analytics : ${code}\n\nCe code expire dans ${OTP_TTL_MINUTES} minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`brevo_otp_failed_${res.status}: ${body.slice(0, 300)}`);
  }
}
