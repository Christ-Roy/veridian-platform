/**
 * Souscrit le browser aux push notifications pour le tenant du user logge.
 * Appelle l'API /api/push/subscribe avec l'endpoint + les cles du push manager.
 * A appeler apres l'installation du Service Worker.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  const reg = await navigator.serviceWorker.ready;

  // Recupere la VAPID public key depuis l'API
  const vapidRes = await fetch('/api/push/vapid-key');
  if (!vapidRes.ok) return false;
  const { publicKey } = await vapidRes.json();
  if (!publicKey) return false;

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!)));
  const auth = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)));

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
    }),
  });
  return res.ok;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
