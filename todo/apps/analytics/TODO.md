# Analytics — TODO sprint courant

> **Lire avant de bosser sur Analytics** :
> 1. [`VISION.md`](./VISION.md) — le "pourquoi" et la roadmap langage naturel
> 2. Ce fichier — les checkboxes actionnables du sprint en cours
> 3. [`IDEAS.md`](./IDEAS.md) — propositions Claude hors sprint (à reviewer)
> 4. [`UI-REVIEW.md`](./UI-REVIEW.md) — file d'attente UI polish solo
>
> Source de vérité strategique globale : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
>
> Dernière mise à jour : 2026-04-11

## État actuel

- **Status** : 🟡 **PRIORITÉ ABSOLUE P0** — MVP en construction pour déploiement aux 3 premiers clients
- **Instance dev** : `http://100.92.215.42:3100` (dev-server via Tailscale)
- **Login dev** : `robert@veridian.site` / `test1234`
- **Tenant admin dev** : `veridian` (role OWNER)
- **URL prod cible** : `https://analytics.app.veridian.site` (pas encore déployé)
- **Image Docker** : `analytics:poc-admin-local` (testée localement, pas push GHCR)

### Data en DB (2026-04-11)

| Tenant (slug) | Domaine | GSC rows 90j | Client réel ? |
|---|---|---|---|
| `veridian` | veridian.site | 229 | Interne |
| `arnaudcapitaine-com` | arnaudcapitaine.com | 15 | Interne |
| `app-veridian-site` | app.veridian.site | 2 | Interne |
| `tramtech-depannage-fr` | tramtech-depannage.fr | 2779 | ✅ **Client actif** |
| `morel-volailles-com` | morel-volailles.com | 137 | ✅ **Client actif** |
| ` ` (à créer) | apical-informatique.fr | - | ✅ **Client à provisionner** |

## Sprint courant — Phase A (MVP déployable aux 3 clients)

Objectif : livrer les dashboards aux 3 clients réels (Tramtech, Morel, Apical)
avec une expérience scopée, gamifiée, et avec shadow marketing.

### 1. Provisionner les 3 vrais clients

