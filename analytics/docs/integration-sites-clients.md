# Intégration Veridian Analytics — sites clients

Guide pour brancher Veridian Analytics sur le site d'un client. Trois
intégrations : **pageviews**, **formulaires**, **appels entrants**.

> Pour un POC / dev, l'URL de l'API est `http://100.92.215.42:3100`.
> En prod, elle sera `https://analytics.app.veridian.site`.
> Remplace `<ANALYTICS_BASE>` par l'URL effective dans tous les snippets.

---

## TL;DR — copier-coller

Une seule ligne à coller juste avant `</body>` sur chaque page du site :

```html
<script async
  src="<ANALYTICS_BASE>/tracker.js"
  data-site-key="<SITE_KEY>"
  data-veridian-track="auto"></script>
```

Tu obtiens :

- **Pageviews** automatiques (initial + SPA navigation via `pushState`)
- **Form tracking** automatique sur tous les `<form>` du site
- Paramètres UTM capturés automatiquement (`utm_source`, `utm_medium`,
  `utm_term`)

Pour récupérer ton `SITE_KEY`, voir la section **Créer un site via l'API admin**
plus bas.

---

## 1. Comment ça marche

Le tracker est un script vanilla de ~4 KB qui :

1. Lit son `data-site-key` dans la balise `<script>`
2. Envoie un **pageview** au chargement, et à chaque `history.pushState` (SPA)
3. Intercepte les `submit` des `<form>` (selon le mode — voir plus bas)
4. Utilise `fetch` avec `keepalive: true` pour ne pas perdre les events au
   unload de page
5. N'utilise pas de cookies, donc **pas de bandeau RGPD nécessaire** pour
   les pageviews/forms (sessionStorage éphémère pour le `sessionId`)

Toutes les requêtes vont à `<ANALYTICS_BASE>/api/ingest/*` avec le header
`x-site-key: <SITE_KEY>`. L'API CORS est ouverte en POC ; en prod on whitelistera
par `domain` (ta config `Site.domain`).

---

## 2. Modes de tracking formulaires

### Mode `auto` (recommandé pour les sites vitrine)

```html
<script async src="<ANALYTICS_BASE>/tracker.js"
  data-site-key="<SITE_KEY>"
  data-veridian-track="auto"></script>
```

Tous les `<form>` du site sont capturés. Le nom du form est lu dans l'ordre :

1. `<form data-veridian-track="mon-form">` → `"mon-form"`
2. `<form name="contact">` → `"contact"`
3. Fallback → `"anonymous"`

### Mode opt-in par form (si tu veux seulement capturer certains forms)

```html
<script async src="<ANALYTICS_BASE>/tracker.js"
  data-site-key="<SITE_KEY>"></script>

<form data-veridian-track="contact">
  <input name="email" type="email" required>
  <input name="message" type="text">
  <button type="submit">Envoyer</button>
</form>
```

Seuls les forms avec `data-veridian-track="..."` sont capturés. Les autres
sont ignorés.

### Champs capturés

Le tracker sérialise tous les champs `<input>`, `<textarea>`, `<select>` via
`FormData`. **Les champs `type="password"` et `type="file"` ne sont PAS envoyés.**

Il extrait automatiquement dans les colonnes dédiées :

- `email` : cherche un champ `name="email"`
- `phone` : cherche `name="phone"`, `name="tel"`, ou `name="telephone"`

Le reste est stocké dans la colonne `payload` (JSON).

---

## 3. Exemples d'intégration

### HTML statique (WordPress, Webflow, site vitrine)

Juste avant `</body>` :

```html
<script async
  src="https://analytics.app.veridian.site/tracker.js"
  data-site-key="sk_abc123..."
  data-veridian-track="auto"></script>
```

### Next.js — App Router

Dans `app/layout.tsx`, utiliser le composant `<Script>` de Next :

```tsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Script
          src="https://analytics.app.veridian.site/tracker.js"
          data-site-key={process.env.NEXT_PUBLIC_VERIDIAN_SITE_KEY}
          data-veridian-track="auto"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
```

### Envoi manuel depuis du code (Server Action, API route, etc.)

Si tu préfères envoyer les form submissions depuis ton backend plutôt que
depuis le browser (plus sécurisé, pas de CORS) :

```ts
// app/api/contact/route.ts (Next.js)
export async function POST(req: Request) {
  const form = await req.formData();
  const email = form.get('email') as string;

  // 1. Process normal...

  // 2. Forward vers Veridian Analytics
  await fetch('https://analytics.app.veridian.site/api/ingest/form', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-site-key': process.env.VERIDIAN_SITE_KEY!,
    },
    body: JSON.stringify({
      formName: 'contact',
      path: '/contact',
      email,
      payload: Object.fromEntries(form),
    }),
  });

  return Response.json({ ok: true });
}
```

### WordPress

Option 1 — Plugin **Insert Headers and Footers** (gratuit) : coller le snippet
`<script>` dans la zone "Scripts in footer".

Option 2 — Dans `functions.php` du thème :

```php
function veridian_analytics_tracker() {
  ?>
  <script async
    src="https://analytics.app.veridian.site/tracker.js"
    data-site-key="<?php echo esc_attr(getenv('VERIDIAN_SITE_KEY')); ?>"
    data-veridian-track="auto"></script>
  <?php
}
add_action('wp_footer', 'veridian_analytics_tracker');
```

---

## 4. Créer un tenant + site via l'API admin

