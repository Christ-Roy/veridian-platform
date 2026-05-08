# Hub — TODO detaille

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
>
> Le Hub est le point d'entree SaaS : signup, billing, provisioning, vue workspace.
> Next.js 14, App Router, pnpm, Auth.js (en cours), Stripe, Prisma (partiel), Supabase (legacy).

## Etat actuel

- **Version** : voir `hub/package.json`
- **Dernier deploy prod** : voir `gh run list -w hub-ci.yml`
- **URL prod** : https://app.veridian.site
- **URL staging** : https://saas-hub.staging.veridian.site
- **Sante** : 🟡 (fonctionnel mais incomplet, dette Supabase)

## Architecture

```
hub/
├── app/                  # Next.js App Router
│   ├── (auth)/           # signup, login, invite
│   ├── (dashboard)/      # workspace, billing, settings
│   └── api/              # routes API, webhooks Stripe
├── lib/
│   ├── supabase/         # LEGACY — a migrer (voir Chantiers douloureux TODO-LIVE)
│   ├── stripe/
│   └── prisma/           # partiel, en cours de migration
└── prisma/
    └── schema.prisma
```

## Sprint en cours

### P1.1 — Appliquer le standard cross-SaaS (ref TODO-LIVE)
- [ ] Lire `docs/saas-standards.md` quand cree et auditer le Hub contre la checklist
- [x] Soft delete sur la table `tenants` (migration `supabase/migrations/20260117_add_trial_cleanup_columns.sql` : colonne `deleted_at` + index `idx_tenants_deleted_at`)
- [ ] Audit log `platform_audit_log` Prisma (NOTE: aucun modele Prisma dans le Hub aujourd'hui, cf. alerte sous "Decisions techniques")
- [x] Health check `/api/health` conforme (`app/api/health/route.ts` retourne `{ status, timestamp, service }`)

### P1.4 — OAuth Google + 2FA email opt-in ✅ (2026-04-10, hub-auth-builder)
- [x] Agent MCP Chrome : OAuth Client ID Google Cloud Console cree
  - Scope minimal : `openid email profile`
  - Callbacks : prod + staging + localhost
  - Credentials dans `~/credentials/.all-creds.env` (GOOGLE_OAUTH_CLIENT_ID/_SECRET)
- [x] Auth.js v5 Google provider dans `hub/app/api/auth/[...nextauth]/route.ts`
  (+ CredentialsProvider legacy bridge password dans `hub/auth.ts`)
- [x] Cookies session 3 mois (`maxAge: 60 * 60 * 24 * 90`) dans `auth.config.ts`
- [x] Prisma init + schema `hub_app` sur veridian-core-db (User, Account,
  Session, VerificationToken, MfaCode)
- [x] Table `mfa_codes` Prisma (user_id, code_hash, expires_at, consumed_at)
- [x] Toggle 2FA dans `/dashboard/settings/security` (+ `SecurityMfaToggle.tsx`)
- [x] Page `/auth/mfa` avec input code 6 chiffres + resend (cooldown 30s)
- [x] Template mail "Code de connexion Veridian" HTML inline
  (`lib/email/templates/mfa-code.ts`) via Brevo API HTTP
- [x] Tests vitest : 10 tests (8 lib/mfa + 2 template), 109/109 passent total
- [ ] Tests e2e Playwright (hub n'a pas Playwright, a ajouter en P2)

**Decisions techniques cles** :
- Auth.js v5 cohabite avec Supabase Auth legacy (middleware.ts inchange)
- Prisma 7 utilise `@prisma/adapter-pg` + proxy lazy pour eviter d'ouvrir
  une connexion Postgres au build Next.js
- Rate limit MFA : max 5 codes/heure/user (MfaRateLimitError → HTTP 429)
- Codes 6 chiffres crypto-surs (`crypto.randomInt`), hash bcrypt, TTL 10 min
- `.all-creds.env` mis a jour avec GOOGLE_OAUTH_CLIENT_ID/_SECRET (JAMAIS commit)

### P1.5 — Page membres workspace + invitations [2026-04-10]
- [x] Modele Prisma `WorkspaceMember` (workspace_id, user_id, role, invited_at, joined_at)
- [x] Modele Prisma `Invitation` (workspace_id, email, role, token, expires_at, accepted_at)
- [x] Modele Prisma `Workspace` + enum `WorkspaceRole` (OWNER/ADMIN/MEMBER/VIEWER)
- [x] Page `/workspace/members` : liste + invite + change role + remove
- [x] API `POST /api/workspace/invite` (structure + Brevo integre, stub Prisma)
- [x] API `POST /api/workspace/invite/accept` (acceptation token)
- [x] API `PATCH/DELETE /api/workspace/members/[id]` (change role + remove)
- [x] Page `/invite/[token]` pour acceptation (toutes variantes : valid/expired/consumed/wrong account)
- [x] UI adaptee par role : owner / admin / member (canInvite / canChangeRole / canRemoveMember)
- [x] Tests unitaires : permissions par role (24 tests vitest)
- [x] **Entree UI-REVIEW** creee (2 entrees — members page + invite page)
- **Note** : Routes API en mode stub (PRISMA_READY=false) — activer apres `pnpm prisma migrate dev`
  en staging. Les modeles sont dans `prisma/schema.prisma` prets pour la migration.
- **Correction** : `lib/prisma/index.ts` rendu tolerant a l'absence de DATABASE_URL
  en build time (fix bug hub-auth-builder P1.4). Adapter `@prisma/adapter-pg` installe.

### P1.2 — Dissociation UI "SaaS" / "Services de suivi"
- [ ] Home Hub : deux sections distinctes
  - **Vos SaaS** : Prospection, Twenty, Notifuse
  - **Services de suivi** : Analytics (badge BETA)
- [ ] Composant `AppCard` avec support badge `BETA`
- [ ] Lien Analytics : `https://analytics.app.veridian.site`
- [ ] **Entree UI-REVIEW** a creer apres livraison

### P1.6 — Exploiter pleinement les nouvelles routes Notifuse Veridian (sprint 2026-05-08 Notifuse-saasification)

> Le fork `Christ-Roy/notifuse-veridian` (branche `veridian`) expose maintenant
> 7 routes Hub-driven HMAC-signed + 1 endpoint magic link tenant-scoped + 1
> auto-login URL self-contained. Voir `notifuse/README.md` du monorepo pour le
> contrat complet. Le `NotifuseClient` TS existe deja dans `hub/lib/notifuse/`
> et la route `/api/admin/notifuse/magic-link` consomme deja `auto_login_url`.
> Il manque l'integration UI Hub pour exploiter le reste.

**Bouton "Open Notifuse" sur dashboard tenant card** (deja partiellement fait) :
- [x] Bouton appelle `/api/admin/notifuse/magic-link` qui retourne `auto_login_url`
- [x] Click ouvre `auto_login_url` dans nouvel onglet → user logge direct comme owner
- [ ] Verifier que le bouton apparait pour tous les tenants Notifuse (pas juste les nouveaux post-migration)

**Workflow auto-provisioning au signup Hub** (deja partiellement) :
- [x] `provisionNotifuseTenant` dans `hub/utils/tenants/provision.ts` utilise `NotifuseClient.provisionWorkspace`
- [x] Stocke `notifuse_workspace_slug`, `notifuse_api_key`, `notifuse_user_email` dans table `tenants` Supabase
- [ ] Stocker aussi `notifuse_owner_user_id` (UUID retourné par provision) pour cross-ref
- [ ] Affichage live des etapes provisioning (toast / progress) — actuellement silencieux

**Generation token / API key cote Hub** :
- [ ] Page `/dashboard/integrations/notifuse` : afficher l'API key tenant (eyJ... JWT, lecture seule),
  bouton "Reveler" qui demande confirmation 2FA si actif
- [ ] Bouton "Regenerer API key" qui appelle un nouvel endpoint Hub
  `POST /api/admin/notifuse/rotate-api-key` (a creer cote fork Notifuse —
  `WorkspaceService.CreateAPIKey` + invalidation ancienne via revoke)
- [ ] Documenter dans la page : usage de l'API key pour appels SMTP relay,
  webhooks bounce/delivery, etc. (cf `notifuse-templates` skill)

**Magic link a la demande pour user owner** :
- [x] Endpoint Hub `/api/admin/notifuse/magic-link` POST `{tenantId}` → `{autoLoginUrl, magicLink, expiresAt}`
- [x] TenantCard utilise `autoLoginUrl` (preferred, fallback magicLink, fallback console nu)
- [] Bouton "Inviter membre" qui appelle `/api/workspaces.inviteMember` natif Notifuse via API key tenant
- [ ] Liste membres workspace avec roles (cf API `/api/workspaces.members`)
  → meme UI que P1.5 (membres workspace Hub-side) mais lecture cote Notifuse

**Lifecycle Notifuse via Stripe webhooks** (avec override Hub manuel) :
- [ ] **Migration table `tenants`** : ajouter colonnes
  - `notifuse_plan_source` (`stripe` / `manual` / `lifetime_site_vitrine` / `lifetime_partner` / `internal`)
  - `notifuse_plan_set_by_user_id` (qui a defini le plan : Stripe webhook ou Robert)
  - `notifuse_plan_set_reason` (texte libre : "gift_site_vitrine_morel", "partner_program", "test")
  - `notifuse_plan_set_at` (date)
- [ ] Webhook Stripe `customer.subscription.updated` → check `plan_source`. Si
  `=stripe` → `NotifuseClient.updatePlan` (sync). **Si `!=stripe` → log info, ne change pas le plan** (decision business prevaut sur Stripe)
- [ ] Webhook Stripe `invoice.payment_failed` → check `plan_source`. Si `=stripe`
  → `NotifuseClient.suspendWorkspace`. Sinon log warning (Stripe paye autre chose, pas Notifuse)
- [ ] Webhook Stripe `invoice.payment_succeeded` apres suspend → `resumeWorkspace`
- [ ] Cancel subscription → `softDeleteWorkspace` UNIQUEMENT si `plan_source=stripe`
- [ ] **Decision produit** : pas de purge cron silencieuse. Tenant soft-deleted
  reste indefiniment dans Notifuse avec banner "Workspace supprime — reactiver
  avant <date>". Hard delete = action explicite user dans console.

**UI admin Hub : gestion plans tenants** :
- [ ] Page `/admin/tenants/[id]/billing` (admin platform only — `isPlatformAdmin`) :
  - [ ] Affiche plan actuel + source (`stripe` / `manual` / `lifetime_*`)
  - [ ] Dropdown "Changer le plan" avec tous les plans Notifuse + `internal`
  - [ ] Champ texte "Raison" obligatoire (ex: "Cadeau site vitrine Morel Volailles")
  - [ ] Bouton "Appliquer" → POST `/api/admin/notifuse/set-plan` qui :
    - Update `tenants` Hub avec `plan_source=manual` + raison + actor
    - Appelle `NotifuseClient.updatePlan(plan)` cote Notifuse
    - Audit log entry
- [ ] Page `/admin/tenants` : liste tous les tenants avec colonne "Plan Notifuse"
  + filter "Plans non-Stripe" pour voir les cadeaux/partenaires

**Skill Claude `/notifuse-grant-lifetime`** :
- [ ] Quand Robert finit un site vitrine via `/create-site`, propose
  automatiquement de provisioner Notifuse `lifetime_site_vitrine` pour le client
- [ ] Skill input : `tenant_id`, `client_email`, `lifetime_plan` (defaut `lifetime_site_vitrine`)
- [ ] Output : auto_login_url a partager au client + email d'onboarding
- [ ] Audit log Hub : "lifetime granted by Robert for site vitrine X"

**Webhook Hub recoit events Notifuse** (deja fait pour squelette) :
- [x] `hub/app/api/webhooks/notifuse/route.ts` recoit events HMAC, idempotence, dispatch
- [x] Migration colonnes `notifuse_suspended_at`, `notifuse_deleted_at`, `notifuse_emails_sent_this_month`, etc.
- [ ] UI dashboard : afficher quota mois en cours + suspended/deleted state + bouton resume si suspended
- [ ] Email tenant si `tenant.quota_exceeded` event recu (TODO marque dans le code receiver)

**Skill Claude `/notifuse-provision`** (parallele aux autres provisioning skills) :
- [ ] Wrapper du flow Hub provision (HMAC POST `/api/tenants/provision` → magic link)
- [ ] Permet a Robert de provisioner un tenant Notifuse pour un client en 1 commande
- [ ] Aligne avec patterns `analytics-provision`, `cms-provision`

## Backlog Hub-specific

- [ ] Audit hot paths Supabase admin API (P0.2) — verifier que le cache 5min est bien applique partout
- [ ] Page `/billing` : historique factures Stripe, upgrade/downgrade plan
- [ ] Page `/settings/workspace` : nom, logo, domaine custom
- [ ] Onboarding post-signup : wizard 3 etapes (workspace name, invite members, choose plan)
- [ ] Email verification obligatoire au signup (via Brevo + token)
- [ ] Password reset flow complet (token email + page reset)

## Chantier — Hub × Apps : synchronisation tenants + Stripe trial intelligent

> Le Hub orchestre le cycle de vie tenant cross-apps. Aujourd'hui chaque app a sa propre
> DB tenants et son propre login, ça marche mais il manque la couche d'orchestration.
> **Reprise** : `tmp/PROMPT-RESUME-HUB-SYNC.md` (prompt de reprise détaillé).

**Synchronisation tenants Hub → Apps**
- [ ] Mécanisme provisioning à la demande : Hub → POST API provisioning de l'app
- [ ] Pas de duplication tenant entre Hub et apps (mapping `hub_tenant_id ↔ app_tenant_id`)
- [ ] Hook signup Hub : ne PAS provisionner les apps tant que l'utilisateur ne les active pas
- [ ] Endpoint `POST /api/admin/tenants/:id/activate-app` (app: prospection|analytics|notifuse|twenty)
- [ ] Désactivation symétrique : `POST /api/admin/tenants/:id/suspend-app`

**Stripe trial intelligent (par app, pas par tenant)**
- [ ] Le trial Stripe d'une app commence quand le tenant **active** cette app (pas au signup Hub)
- [ ] Chaque app a son propre webhook Stripe `/api/webhooks/stripe` (standard saas-standards.md)
- [ ] Le Hub orchestre : tenant active Analytics le 15/04 → trial Analytics 14j à partir de cette date
- [ ] Table de mapping `tenant_app_subscription` (tenant_id, app, stripe_subscription_id, trial_started_at, trial_ends_at, plan_status)

**Magic link cross-app**
- [ ] Hub génère JWT 5min signé avec `HUB_AUTH_SECRET`
- [ ] L'utilisateur clique sur "Ouvrir Analytics" depuis le Hub → redirect avec token
- [ ] L'app valide le token auprès du Hub (`POST /api/auth/verify-magic-link`)
- [ ] Si valide → connexion auto + cookie session app
- [ ] Évite de gérer des mots de passe synchronisés entre apps
- [ ] Documenter dans saas-standards.md comme contrat standard

**Data bridge Analytics → Twenty CRM**
- [ ] Quand un tenant Twenty est créé, pousser les data Analytics pertinentes
  (contacts forms, appels SIP, métriques GSC) comme activités/contacts dans Twenty
- [ ] API GraphQL Twenty déjà en place, juste le mapping à écrire
- [ ] Job cron toutes les heures : sync incrémentale (timestamp last sync)

**Card Analytics dans le Hub** (déclinaison de P1.2 ci-dessus)
- [ ] Cartes "Vos SaaS" vs "Services de suivi" sur la home
- [ ] Composant `AppCard` avec badge `BETA`
- [ ] Lien vers `analytics.app.veridian.site` (avec magic link une fois implémenté)

## Chantier — Hub admin unifié (vue cross-apps)

> À étendre quand les autres apps seront matures. Pas prioritaire tant que le SSO avancé
> n'est pas en place (cf. chantier douloureux dans TODO-LIVE).

- [ ] Vue unifiée d'un tenant : blocs Prospection / Twenty / Notifuse / Analytics côte à côte
- [ ] Actions centralisées : suspendre, reset quota, force sync Twenty, resend invitation
- [ ] Impersonate workspace (login as avec audit log) — utile pour le support
- [ ] Dashboard admin global : liste tenants, filtres, recherche full-text
- [ ] Audit log `platform_audit_log` Prisma sur toutes les actions admin

## Bugs connus

- [ ] `checkTrialExpired = return false` en prod (hack P0.1) — le trial ne bloque plus personne
- [ ] Pas de validation email au signup (on peut creer un compte avec un email bidon)

## Decisions techniques

- **⚠️ ALERTE PRISMA 2026-04-10** : audit de la codebase confirme qu'il n'y a AUCUN
  fichier `.prisma` dans `hub/`. Le Hub est 100% Supabase SQL (9 migrations dans
  `supabase/migrations/`). Les sprints P1.4 et P1.5 presupposent l'existence de Prisma
  pour declarer `WorkspaceMember`, `Invitation`, `mfa_codes`. **Prerequis** : le teammate
  qui attaque P1.5 doit d'abord initialiser Prisma dans le Hub (schema + migration baseline
  sur la DB Postgres existante ou une DB dediee Hub). A clarifier avec Robert : on rajoute
  un Postgres dedie Hub (comme Prospection) ou on branche Prisma sur la Supabase existante
  via `DATABASE_URL` direct ?
- **Auth.js vs Supabase Auth** : migration vers Auth.js en cours. Supabase reste legacy
  tant que la decommission n'est pas lancee (voir chantier douloureux dans TODO-LIVE).
- **Cookies 3 mois** : decision explicite pour eviter que les tenants perdent leur compte
  facilement. Le 2FA email opt-in compense pour la securite.
- **Pas d'impersonate au debut** : trop risque, reporte en P3.6 quand le SSO avance sera pret.
- **Twenty = hands-off** : aucun fork, uniquement API GraphQL. Custom features dans le Hub.

## ✅ Migration Supabase → Auth.js v5 (TERMINÉE 2026-05-08)

Bascule prod réussie le 08/05/2026 matin. Voir
`session_2026-05-08_hub_authjs.md` en memory pour le retex complet.

**Stack actuelle** : Next 15.5.18 + Auth.js v5 + Prisma 7 + `veridian-core-db` schema `hub_app`.

**Image prod** : `ghcr.io/christ-roy/veridian-dashboard:hub-authjs-staging`
**Compose Dokploy** : `_kxAHDCv1LhvsdwNRX3Vk` (`hub-authjs`)
**Image rollback** : `ghcr.io/christ-roy/veridian-dashboard:rollback-pre-authjs-20260508`

### Dette post-migration à traiter

- [ ] **`NOTIFUSE_HUB_API_SECRET`** non configuré côté Hub (agent C a refacto le client Notifuse vers une nouvelle API). Provisioning Notifuse échoue pour les nouveaux signups jusqu'à config côté Notifuse server + ENV Hub.
- [ ] Helpers e2e Supabase non migrés (`__tests__/api/notifuse-webhook.test.ts` supprimé). À recréer en Auth.js si on remet une CI e2e Hub.
- [ ] Mettre à jour `.github/workflows/hub-ci.yml` job `deploy-prod` pour pointer sur le nouveau compose `_kxAHDCv1LhvsdwNRX3Vk` (actuellement pointe sur le legacy `Rnt_Jz4BhkcyEJ2D6Bugb`).
- [ ] J+30 minimum : cleanup containers Supabase legacy (gotrue/kong/realtime/etc.) après confirmation stabilité prod.
- [ ] Merger `feat/hub-authjs-migration` dans main après 24h de stabilité prod confirmée. ATTENTION : avant merge, basculer le COMPOSE_ID legacy du workflow vers le nouveau, sinon la CI redeploy le compose vide legacy.
- [ ] Promouvoir image `:hub-authjs-staging` → `:latest` une fois stable (cleanup tag intermédiaire).

### Containers prod (référence)

- App GREEN active : `compose-back-up-online-pixel-nl2k9p-hub-authjs-1`
- App BLUE legacy stoppée : `compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1`
- DB cible : `compose-parse-multi-byte-feed-ywg73b-veridian-core-db-1` (hostname `veridian-core-db`)

## Notes agents (chantiers en cours)

_Section mise a jour par les agents au fil de l'eau. Indiquer : qui bosse sur quoi,
blockers, questions en attente pour Robert._

**2026-04-10 — hub-members-builder (P1.5)** :
- Livraison en mode "stub Prisma" : toute la structure est en place (pages, API, types,
  composants UI, tests), mais les routes API retournent 503 tant que `PRISMA_READY=false`.
- Pour activer : basculer `PRISMA_READY=true` dans les 3 routes + lancer
  `pnpm prisma migrate dev --name init_hub_workspaces` sur la DB staging.
- Bug corrige dans `lib/prisma/index.ts` : le client Prisma plantait au build
  quand DATABASE_URL etait absent. Fix = fallback sans adapter.
- A discuter : faut-il creer le Workspace automatiquement a la creation du tenant
  (dans provision.ts) ou a la premiere visite /dashboard/workspace/members ?

## Recently shipped

- **2026-04-10** — Audit sync TODO : `/api/health`, `tenants.deleted_at`, `/api/webhooks` Stripe, `billing.config.ts` plans, `/api/admin/*` deja en place et non suivis dans la TODO
- **2026-04-07** — `.env.example` mis a jour, docs legacy archives
- **feat preexistante (hors TODO)** — `/api/admin/impersonate` deja implemente (prevu en P3.6 dans TODO-LIVE, a repositionner)
- **feat preexistante (hors TODO)** — `/api/prospection/regenerate-login` + colonnes `prospection_provisioned_at` / `prospection_login_token` sur tenants
