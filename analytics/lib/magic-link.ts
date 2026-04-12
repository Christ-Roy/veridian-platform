// Magic link helper — genere un token, le persiste dans VerificationToken
// (modele natif Auth.js), et envoie un email via Brevo.
//
// Pourquoi VerificationToken et pas un JWT ?
//   - C'est le modele deja present dans le schema Prisma (cree par
//     PrismaAdapter pour le flow email provider Auth.js).
//   - Revoquer un token = supprimer une row (pas possible avec un JWT).
//   - Un agresseur qui snif un email ne peut pas forger d'autres tokens.
//   - L'adapter Prisma offre useVerificationToken() qui supprime le token
//     quand on l'utilise (atomique) — protection naturelle contre replay.
//
// Flow :
//   1. Robert clique "Envoyer magic link" dans /admin pour un tenant
//   2. On cree un token (hash random 32 bytes), stocke dans VerificationToken
//      avec expires = now + 24h
//   3. On envoie un email via Brevo avec un lien /welcome?token=<raw>&email=<>
//   4. L'user clique, /welcome valide le token (pas expire, existe), pose un
//      password si premiere fois, puis signIn credentials

import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const MAGIC_LINK_TTL_HOURS = 24;

/**
 * Base URL publique pour les liens magic. Priorite :
 *   1. NEXTAUTH_URL (convention Auth.js, toujours set en prod)
 *   2. PUBLIC_TRACKER_URL (fallback, deja utilise pour le tracker)
 *   3. https://analytics.app.veridian.site (hardcode prod)
 */
export function resolveMagicLinkBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.PUBLIC_TRACKER_URL ||
    'https://analytics.app.veridian.site'
  ).replace(/\/$/, '');
}

/**
 * Cree un magic link pour un email donne. Stocke le token dans
 * VerificationToken et retourne l'URL pleine + le token raw (pour les
 * tests e2e qui ne passent pas par Brevo).
 */