- [ ] Confirmer que `tramtech-depannage-fr` est bien un tenant "client" et pas juste un tenant test
- [ ] Confirmer que `morel-volailles-com` idem
- [ ] Créer le tenant `apical-informatique` + site (domaine à confirmer avec Robert)
- [ ] Créer un user client pour chacun (email Robert pour l'instant, change à la demande)
- [ ] Attacher la propriété GSC pour Apical si elle existe
- [ ] Sync GSC 90j pour chaque client → vérifier volumes

### 2. Scope tenant strict dans les dashboards

- [ ] Quand un user (non-admin) se loggue, les queries GSC/forms/calls/pageviews
      sont automatiquement filtrées par son `tenantId` → liste de `siteId`
- [ ] Robert (admin) garde l'accès multi-tenant : sélecteur de tenant dans le header
- [ ] Tests e2e : login tramtech → ne voit QUE tramtech ; login veridian (admin)
      → voit tout

### 3. Page d'accueil gamifiée pour le client

- [ ] Remplacer `/dashboard` par une page "Mon score Veridian"
- [ ] Composant "Score de performance" (somme pondérée des services actifs)
- [ ] Blocs service actif : trafic SEO, formulaires, appels, Google Ads, vitesse
      → chaque bloc montre une métrique + tendance 28j + badge "actif"
- [ ] Blocs service non actif : style muté avec CTA "contact@veridian.site
      pour activer" (shadow marketing)
- [ ] Pondération du score : décider une formule simple (à itérer)

### 4. Skill Claude de provisioning

- [ ] Créer un skill `~/.claude/skills/analytics-provision/` ou équivalent
- [ ] Input : `{ nom, domaine, email client, numéro(s) appel, propriété GSC }`
- [ ] Actions : create tenant → create site → attach GSC → sync initial →
      génère snippet tracker → affiche le snippet à copier-coller
- [ ] Doc dans le skill expliquant comment Robert l'appelle

### 5. Call tracking basique

- [ ] Choisir fournisseur : OVH voiceConsumption (déjà en place, gratuit)
      vs Telnyx (plus moderne, payant) → **décision Robert attendue**
- [ ] Script de sync : pull API → transform → POST `/api/ingest/call` avec
      le `x-site-key` du client concerné
- [ ] Mapping numéro → site (table `SipLineMapping` à ajouter ou via champ
      `Site.trackedNumbers`)
- [ ] Cron quotidien sur dev-server ou prod
- [ ] Page `/dashboard/calls` scopée tenant → déjà existante, vérifier scope

### 6. Doc d'intégration client

- [ ] Créer `analytics/docs/integration.md`
- [ ] Snippet tracker prêt à copier-coller (avec site-key en variable)
- [ ] Comment taguer les formulaires (`data-veridian-track="contact"`)
- [ ] Comment vérifier que le tracking fonctionne (devtools network tab)
- [ ] Robert pourra copier-coller ça dans un mail au client

### 7. Deploy prod

- [ ] Dockerfile validé en build local (déjà fait)
- [ ] Push image sur GHCR
- [ ] Service Dokploy `analytics` sur VPS prod
- [ ] DNS `analytics.app.veridian.site` → Traefik → container
- [ ] **Env var `PUBLIC_TRACKER_URL=https://analytics.app.veridian.site`** (pour que le skill retourne le bon snippet URL prod dans `/status`)
- [ ] Env var `ADMIN_API_KEY` (générer une nouvelle pour la prod, ≠ dev)
- [ ] Env var `DATABASE_URL` sur un Postgres dédié prod
- [ ] Env var `AUTH_SECRET` (nouveau, pas celui de dev)
- [ ] Seed admin Robert + migration initiale
- [ ] Badge BETA dans le header (pour les clients)
- [ ] Mettre à jour `~/.claude/skills/analytics-provision/SKILL.md` avec la nouvelle BASE URL + nouvelle ADMIN_API_KEY prod

## En cours / blockers

- 🔄 **Audit UI `/dashboard/gsc`** — agent Claude en background en ce moment,
  fix les filtres cassés + fetches manquants (2026-04-11)
- ⏸️ **50+ fichiers untracked** dans le repo, à batcher en commits propres
  avant de push

## Recently shipped (2026-04-11)

- ✅ Scaffold monorepo `analytics/` (Next.js 15 + Prisma + Auth.js v5)
- ✅ Schema Prisma multitenant complet + GscDaily
- ✅ Admin API (`x-admin-key`) : tenants, sites, GSC attach, rotate-key, soft delete
- ✅ Endpoints ingestion (`pageview`, `form`, `call`, `gsc`) avec `x-site-key`
- ✅ Tracker JS public (`/tracker.js`) : pageview + form intercept + SPA
- ✅ Clone dashboard GSC Performance (KPIs, graph, 6 dimensions, filtres)
- ✅ Sync GSC depuis API Google (ADC, quota project `veridian-preprod`)
- ✅ 57 tests (28 unit + 29 e2e) 100% verts
- ✅ Instance dev live sur dev-server via Tailscale
- ✅ 5 tenants provisionnés dont 2 vrais clients avec data GSC 90j

## Décisions techniques figées

- **Même stack que Prospection** : Next.js 15 + Prisma + Postgres dédié. Zéro Supabase.
- **Auth Auth.js v5 credentials** local. Pas de SSO pour le MVP.
- **Multitenant jour 1**, scope par `tenantId` → `siteId[]`.
- **Site-key public** (comme Plausible) pour le tracker, rate-limité.
- **Provisioning via skill Claude**, pas via UI client. L'UI admin sert
  surtout à exposer les endpoints à Claude.
- **Deploy direct prod** avec badge BETA. Pas de staging dédié.

## Bugs connus

_(vérifier après le fix de l'agent GSC en cours)_

## Notes agents (chantiers en cours)

- **2026-04-11** : agent `aa94a6f1de8071744` audit `/dashboard/gsc` (filtres
  + fetches manquants), modifie `components/performance-dashboard.tsx`,
  `filters-bar.tsx`, `data-table.tsx`, `kpi-tile.tsx`, `time-series-chart.tsx`,
  `lib/gsc-query.ts`, `app/api/gsc/query/route.ts`. Pas de commit. Attendre
  son rapport avant de toucher ces fichiers.
