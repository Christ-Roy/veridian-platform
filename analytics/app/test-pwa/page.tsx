'use client';

/**
 * Page de test PWA — accessible uniquement en dev/test (ENABLE_TEST_APIS=true).
 *
 * Sert de "site client simule" pour tester le flow complet :
 *   - Tracker.js (pageview + form intercept)
 *   - PWA install prompt
 *   - Push notifications (subscribe + test send)
 *
 * Guard server-side : le layout parent verifie ENABLE_TEST_APIS.
 * Cette page est un client component pour gerer les APIs browser (SW, Push, beforeinstallprompt).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

export default function TestPwaPage() {
  const searchParams = useSearchParams();
  const siteKey = searchParams.get('siteKey') || 'demo-key';

  // --- Tracker state ---
  const [trackerLoaded, setTrackerLoaded] = useState(false);
  const [pageviewCount, setPageviewCount] = useState(0);
  const [formCount, setFormCount] = useState(0);
  const [formSent, setFormSent] = useState(false);

  // --- PWA install state ---
  const [pwaStatus, setPwaStatus] = useState<
    'checking' | 'supported' | 'installed' | 'unsupported'
  >('checking');
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  // --- Push state ---
  const [pushStatus, setPushStatus] = useState<
    'idle' | 'subscribed' | 'denied' | 'unsupported' | 'error'
  >('idle');
  const [pushMessage, setPushMessage] = useState('');

  // --- Admin key pour le test send ---
  const [adminKey, setAdminKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [sendResult, setSendResult] = useState('');

  // Intercepte les fetch pour compter les events envoyes par le tracker
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const res = await originalFetch(...args);
      if (url.includes('/api/ingest/pageview')) {
        setPageviewCount((c) => c + 1);
      }
      if (url.includes('/api/ingest/form')) {
        setFormCount((c) => c + 1);
        setFormSent(true);
      }
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Charge le tracker.js
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/tracker.js';
    script.setAttribute('data-site-key', siteKey);
    script.setAttribute('data-veridian-track', 'auto');
    script.async = true;
    script.onload = () => setTrackerLoaded(true);
    script.onerror = () => setTrackerLoaded(false);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [siteKey]);

  // Ecoute beforeinstallprompt pour la PWA
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setPwaStatus('unsupported');
      return;
    }

    // Verifie si deja en mode standalone (= deja installe)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setPwaStatus('installed');
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setPwaStatus('supported');
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Si pas de prompt apres 3s, probablement pas eligible
    const timer = setTimeout(() => {
      setPwaStatus((prev) => (prev === 'checking' ? 'unsupported' : prev));
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  // Verifie le support push au mount
  useEffect(() => {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setPwaStatus('installed');
    }
    deferredPrompt.current = null;
  }, []);

  const handleSubscribe = useCallback(async () => {
    try {
      // Recupere la cle VAPID publique
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) {
        setPushStatus('error');
        setPushMessage('Erreur recuperation cle VAPID');
        return;
      }
      const { publicKey } = await vapidRes.json();

      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisuallyIndicatesUserInteraction: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      } as PushSubscriptionOptionsInit);

      // Envoie la subscription au serveur
      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (subRes.ok) {
        setPushStatus('subscribed');
        setPushMessage('Notifications activees');
      } else {
        setPushStatus('error');
        setPushMessage(`Erreur subscribe: ${subRes.status}`);
      }
    } catch (err) {
      setPushStatus('error');
      setPushMessage(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!tenantId || !adminKey) {
      setSendResult('Remplir tenant ID et admin key');
      return;
    }
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/push-notify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          title: 'Test notification',
          body: 'Envoyee depuis /test-pwa',
          url: '/dashboard',
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSendResult(res.ok ? `OK — sent: ${data.sent}, failed: ${data.failed}` : `Erreur ${res.status}`);
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : 'Erreur');
    }
  }, [tenantId, adminKey]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8 text-sm">
      <h1 className="text-xl font-bold">Page de test PWA</h1>
      <p className="text-muted-foreground">
        Site key : <code className="rounded bg-muted px-1 font-mono">{siteKey}</code>
      </p>

      {/* --- Section Tracker --- */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Tracker</h2>
        <p>
          Status :{' '}
          <span className={trackerLoaded ? 'text-emerald-400' : 'text-rose-400'}>
            {trackerLoaded ? 'Tracker charge' : 'Tracker non charge'}
          </span>
        </p>
        <p>Pageviews envoyes : {pageviewCount}</p>
        <p>Formulaires envoyes : {formCount}</p>
      </section>

      {/* --- Section Formulaire --- */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Formulaire de test</h2>
        <form
          data-veridian-track="test-contact"
          className="space-y-2"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            name="email"
            type="email"
            placeholder="email@test.com"
            className="w-full rounded border bg-muted px-3 py-1.5"
          />
          <input
            name="phone"
            type="tel"
            placeholder="+33600000000"
            className="w-full rounded border bg-muted px-3 py-1.5"
          />
          <textarea
            name="message"
            placeholder="Message de test"
            className="w-full rounded border bg-muted px-3 py-1.5"
            rows={2}
          />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-1.5 text-white hover:bg-emerald-700"
          >
            Envoyer
          </button>
        </form>
        {formSent && (
          <p className="text-emerald-400">Formulaire envoye ✓</p>
        )}
      </section>

      {/* --- Section PWA Install --- */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">PWA Install</h2>
        <p>
          Status :{' '}
          <span
            className={
              pwaStatus === 'installed'
                ? 'text-emerald-400'
                : pwaStatus === 'unsupported'
                  ? 'text-rose-400'
                  : 'text-amber-400'
            }
          >
            {pwaStatus === 'checking' && 'Verification...'}
            {pwaStatus === 'supported' && 'PWA supporte'}
            {pwaStatus === 'installed' && 'PWA installee'}
            {pwaStatus === 'unsupported' && 'PWA non supportee'}
          </span>
        </p>
        {pwaStatus === 'supported' && (
          <button
            onClick={handleInstall}
            className="rounded bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700"
          >
            Installer l&apos;app
          </button>
        )}
      </section>

      {/* --- Section Push Notifications --- */}
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Push Notifications</h2>
        <p>
          Status :{' '}
          <span
            className={
              pushStatus === 'subscribed'
                ? 'text-emerald-400'
                : pushStatus === 'denied' || pushStatus === 'error'
                  ? 'text-rose-400'
                  : pushStatus === 'unsupported'
                    ? 'text-rose-400'
                    : 'text-muted-foreground'
            }
          >
            {pushStatus === 'idle' && 'Non active'}
            {pushStatus === 'subscribed' && 'Notifications activees ✓'}
            {pushStatus === 'denied' && 'Notifications refusees'}
            {pushStatus === 'unsupported' && 'Non supporte'}
            {pushStatus === 'error' && `Erreur: ${pushMessage}`}
          </span>
        </p>

        {pushStatus !== 'unsupported' && pushStatus !== 'subscribed' && (
          <button
            onClick={handleSubscribe}
            className="rounded bg-violet-600 px-4 py-1.5 text-white hover:bg-violet-700"
          >
            Activer les notifications
          </button>
        )}

        {/* Envoi de test */}
        <div className="mt-4 space-y-2 border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">
            Envoi de notification test (admin)
          </h3>
          <input
            placeholder="Tenant ID"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded border bg-muted px-3 py-1.5 font-mono text-xs"
          />
          <input
            placeholder="Admin API Key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className="w-full rounded border bg-muted px-3 py-1.5 font-mono text-xs"
            type="password"
          />
          <button
            onClick={handleSendTest}
            className="rounded bg-amber-600 px-4 py-1.5 text-white hover:bg-amber-700"
          >
            Envoyer une notification test
          </button>
          {sendResult && (
            <p className="text-xs text-muted-foreground">{sendResult}</p>
          )}
        </div>
      </section>
    </div>
  );
}

// --- Types & helpers ---

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
