// Service Worker client Veridian — charge par les SITES CLIENTS (pas le dashboard).
// Minimaliste : push notifications uniquement, pas de cache strategy.
// Le site client gere son propre cache si besoin.

// ─── Install : activation immediate ──────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ─── Activate : claim tous les onglets ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push : affiche la notification ──────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'veridian-client-notification',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Click notification → ouvre la page ──────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windowClients) => {
      // Si un onglet est deja ouvert sur cette URL, focus dessus
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
