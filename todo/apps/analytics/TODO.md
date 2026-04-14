# Analytics — TODO sprint courant

> **Lire avant de bosser sur Analytics** (ordre recommande) :
> 1. [`LONG-TERM-VISION.md`](./LONG-TERM-VISION.md) — strategie produit long terme
> 2. [`VISION.md`](./VISION.md) — le "pourquoi" court terme et la roadmap
> 3. Ce fichier — les checkboxes actionnables
> 4. [`IDEAS.md`](./IDEAS.md) — propositions Claude hors sprint (a reviewer)
> 5. [`UI-REVIEW.md`](./UI-REVIEW.md) — file d'attente UI polish solo
>
> Source de verite strategique globale : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
>
> Derniere mise a jour : 2026-04-14

## Etat actuel

- **Status** : 🟢 **EN PROD** — tracker v2 + bot detection + schema enrichi deployes
- **URL prod** : `https://analytics.app.veridian.site`
- **Dokploy compose ID** : `compose-synthesize-virtual-transmitter-i9bv43`
- **Container** : `code-analytics-1` sur image `ghcr.io/christ-roy/analytics:latest`
- **Image Docker** : build + push GHCR OK
- **Tests** : 264 unit tests + 5 core E2E verts
- **Auth** : Auth.js v5 credentials
- **Env vars critiques** : `VISITOR_HASH_SALT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` dans Dokploy

### Data en DB

| Tenant (slug) | Domaine | GSC rows 90j | Client reel ? |
|---|---|---|---|
| `veridian` | veridian.site | 229 | Interne |
| `arnaudcapitaine-com` | arnaudcapitaine.com | 15 | Interne |
| `app-veridian-site` | app.veridian.site | 2 | Interne |
| `tramtech-depannage-fr` | tramtech-depannage.fr | 2779 | Client actif |
| `morel-volailles-com` | morel-volailles.com | 137 | Client actif |
| (a creer) | apical-informatique.fr | - | Client a provisionner |

### Deploy

Le CI e2e-staging a un test flaky (`03-dashboard.spec.ts` sidebar "Appels"
link timeout) qui bloque le deploy-prod auto. Workaround : deploy manuel
via `ssh prod-pub` + `docker compose pull && up -d` dans
`/etc/dokploy/compose/compose-synthesize-virtual-transmitter-i9bv43/code/`.

## A faire — priorite haute

### Bugs a fixer

- [ ] **Endpoint manquant : ajout membre a un tenant existant.**
  `POST /api/admin/tenants/:id/members` renvoie 404. Cas reel : Morel
  Volailles sans OWNER → endpoint `POST /api/admin/tenants/:idOrSlug/members`
  avec `{ email, role }`, connectOrCreate User
- [x] ~~Service `calls` marque actif a tort~~ — fix : calls actif uniquement
  si sipCalls > 0, les CTA tel: ne suffisent plus (2026-04-15)
- [x] ~~CORS `navigator.sendBeacon` casse sur les sites clients~~ — fix :
  retiré sendBeacon (force credentials:include), gardé fetch avec
  keepalive:true + credentials:omit (2026-04-15)
- [ ] **Ecart forms trackes vs forms envoyes** sur Morel (6 trackees, 2
  delivrees Brevo). Verifier que le Worker Cloudflare appelle
  `trackVeridianForm` apres envoi Brevo OK, pas avant
- [ ] **CI e2e-staging flaky** `03-dashboard.spec.ts` — soit fixer le test,
  soit le marquer non-bloquant pour debloquer le deploy auto

### Provisioning clients

