// Service Worker — Veridian Analytics PWA
// Strategie : stale-while-revalidate pour les assets statiques,
// network-only pour les appels API (donnees toujours fraiches).

const CACHE_NAME = 'veridian-analytics-v1';

// Assets statiques a pre-cacher a l'installation
const PRECACHE_URLS = ['/dashboard'];

// ─── Install : pre-cache + activation immediate ───────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activation immediate sans attendre la fermeture des onglets
  self.skipWaiting();
});

// ─── Activate : nettoyage des anciens caches + claim clients ──────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Prend le controle de tous les onglets ouverts immediatement
  self.clients.claim();
});

// ─── Fetch : stale-while-revalidate pour assets, network-only pour API ─
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Les appels API et les requetes POST ne sont jamais caches
  if (
    url.pathname.startsWith('/api/') ||
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Assets statiques : stale-while-revalidate
  // On sert le cache immediatement et on met a jour en arriere-plan
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetched = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return cached || fetched;
        })
      )
    );
  }
});

// ─── Push notifications ───────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Veridian Analytics';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.svg',
    badge: '/icons/badge-72.svg',
    data: { url: data.url || '/dashboard' },
    tag: data.tag || 'veridian-notification',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Click notification → ouvre la page ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
