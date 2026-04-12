/**
 * Enregistrement du Service Worker PWA.
 *
 * Retourne la ServiceWorkerRegistration pour acceder au pushManager
 * (abonnement push notifications) depuis les composants.
 */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (error) {
    console.error('[PWA] Erreur enregistrement Service Worker:', error);
    return null;
  }
}