Les appels ci-dessous nécessitent `ADMIN_API_KEY`. À récupérer dans
`.env` de l'instance Analytics.

### Créer un tenant

```bash
curl -X POST "$ANALYTICS_BASE/api/admin/tenants" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "tramtech",
    "name": "Tramtech",
    "ownerEmail": "contact@tramtech.fr"
  }'
```

Réponse :

```json
{ "tenant": { "id": "cmnu...", "slug": "tramtech", "name": "Tramtech", ... } }
```

### Ajouter un site au tenant

```bash
curl -X POST "$ANALYTICS_BASE/api/admin/tenants/<TENANT_ID>/sites" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "tramtech.fr",
    "name": "Tramtech — site vitrine"
  }'
```

Réponse :

```json
{
  "site": {
    "id": "cmnu...",
    "domain": "tramtech.fr",
    "siteKey": "cmnu66wax0001ttge229bsm73",
    ...
  },
  "integration": {
    "siteKey": "cmnu66wax0001ttge229bsm73",
    "trackerScript": "<script async src=\"http://.../tracker.js\" data-site-key=\"...\"></script>",
    "endpoints": {
      "pageview": "http://.../api/ingest/pageview",
      "form": "http://.../api/ingest/form",
      "call": "http://.../api/ingest/call",
      "gsc": "http://.../api/ingest/gsc"
    }
  }
}
```

La clé `siteKey` est celle à utiliser dans le `data-site-key` du tracker.

### Attacher une propriété Google Search Console

```bash
curl -X PUT "$ANALYTICS_BASE/api/admin/sites/<SITE_ID>/gsc" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyUrl": "sc-domain:tramtech.fr"
  }'
```

Formats supportés pour `propertyUrl` :

- `sc-domain:tramtech.fr` (Domain property, recommandé)
- `https://www.tramtech.fr/` (URL-prefix property)

Ensuite un sync GSC (cron ou manuel) tire les data :

```bash
curl -X POST "$ANALYTICS_BASE/api/admin/gsc/sync" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
```

### Rotate une clé si elle fuite

```bash
curl -X POST "$ANALYTICS_BASE/api/admin/sites/<SITE_ID>?action=rotate-key" \
  -H "x-admin-key: $ADMIN_API_KEY"
```

Réponse : `{"site":{"id":"...","siteKey":"sk_new..."}}`.
**L'ancienne clé est invalidée immédiatement** — mets à jour le snippet sur
le site client sans attendre.

---

## 5. Webhook call tracking (Telnyx / OVH)

Sur chaque appel terminé, le provider pousse un POST vers l'API :

```bash
curl -X POST "$ANALYTICS_BASE/api/ingest/call" \
  -H "Content-Type: application/json" \
  -H "x-site-key: $SITE_KEY" \
  -d '{
    "callId": "unique-call-id-from-provider",
    "fromNum": "+33612345678",
    "toNum": "+33482530429",
    "direction": "inbound",
    "status": "answered",
    "duration": 125,
    "startedAt": "2026-04-11T10:00:00Z",
    "endedAt": "2026-04-11T10:02:05Z"
  }'
```

L'endpoint est idempotent sur `callId` (upsert) — le provider peut retry
sans crainte de doublon.

---

## 6. Troubleshooting

### Les events n'arrivent pas dans le dashboard

1. Ouvrir devtools → Network → vérifier que les POST `/api/ingest/*` partent
2. Vérifier la réponse : `{"ok":true}` = OK. `{"error":"invalid_site_key"}` =
   mauvaise clé, vérifier le `data-site-key`.
3. Vérifier que `console.log` ne pue pas d'erreur `[veridian]`
4. Tester manuellement :
   ```bash
   curl -X POST "$ANALYTICS_BASE/api/ingest/pageview" \
     -H "Content-Type: application/json" \
     -H "x-site-key: $SITE_KEY" \
     -d '{"path":"/test"}'
   ```
   Doit répondre `{"ok":true}`.

### CORS bloqué dans le browser

En POC, l'API renvoie `Access-Control-Allow-Origin: *` sur les endpoints
d'ingestion. Si tu vois un blocage CORS, c'est probablement parce que tu
utilises un mauvais endpoint (genre `/api/admin/*` qui n'autorise pas CORS,
c'est normal, c'est une API server-to-server).

### Tracker pas chargé

- Vérifier que `<ANALYTICS_BASE>/tracker.js` retourne du JS (et pas une 404)
- Si ton site a une CSP stricte, autoriser `script-src <ANALYTICS_BASE>` et
  `connect-src <ANALYTICS_BASE>`

### GSC : `[403] Forbidden`

- Vérifier que le compte Google qui a généré `GSC_REFRESH_TOKEN` est bien
  propriétaire ou utilisateur de la propriété GSC
- Format `propertyUrl` correct : `sc-domain:tramtech.fr` PAS `https://tramtech.fr`
  si c'est une Domain property
- Vérifier que l'API "Google Search Console API" est activée dans le projet GCP

---

## 7. Limites connues (POC)

- CORS ouvert à `*` sur ingestion → à restreindre par `Site.domain` en prod
- Rate limit admin : 60 req/min/IP → pas adapté à du batch massif
- `GSC_REFRESH_TOKEN` unique pour tous les clients → option (a), voir
  `gsc-setup.md` pour l'upgrade vers refresh_token par tenant
- Pas de UI admin complète — tout via API pour l'instant