- [ ] Provisionner Apical Informatique (tenant + site + GSC si dispo)
- [ ] Verifier que les tenants Tramtech et Morel sont bien tagges "client"
- [ ] Creer des users clients (email Robert pour l'instant)

### Scope tenant strict

- [ ] Quand un user non-admin se loggue, queries filtrees par son tenantId
- [ ] Robert (admin) garde l'acces multi-tenant : selecteur de tenant
- [ ] Tests e2e : login tramtech → ne voit QUE tramtech

### Page d'accueil gamifiee

- [ ] Remplacer `/dashboard` par "Mon score Veridian"
- [ ] Composant score de performance (somme ponderee services actifs)
- [ ] Blocs service actif/inactif avec CTA shadow marketing

### Doc d'integration client

- [ ] Creer `analytics/docs/integration.md` — snippet tracker + tagging forms
- [ ] Template mention legale pour les sites clients

### Repointer demo.veridian.site

- [ ] `sites/demo-analytics/app/layout.tsx` ligne 19 : changer
  `analytics-staging.veridian.site` → `analytics.app.veridian.site`

## A faire — priorite moyenne

### F.2 — API d'audit qualite d'un site client

Endpoint `POST /api/admin/sites/:siteId/audit` qui declenche un scan
(Playwright + HTTP) et retourne un rapport JSON score avec checks SEO,
tracker, images, sitemap, etc. Module `lib/audit/checks/` extensible.

- [ ] Backend : module checks + AuditRun table + endpoint
- [ ] Endpoint `GET /api/admin/sites/:siteId/audit/latest` avec diff
- [ ] Integration skill `optimize-site` + `create-site`
- [ ] Dashboard `/dashboard/audit` (historique scores)

### F.3 — Funnel de conversion + user linking

Table `Lead` + `LeadSession` (deja dans le schema Prisma). Linking par
email/phone au form submit, pas par cookie.

- [ ] Backend : logique de linking au FormSubmission
- [ ] Dashboard `/dashboard/leads` — timeline, sessions, funnel
- [ ] Dashboard `/dashboard/funnel` — configurable, taux drop-off
- [ ] Export CSV des leads
- [ ] RGPD : endpoint DELETE lead, retention 24 mois, mentions legales

### F.7 — Form schemas et views contextuelles

Table `FormSchema` deja dans Prisma.

- [ ] Endpoints CRUD form-schemas
- [ ] Endpoint breakdown dynamique `groupBy payload->'Z'`
- [ ] Composant dashboard `FormBreakdownChart`
- [ ] Auto-discover au provisioning

### Call tracking

- [ ] Decider fournisseur : OVH voiceConsumption (gratuit) vs Telnyx
- [ ] Script sync API → POST `/api/ingest/call`
- [ ] Mapping numero → site
- [ ] Cron quotidien

### Tests supplementaires

- [ ] Test rate limit "utilisateur qui va vite" (scroll rapide, 2 forms)
- [ ] Test double submit formulaire
- [ ] Test SPA navigation rapide (10 pages en 20s)
- [ ] Test bot borderline (UA legitime, zero interaction)
- [ ] Monitoring rate limit drops (429 par jour par siteKey)

### Observabilite

- [ ] Dashboard admin : voir les rejets recents par siteKey
  (CORS, rate limit, siteKey invalide, bot, spam referrer)

## A faire — priorite basse (backlog)

### F.4.4 — Breakdowns UI

Tous par `groupBy` + `countDistinct visitorHash` :

- [ ] Par navigateur, OS, device type
- [ ] Par pays / region / ville (carte interactive)
- [ ] Par source de trafic / referent specifique
- [ ] Par heure de la journee (heatmap 24h x 7j)
- [ ] Par taille d'ecran, langue, timezone, connexion reseau

### F.5 — Integration skills Claude

- [ ] `/analytics audit <domain>` — lance F.2 + affiche resultats
- [ ] `/analytics lead <domain> <email>` — timeline complete
- [ ] `/analytics quality <domain>` — pageviews douteux recents
- [ ] Push Telegram quand lead a fort intent visite 3x en 7j
- [ ] Dashboard `/admin/health` cross-tenant sante portefeuille

### F.6 — Batterie de tests tracking

Endpoint `POST /api/admin/sites/:siteId/tracking-audit` — Playwright
headful sur le serveur Analytics qui teste check par check le tracking.

- [ ] Backend + 30+ tests specifiques (voir VISION.md pour le detail)
- [ ] Modes quick (10s) / full (60-90s) / nightly
- [ ] Skill `/analytics track-audit <domain>`
- [ ] Cron 6h tracking-audit quick sur chaque site actif
- [ ] Dashboard admin `/admin/tracking-health`

## Shipped

### 2026-04-14 soir — Backend v2 + Deploy prod

- [x] **Schema Prisma enrichi** : Pageview 55+ champs (visitorHash sale,
  IP brute, deviceHash, browser/OS/device parses ua-parser-js, geo CF,
  locale, reseau, UTM + gclid/fbclid, comportement session-end).
  FormSchema (F.7). Lead/LeadSession (F.3)
- [x] **Bot detection** (`lib/quality.ts`) : checkBot() binaire 40+ patterns,
  isSpamReferrer() 30+ domaines, categorizeReferrer(), computeVisitorHash()
  sale, computeDeviceHash()
- [x] **Tracker.js v2** : payload enrichi, detection interaction simple,
  session-end beacon au unload, mode debug `?veridian_debug=1`
- [x] **Routes ingestion** : pageview refactorise, interaction (nouveau),
  session-end (nouveau), form enrichi. Rate limit IP 20/min + siteKey 100/min
- [x] **Dashboard filtre** : `isBot=false AND interacted=true` sur toutes
  les queries
- [x] **264 unit tests** + 11 E2E tests (6 passent, 5 skip attente deploy)
- [x] **Deploy prod** Dokploy, image GHCR, DNS analytics.app.veridian.site

### 2026-04-11 — MVP + Provisioning

- [x] Scaffold monorepo `analytics/` (Next.js 15 + Prisma + Auth.js v5)
- [x] Schema Prisma multitenant complet + GscDaily
- [x] Admin API (`x-admin-key`) : tenants, sites, GSC, rotate-key, soft delete
- [x] Endpoints ingestion (pageview, form, call, gsc) avec `x-site-key`
- [x] Tracker JS public (`/tracker.js`) : pageview + form intercept + SPA
- [x] Clone dashboard GSC Performance (KPIs, graph, 6 dimensions, filtres)
- [x] Sync GSC depuis API Google (ADC, quota `veridian-preprod`)
- [x] 57 tests (28 unit + 29 e2e) verts
- [x] Instance dev live sur dev-server via Tailscale
- [x] 5 tenants provisionnes dont 2 vrais clients avec data GSC 90j
- [x] Skill `analytics-provision` fonctionnel

## Decisions techniques figees

- **Stack** : Next.js 15 + Prisma + Postgres dedie. Zero Supabase.
- **Auth** : Auth.js v5 credentials local. Pas de SSO pour le MVP.
- **Multitenant jour 1**, scope par `tenantId` → `siteId[]`.
- **Site-key public** pour le tracker, rate-limite.
- **Provisioning via skill Claude**, pas via UI client.
- **Visitor hash stable** : `sha256(siteId + ip + ua)` sans salt rotatif.
  Precision > RGPD a l'echelle actuelle (pas de DPO, pas d'audit CNIL).

## Notes agents

_(vide — utiliser ce bloc pour notes en cours de sprint)_