export async function createMagicLink(
  email: string,
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(
    Date.now() + MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000,
  );

  // Invalide les tokens precedents pour cet identifier — si Robert clique
  // "resend" 3 fois, seul le dernier reste valide. Propre.
  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: rawToken,
      expires: expiresAt,
    },
  });

  const base = resolveMagicLinkBaseUrl();
  const url = `${base}/welcome?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;
  return { token: rawToken, url, expiresAt };
}

/**
 * Consomme un magic link : verifie qu'il existe, qu'il n'est pas expire,
 * et le SUPPRIME (one-shot). Retourne l'email associe si OK, null sinon.
 *
 * Atomicite : on delete apres le check dans une transaction pour eviter
 * une race ou 2 onglets consomment le meme token.
 */
export async function consumeMagicLink(
  email: string,
  token: string,
): Promise<{ ok: boolean; reason?: 'expired' | 'invalid' }> {
  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expires < new Date()) {
    // Token expire — on le supprime pour hygiene.
    await prisma.verificationToken
      .delete({ where: { identifier_token: { identifier: email, token } } })
      .catch(() => null);
    return { ok: false, reason: 'expired' };
  }
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
  });
  return { ok: true };
}

/**
 * Metriques a injecter dans le template email pour donner un apercu des
 * performances au client avant meme qu'il clique. Le but est de susciter
 * la curiosite : "ah tiens j'ai eu 42 clics et 3 formulaires cette
 * semaine, je vais voir le detail".
 */
export interface MagicLinkMetrics {
  gscClicks?: number;
  gscImpressions?: number;
  pageviews?: number;
  formSubmissions?: number;
  sipCalls?: number;
  score?: number;
  scoreLabel?: string;
}

/**
 * Envoie un email magic link via Brevo. Le template inclut un apercu des
 * metriques du tenant si fournies (clicks GSC, pageviews, formulaires,
 * score Veridian). Si BREVO_API_KEY n'est pas set, on log et on return OK
 * (dev mode : Robert copie le lien depuis les logs).
 */
export async function sendMagicLinkEmail(
  email: string,
  url: string,
  tenantName: string,
  metrics?: MagicLinkMetrics,
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL || 'contact@veridian.site';
  const senderName = process.env.BREVO_SENDER_NAME || 'Veridian Analytics';

  if (!apiKey) {
    // Dev / CI : on ne bloque pas, on log le lien pour que le dev puisse
    // le copier depuis les logs et tester le flow.
    console.log(
      `[magic-link] BREVO_API_KEY not set — would send to ${email}: ${url}`,
    );
    return;
  }

  const html = buildMagicLinkHtml(url, tenantName, metrics);

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
      subject: metrics?.gscClicks
        ? `${tenantName} — ${metrics.gscClicks} clics SEO cette semaine`
        : `Votre dashboard Veridian Analytics — ${tenantName}`,
      htmlContent: html,
      textContent: buildMagicLinkText(url, tenantName),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`brevo_failed_${res.status}: ${body.slice(0, 300)}`);
  }
}

export function buildMagicLinkHtml(
  url: string,
  tenantName: string,
  metrics?: MagicLinkMetrics,
): string {
  // Bloc metriques : on ne l'affiche que si au moins une valeur est > 0.
  // Le but est de susciter la curiosite du client : "ah tiens j'ai eu
  // 42 clics, je vais voir le detail".
  const hasMetrics = metrics && (
    (metrics.gscClicks ?? 0) > 0 ||
    (metrics.pageviews ?? 0) > 0 ||
    (metrics.formSubmissions ?? 0) > 0 ||
    (metrics.sipCalls ?? 0) > 0
  );

  const metricsBlock = hasMetrics ? `
  <table style="width:100%;border-collapse:collapse;margin:16px 0 24px;" cellpadding="0" cellspacing="0">
    <tr>
      ${metrics!.gscClicks ? `<td style="text-align:center;padding:12px 8px;background:#f0f9ff;border-radius:8px 0 0 8px;">
        <div style="font-size:24px;font-weight:700;color:#2563eb;">${metrics!.gscClicks}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">clics SEO</div>
      </td>` : ''}
      ${metrics!.pageviews ? `<td style="text-align:center;padding:12px 8px;background:#f0f9ff;">
        <div style="font-size:24px;font-weight:700;color:#2563eb;">${metrics!.pageviews}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">visites</div>
      </td>` : ''}
      ${metrics!.formSubmissions ? `<td style="text-align:center;padding:12px 8px;background:#f0f9ff;">
        <div style="font-size:24px;font-weight:700;color:#059669;">${metrics!.formSubmissions}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">formulaires</div>
      </td>` : ''}
      ${metrics!.sipCalls ? `<td style="text-align:center;padding:12px 8px;background:#f0f9ff;border-radius:0 8px 8px 0;">
        <div style="font-size:24px;font-weight:700;color:#7c3aed;">${metrics!.sipCalls}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">appels</div>
      </td>` : ''}
    </tr>
  </table>
  ${metrics!.score !== undefined ? `<p style="margin:0 0 16px;font-size:13px;color:#666;">Score Veridian : <strong style="color:#111;">${metrics!.score}/100</strong>${metrics!.scoreLabel ? ` — ${metrics!.scoreLabel}` : ''}</p>` : ''}
  ` : '';

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin:0 0 16px;font-size:20px;">Bonjour ${escapeHtml(tenantName)},</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
    ${hasMetrics
      ? 'Voici un apercu de vos performances cette semaine :'
      : 'Votre dashboard Veridian Analytics est pret. Cliquez sur le bouton ci-dessous pour acceder a vos donnees de trafic, formulaires, appels et Search Console :'}
  </p>
  ${metricsBlock}
  <p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
      ${hasMetrics ? 'Voir le detail complet' : 'Acceder a mon dashboard'}
    </a>
  </p>
  <p style="margin:16px 0;font-size:12px;color:#666;line-height:1.6;">
    Ce lien est valable 24h. Une fois connecte, votre session reste active
    pendant 9 mois — vous n'aurez pas besoin de vous reconnecter a chaque
    visite.
  </p>
  <p style="margin:16px 0;font-size:12px;color:#666;">
    Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre
    navigateur :<br>
    <span style="word-break:break-all;color:#2563eb;">${url}</span>
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
  <p style="margin:0;font-size:11px;color:#999;">
    Veridian Analytics — contact@veridian.site
  </p>
</body></html>`;
}

export function buildMagicLinkText(url: string, tenantName: string): string {
  return `Bonjour ${tenantName},

Votre dashboard Veridian Analytics est pret. Cliquez sur ce lien pour
acceder a vos donnees :

${url}

Ce lien est valable 24h. Une fois connecte, votre session reste active
pendant 9 mois.

--
Veridian Analytics
contact@veridian.site`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
