# Analytics — TODO detaille (beta POC)

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
>
> Dashboard de metrics pour les sites vitrine clients. Ingestion formulaires +
> call tracking SIP (upload manuel au debut). Multitenant des le jour 1.
> Stack : Next.js 15 + Prisma + Postgres dediee (meme que Prospection, zero Supabase).
>
> **Status** : BETA POC — en construction, affiche avec badge BETA dans le Hub.

## Etat actuel

- **Dossier** : a creer (`analytics/`)
- **URL prod (cible)** : https://analytics.app.veridian.site
- **Sante** : ⚪ (pas encore creee)

## Philosophie

**Boite noire API-only**, zero interdependance avec les autres apps. Pilotable par
webhook depuis le Hub. L'app tourne meme si le Hub est down. Auth locale simple
(Auth.js credentials) au debut, SSO plus tard.

## Architecture cible

```
analytics/
├── src/
│   ├── app/
│   │   ├── (dashboard)/  # /dashboard — vue client
│   │   ├── admin/        # /admin — gestion tenants, sites, sip mapping
│   │   └── api/
│   │       ├── collect/  # /api/collect/form, /api/collect/pageview (public, site_key)
│   │       ├── tenants/  # provisioning (HMAC Hub)
│   │       └── webhooks/stripe
│   └── lib/
├── prisma/
│   └── schema.prisma
└── docs/
    └── integration.md    # GUIDE CLIENT (obligatoire, livre avec la beta)
```

## Sprint en cours

### P1.2 — Analytics beta POC

**Fondations multitenant**
- [ ] Dossier `analytics/` dans le monorepo, stack Next.js 15 + Prisma + PG dediee
- [ ] Auth.js credentials (email/password) — pas de dependance Hub
- [ ] Model Prisma multitenant :
  - [ ] `Tenant` (id, name, site_key, plan, status, created_at, deleted_at)
  - [ ] `User` (id, email, password_hash, tenant_id, role)
  - [ ] `Site` (id, tenant_id, domain, name)
  - [ ] `Pageview` (id, site_id, url, referrer, utm_source, utm_medium, utm_campaign, session_id, created_at)
  - [ ] `FormSubmission` (id, site_id, form_name, payload_json, session_id, created_at)
  - [ ] `SipCall` (id, tenant_id, line_number, caller_number, called_at, duration, source_tag, raw_log_json)
  - [ ] `SipLineMapping` (id, line_number, tenant_id, label, notes) — editable manuellement
- [ ] Migrations Prisma (pas de `db push`, direct Prisma Migrate)

**Endpoints ingestion**
- [ ] `POST /api/collect/form`
  - [ ] Auth : header `X-Site-Key: <site_key>` (public, embarquable frontend)
  - [ ] Body : `{ form_name, payload, session_id, utm_* }`
  - [ ] Valide site_key, resout tenant, insert submission
  - [ ] Rate limit 60 req/min par site_key
- [ ] `POST /api/collect/pageview` (meme auth site_key)

**Pages admin**
- [ ] `/admin/sip-upload` — upload CSV/JSON logs OVH
  - [ ] Parse format OVH voiceConsumption
  - [ ] Match `line_number` contre `SipLineMapping` → assigne tenant
  - [ ] Appels non-mappes → table `sip_unmapped` pour triage manuel
- [ ] `/admin/sip-mapping` — CRUD table `SipLineMapping`
- [ ] `/admin/tenants` — liste tenants + creation manuelle au debut
- [ ] `/admin/sites` — CRUD sites par tenant

**Dashboard client**
- [ ] `/dashboard` — vue user tenant
  - [ ] Stats 30j : pageviews, formulaires, appels recus, taux conversion
  - [ ] Graphique temporel (recharts ou equivalent leger)
  - [ ] Filtres par site, UTM source
  - [ ] Liste dernieres submissions + appels
- [ ] `/dashboard/integration` — page "Comment integrer" avec copie-coller du snippet
- [ ] **Entree UI-REVIEW** a creer apres livraison

**Documentation integration (dans le repo, versionnee, OBLIGATOIRE)**
- [ ] `analytics/docs/integration.md` — guide complet :
  - [ ] Snippet HTML `<script>` tracker pageviews (vanilla, marche partout)
  - [ ] Snippet JS pour binding formulaires HTML natifs (intercepter submit)
  - [ ] Exemple integration Next.js (fetch server-side, server action)
  - [ ] Exemple integration WordPress (shortcode ou plugin minimal)
  - [ ] Comment recuperer le site_key depuis le dashboard
  - [ ] Dev tools : verifier les events (network tab, console)
- [ ] Lien depuis le Hub : card Analytics → "Documentation integration"

**Deploy**
- [ ] Dokploy : service `analytics` sur VPS prod
- [ ] DNS : `analytics.app.veridian.site` → Traefik → container
- [ ] Badge BETA sur la card Hub (cf `hub/components/AppCard.tsx`)
- [ ] Pas de staging dedie au debut (on deploy direct prod avec badge BETA)

## Backlog Analytics-specific (post-beta)

### Call tracking evolution
- [ ] **P2.6** Cron auto : pull API OVH voiceConsumption toutes les 15min → insert `SipCall`
- [ ] Alerte Telegram si appel sans mapping (unmapped line_number)
- [ ] **P3.5** Swap Telnyx + pool de numeros
- [ ] **P3.5** Attribution par page : swap dynamique frontend, matching backend CDR ↔ session
- [ ] **P3.5** Integration Google Ads API (ROAS, CPC, conversion rate)

### Dashboard enrichi
- [ ] **P2.7** Export CSV submissions + appels
- [ ] **P2.7** Filtres avances (date range, UTM combo, source/medium)
- [ ] **P2.7** Comparaison periodes (30j vs 30j precedents)
- [ ] Webhooks sortants : notifier Hub/Notifuse/Slack quand nouveau form submit

### Tracker frontend
- [ ] Bundle JS auto-hosted sur `analytics.app.veridian.site/tracker.js`
- [ ] Auto-tracking clics boutons (data-analytics-track="xxx")
- [ ] SPA support (React Router, Next.js client navigation)

## Bugs connus

_(aucun — app pas encore creee)_

## Decisions techniques

- **Meme stack que Prospection** : Next.js 15 + Prisma + PG dediee. Pas de techno exotique,
  on reste dans ce qu'on maitrise. Chaque app = boite noire independante avec la meme fondation.
- **Zero Supabase** : on ne reproduit pas l'erreur. Auth locale Auth.js direct.
- **site_key vs HMAC** : site_key pour simplicite (comme GA, Plausible). Le site_key est
  public (embarquable dans le JS frontend), mais rate-limite pour eviter l'abus.
- **Multitenant des le debut** : meme si un seul client (Tramtech) au demarrage, on construit
  avec le multitenant en place pour ne pas avoir a refactorer.
- **Upload manuel SIP** : on commence simple. L'automatisation (cron OVH API) viendra en P2.6
  quand le POC aura prouve son interet.
- **Deploy direct prod** : c'est une beta, pas de staging dedie. Badge BETA sur la card Hub.
  Si ca casse, les clients voient "beta" et savent que c'est normal.
- **Doc integration critique** : sans la doc, aucun client ne pourra brancher ses sites.
  **Livrable obligatoire du sprint P1.2**.

## Notes agents (chantiers en cours)

_(vide — app pas encore creee)_

## Recently shipped

_(rien — app a creer)_
