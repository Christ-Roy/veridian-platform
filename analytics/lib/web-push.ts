import webpush from 'web-push';

// Config VAPID au premier import. Les cles sont lues depuis l'env.
// En dev, si VAPID_PUBLIC_KEY n'est pas set, les fonctions push sont
// no-op (on log au lieu d'envoyer).
const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:contact@veridian.site';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function isWebPushConfigured(): boolean {
  return Boolean(publicKey && privateKey);
}

export function getVapidPublicKey(): string {
  return publicKey;
}

/**
 * Envoie une notification push a un abonnement.
 * Retourne true si OK, false si l'endpoint est invalide (410 Gone =
 * le user a desinstalle → supprimer la subscription de la DB).
 */
export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string; icon?: string; tag?: string },
): Promise<{ ok: boolean; gone: boolean }> {
  if (!isWebPushConfigured()) {
    console.log('[push] VAPID not configured, skip:', payload.title);
    return { ok: false, gone: false };
  }
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }, // 24h
    );
    return { ok: true, gone: false };
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Endpoint invalide — le user a desinstalle ou revoque la permission.
      return { ok: false, gone: true };
    }
    console.error('[push] failed:', err.message || err);
    return { ok: false, gone: false };
  }
}
