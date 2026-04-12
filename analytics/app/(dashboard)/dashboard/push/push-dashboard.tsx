'use client';

import { useState, useCallback } from 'react';
import { Bell, Send, Smartphone, ExternalLink } from 'lucide-react';

/**
 * PushDashboard — composant client pour l'onglet Notifications du tenant.
 *
 * Permet au tenant de :
 *   - Voir le nombre de devices abonnes
 *   - Rediger et envoyer une notification push a tous ses abonnes
 *   - Voir le resultat de l'envoi (sent/failed/cleaned)
 */
export function PushDashboard({
  tenantId,
  pushCount,
}: {
  tenantId: string;
  pushCount: number;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    sent: number;
    failed: number;
    cleaned: number;
  } | null>(null);
  const [error, setError] = useState('');

  const handleSend = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      setError('Le titre et le message sont obligatoires.');
      return;
    }
    setError('');
    setResult(null);
    setSending(true);

    try {
      const payload: Record<string, string> = { title: title.trim(), body: body.trim() };
      if (url.trim()) payload.url = url.trim();

      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Erreur ${res.status}`);
        return;
      }

      const data = await res.json();
      setResult(data);
      // Reset le formulaire apres un envoi reussi
      if (data.ok) {
        setTitle('');
        setBody('');
        setUrl('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setSending(false);
    }
  }, [title, body, url]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Notifications push
        </h1>
        <p className="text-sm text-muted-foreground">
          Envoyez des notifications push aux visiteurs qui ont installe votre app.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-primary/60" />
            <div>
              <p className="text-3xl font-bold tabular-nums">{pushCount}</p>
              <p className="text-sm text-muted-foreground">
                {pushCount === 1 ? 'appareil abonne' : 'appareils abonnes'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Formulaire d'envoi */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Send className="h-4 w-4" />
          Envoyer une notification
        </h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="push-title" className="text-sm font-medium">
              Titre *
            </label>
            <input
              id="push-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Nouvelle offre disponible !"
              maxLength={200}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="push-body" className="text-sm font-medium">
              Message *
            </label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex: Profitez de -20% sur nos services ce mois-ci."
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="push-url" className="text-sm font-medium flex items-center gap-1">
              Lien (optionnel)
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </label>
            <input
              id="push-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://votre-site.fr/promo"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Page ouverte quand le visiteur clique sur la notification.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Notification envoyee
            </p>
            <p className="text-emerald-600 dark:text-emerald-400">
              {result.sent} envoyee{result.sent > 1 ? 's' : ''}{' '}
              {result.failed > 0 && `/ ${result.failed} echouee${result.failed > 1 ? 's' : ''} `}
              {result.cleaned > 0 && `/ ${result.cleaned} abonnement${result.cleaned > 1 ? 's' : ''} nettoye${result.cleaned > 1 ? 's' : ''}`}
            </p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
          {sending ? 'Envoi en cours...' : 'Envoyer'}
        </button>
      </div>

      {/* Guide d'integration */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="font-semibold">Comment integrer la PWA</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Pour que vos visiteurs puissent installer votre app et recevoir des
            notifications, ajoutez ces 2 elements a votre site :
          </p>
          <div className="space-y-3">
            <div>
              <p className="font-medium text-foreground">
                1. Fichier <code className="rounded bg-muted px-1">public/veridian-sw.js</code>
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
{`importScripts('https://analytics.app.veridian.site/client-sw.js');`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-foreground">
                2. Script dans le <code className="rounded bg-muted px-1">&lt;head&gt;</code>
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
{`<script src="https://analytics.app.veridian.site/pwa-install.js"
        data-site-key="VOTRE_SITE_KEY"
        data-tenant="VOTRE_TENANT_SLUG"
        data-veridian-pwa="auto"
        async></script>`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-foreground">
                3. Bouton d&apos;installation (optionnel)
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
{`<button data-veridian-install hidden>
  Installer l'app
</button>`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
