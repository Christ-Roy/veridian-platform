# TODO-LIVE — Veridian Platform

> Source de verite unique pour le backlog. Mis a jour a chaque session.
> Derniere update : 2026-04-07.
>
> **Repo** : github.com/Christ-Roy/veridian-platform (public)
> **CI** : self-hosted runner sur dev server + cloud GitHub
> **Blocker actuel** : aucun (billing GitHub fixe via passage public)

## Mode de travail — Agent Teams

> **Toutes les taches ci-dessous doivent etre realisees en mode Agent Team** (TeamCreate + teammates specialises).
> Le lead agent ne code pas : il delegue aux teammates, surveille la CI/CD, valide les resultats,
> et s'assure que chaque feature arrive proprement en prod.
>
> **Lead agent** = chef d'orchestre :
> - Lit cette TODO, planifie le sprint, dispatche les taches
> - Lance les teammates en parallele (3-4 max, fichiers differents)
> - Surveille les runs CI (unit → build → integration → e2e-core → deploy)
> - Valide que le staging est vert avant promote → main → prod
> - Ne touche au code que pour debloquer un teammate ou fixer la CI
> - **Met a jour cette TODO en permanence** : cocher les taches finies, ajouter des taches
>   quand la CI revele des problemes (test fail, build casse, warning, regression)
> - **Alimente les teammates en continu** : si un agent finit sa tache, lui en donner une
>   nouvelle immediatement depuis cette TODO. Pas de temps mort, pas d'agents idle.
>   L'objectif c'est que la CI tourne en continu avec du code frais a valider.
>
> **Teammates** = executants specialises (1 tache chacun) :
> - Codent, testent localement, commitent
> - Signalent au lead quand c'est pret pour review/push
>
> Objectif : shipper vite, shipper propre, ne jamais casser la prod.

## CI/CD — Comment ca marche, role du lead agent

> **La CI est le filet de securite. Le lead agent en est le garant et le responsable.**
>
> ### Flow actuel (Prospection)
> ```
> push staging → unit (55s) → build (1m20s) → integration (51s)
>             → docker-staging (self-hosted) → deploy-staging → e2e-core (BLOQUANT)
>             → e2e-extended (3 browsers, non-bloquant)
>             → promote staging → main (ff-only auto)
> push main   → docker (self-hosted) → deploy-prod (36s)
>             → e2e-prod (3 browsers, BLOQUANT)
>             → rollback auto si e2e-prod fail (retag :rollback → :latest + redeploy)
> ```
>
> ### Flow actuel (Hub)
> ```
> push main → test (lint+build) → docker (self-hosted) → deploy-staging + deploy-prod en parallele
>           → health check prod
> ```
>
> ### Ce que ca veut dire pour le lead agent
> - **On peut shipper vite** : du push au prod verifie en ~13min, tout automatise
> - **Le rollback est automatique** : si e2e-prod fail, l'ancienne image est restauree en 30s
> - **Le lead ne code pas, il surveille** : lancer `gh run list`, `gh run view <id>`,
>   verifier que chaque push passe vert, diagnostiquer immediatement si un job fail
> - **Si la CI casse, TOUT s'arrete** : pas de "on verra plus tard". Le lead doit fixer
>   ou creer une tache pour un teammate avant de continuer a shipper
> - **La CI doit etre 100% anti-regression** : chaque bug trouve = un test ajoute.
>   Chaque test qui fail = un fix. Jamais de skip, jamais de `continue-on-error` sur du core.
>   Le lead est responsable de maintenir et enrichir la CI au fil des sprints.
> - **Ajouter des taches dans cette TODO** des qu'un probleme CI est detecte :
>   test flaky, build warning, regression, coverage insuffisante, job trop lent.
>   Ces taches alimentent les teammates en continu.

---

## P0 — Bloquant / Urgent

### P0.0 — DONE : Kong rate-limit par IP client (2026-04-07)
- [x] Diagnostic : limit_by absent → default = consumer (tous les users dans le meme bucket)
- [x] Fix v1 : `limit_by: header` + `header_name: X-Real-IP` — probleme : requetes Docker internes sans header = meme bucket
- [x] Fix v2 : `limit_by: ip` — Kong utilise ngx_realip (TRUSTED_IPS + REAL_IP_HEADER) pour resoudre l'IP client
- [x] Limites : 100/min open routes, 200/min auth routes
- [x] **Staging** : kong-resolved.yml + compose Dokploy synces, teste OK
- [x] **Prod** : kong.yml mis a jour, teste OK
- [x] **Tests violents** : flood 101 req → 429, IPs externes isolees, flood Docker interne n'impacte PAS l'externe
- [x] **Perennite** : compose Dokploy prod/staging ont KONG_PLUGINS, kong.yml persiste sur disque VPS, repo = source de verite

### P0.1 — CVE next@15.3.3 (prospection)
- [x] `npm install next@15.5.14` — fait le 7 avril
- [ ] Verifier que le build CI passe avec la nouvelle version

### P0.7 — Kong staging rate-limit vs e2e (2026-04-07)
- [x] **Diagnostic** : le runner self-hosted est sur le meme serveur que staging.
  Les 33 e2e tests passent par l'URL publique → Traefik → Kong, et Kong rate-limit
  le runner a 100 req/min. Tests auth fail avec 429, login timeout, cascade de fails.
  L'agent qui a push a diagnostique "Supabase staging down" alors que c'etait le rate-limit.
- [x] **Fix** : limites staging = 2x prod (200/min open, 400/min auth).
  Assez pour absorber les 33 e2e (~150 req auth en 3min), mais assez bas pour detecter
  un vrai bug de flood dans le code (boucle, appel sans cache, etc.).
  Le staging reste fidele a la prod — si un commit introduit un hot path a 500 req/min,
  le staging le bloquera avant que ca arrive en prod.
- [x] **Prod inchangee** : 100/min open, 200/min auth. C'est le vrai garde-fou.

### P0.6 — Stratégie OSS : Notifuse fork + Twenty hands-off
- [x] Script `ci/check-oss-versions.sh` pour détecter les mises à jour
- [ ] **Notifuse** : fork léger `Christ-Roy/notifuse`, branche `veridian` pour nos modifs.
  Image custom `ghcr.io/christ-roy/notifuse-veridian`. Merge upstream pour les updates.
- [ ] **Twenty** : NE PAS forker. Utiliser via API GraphQL comme boîte noire.
  Updates = simple bump d'image dans docker-compose. Custom features dans le Hub.

### P0.8 — CRITIQUE : promote staging→main ne declenche PAS le pipeline prod
- [x] **Diagnostic** (2026-04-07) : le job `promote-to-main` fait un `git push origin main`
  avec `GITHUB_TOKEN` — GitHub ne declenche PAS de nouveau workflow quand le push
  vient d'un `GITHUB_TOKEN` (protection anti-boucle infinie).
  Resultat : le code arrive sur main mais le docker build + deploy prod + e2e-prod
  ne se lancent JAMAIS automatiquement. Le fix du 7 avril n'est arrive en prod que
  par un `gh workflow run` manuel.
- [ ] **Fix** : remplacer `GITHUB_TOKEN` par un PAT (fine-grained, scope `contents: write`)
  dans le job promote. Stocker comme secret `PROMOTE_PAT`.
  Alternative : GitHub App token via `actions/create-github-app-token`.
- [ ] **Robert** : creer le PAT sur github.com/settings/tokens (fine-grained, repo veridian-platform,
  permissions: contents read+write). Ajouter comme secret `PROMOTE_PAT` dans le repo.

### P0.2 — checkTrialExpired = return false en prod
- [ ] Hack temporaire depuis le sprint du 6 avril. Le trial ne bloque plus personne.
- [ ] Recabler proprement : lookup tenant via workspace_members, cache 5min, pas d'admin API

### P0.3 — Rate-limit Supabase admin API
- [x] Cache getTenantProspectLimit 5min
- [x] E2e-prod login-only (plus de signup)
- [x] Test guard CI (check-supabase-ratelimit.sh)
- [ ] Verifier que AUCUN hot path n'appelle admin API sans cache (audit complet)

### P0.4 — Valider compte prod robert.brunon@veridian.site
- [ ] Lire table `public.tenants` prod en read-only pour verifier le mapping user_id → tenant_id
- [ ] Si absent → creer manuellement via admin API

### P0.5 — Lead quota freemium + pricing
- [x] Module lead-quota.ts cree, SQL teste
- [x] Freemium 300 leads wire dans /api/prospects
- [ ] Payant geo ~20EUR/mois : tous les leads de la zone departementale
- [ ] Payant full ~50EUR/mois : toute la DB 996K
- [ ] Achat par lot (one-shot) : 100 leads = 10EUR
- [ ] UI onboarding : choix zone geo + secteur → distribution 300 leads

---

## P1 — Prochain sprint

### P1.0 — STRUCTURANT : Prospection = boite noire autonome (decouplage Supabase)
> Aujourd'hui Prospection depend de Supabase pour l'auth, la resolution tenant, et les limites de plan.
> Si Supabase tombe, Prospection tombe. Twenty et Notifuse sont deja independants, pas Prospection.
> Objectif : Prospection devient une boite noire comme les autres, pilotable entierement par API + webhooks Stripe.
- [ ] **Auth propre** : migrer de Supabase Auth vers Auth.js (NextAuth) ou Lucia
  - Table `users` dans Prisma (email, password hash, role)
  - JWT en cookie, meme UX que maintenant
  - Le hub provisionne via `POST /api/tenants/provision` (cree le user Prisma au lieu du user Supabase)
  - Login token : meme pattern, stocke en Prisma au lieu de la table `tenants` Supabase
- [ ] **Table tenants locale** : migrer `tenants.prospection_plan`, `prospection_config`, limites → Prisma
  - Le hub pousse le plan via l'API de provisioning
  - Stripe webhooks directs dans Prospection pour les changements de plan
- [ ] **Supprimer toute dependance Supabase** dans prospection/ :
  - `src/lib/supabase/` → remplacer par auth locale
  - `getTenantId()` → lecture Prisma locale
  - `getTenantProspectLimit()` → lecture Prisma locale
  - `requireAuth()` → validation JWT locale
  - Variables d'env : virer `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- [ ] **API contract** : documenter les endpoints que le Hub utilise pour piloter Prospection
  - `POST /api/tenants/provision` — creation tenant + user
  - `POST /api/tenants/update-plan` — changement de plan (appele par Hub ou Stripe webhook)
  - `GET /api/tenants/status` — health check tenant
- [ ] **Integration Stripe directe** : Prospection gere son propre billing
  - Webhook Stripe dans Prospection (`/api/webhooks/stripe`)
  - Source de verite = Stripe, pas le Hub
- [ ] **Tests** : e2e auth flow sans Supabase, tenant isolation, plan limits

### P1.1 — CI → trunk-based + tests core
- [x] Self-hosted runner installe sur dev server
- [x] docker/deploy/e2e sur self-hosted (docker build 25s, deploy 11s)
- [x] Integration test fix (FK constraint cleanup)
- [x] **Hub deploy-staging fix** : runner passe de `ubuntu-latest` (cloud) a `self-hosted` — le dev server
  n'avait pas d'auth GHCR, le pull echouait. Maintenant le runner self-hosted pull localement
  (comme prospection). Commit `fix(ci): hub deploy-staging on self-hosted runner` (2026-04-07)
- [ ] **Separer tests core vs extended** :
  - core/ (5 specs, ~2min, BLOQUANT) : auth-login, prospects-crud, pipeline-flow, health, tenant-isolation
  - extended/ (15 specs, NON-BLOQUANT) : admin, search, export, mobile, etc.
- [ ] **Core sur self-hosted** (rapide, gate bloquant)
- [ ] **Extended sur cloud** en parallele, sharde sur 3 browsers (chromium/firefox/webkit)
- [ ] **Tests lourds en batch** : toutes les 3h ou tous les 5 commits, clone DB prod + migrations + e2e complet
- [ ] **Health check prod post-deploy** : 1 spec login-only, pas de signup (pas de rate limit)
- [ ] Trunk-based : supprimer staging, tout sur main, chaque push = test = prod
- [ ] hub-ci.yml : memes principes (test cloud + docker self-hosted)
- [ ] Lier package GHCR `veridian-dashboard` au repo monorepo (Robert: settings package)
- [ ] **Node.js 20 deprecation** : actions GitHub (checkout@v4, setup-node@v4) seront forcees en
  Node.js 24 le 2 juin 2026. Pas urgent mais a planifier avant cette date.

### P1.2 — Polish UI invitations
- [ ] Loader bouton "Accepter l'invitation" (anti double-clic)
- [ ] Dialog "copier lien" inline dans la table
- [ ] Logo Veridian sur /invite/[token]
- [ ] Dashboard /admin : ligne "Invitations recentes"

### P1.3 — Bugs post-sprint
- [ ] twenty.ts getQualifications : verifier SIREN→web_domain en staging
- [ ] /segments/rge/sans_site : root cause serveur (body vide)
- [ ] DB locale postgres:5433 pas migree → documenter `npm run db:fresh:siren`

---

## P2 — Court terme (cette semaine)

### P2.1 — Tests e2e manquants
- [ ] pipeline-kanban.spec.ts (drag & drop statuts)
- [ ] phone-call-flow.spec.ts (Telnyx SIP)
- [ ] stripe-paywall.spec.ts (trial expired → paywall)
- [ ] claude-ai-flow.spec.ts (note Claude, delete)
- [ ] global-full-flow.spec.ts (parcours complet)

### P2.2 — Tests API smoke par domaine
- [ ] test-prospects-api.ts
- [ ] test-segments-api.ts
- [ ] test-stats-api.ts
- [ ] test-outreach-api.ts
- [ ] test-twenty-api.ts

### P2.3 — Monitoring / observabilite
- [ ] Dashboard admin uptime + error rate (consommant /api/status + /api/errors)
- [ ] Sentry ou equivalent cote serveur

### P2.4 — Feature invitations V1.5
- [ ] Resend invitation (bouton "Renvoyer le mail")
- [ ] Bulk invite via CSV (max 50 emails/batch)
- [ ] Fine-grained roles : viewer, sales, admin_workspace

### P2.5 — Monorepo cleanup
- [ ] Nettoyer infra/ : virer les docs legacy (AGENTS.md, SOUL.md, IDENTITY.md, etc.)
- [ ] Nettoyer hub/ : virer tmp/archives si present
- [ ] Ajouter .env.example pour hub/ et prospection/

---

## P3 — Long terme (> 1 mois)

### P3.1 — MONTE EN P1.0 (voir ci-dessus)

### P3.2 — UX polish
- [ ] Dark mode (infra livree, polish pages)
- [ ] Command palette (livree)
- [ ] Mobile responsive (basique fait)
- [ ] Keyboard shortcuts + command palette enrichie

### P3.3 — Refactor & quality
- [ ] Hooks custom dans src/hooks/
- [ ] Tests unitaires lib/queries (mock Prisma)
- [ ] OpenAPI/Swagger genere depuis les routes API
- [ ] Migration depuis any vers types stricts

### P3.4 — Securite V2
- [ ] Rotate TENANT_API_SECRET staging ET prod + HMAC par tenant
- [ ] Migrer ADMIN_EMAILS hardcode vers table platform_admins
- [ ] 2FA obligatoire pour les admins
- [ ] CSP strict

### P3.5 — Infra & scaling
- [x] Separer DBs : Prospection a deja sa Postgres dediee (staging + prod). Decouplage auth → P1.0
- [ ] CDN Cloudflare devant Dokploy pour assets statiques
- [ ] Backup automatique Postgres staging + prod
- [ ] CI : job test-prod-migration (pg_dump prod → stack-test → migrations → smoke)

### P3.6 — Multi-tenant entreprise (Phase 2 roadmap)
- [ ] Table organizations dans Supabase
- [ ] Mapping : 1 org = 1 workspace Twenty = 1 tenant Prospection
- [ ] Billing par org, pas par user
- [ ] Donnees partagees au sein de l'org

---

## Historique sessions recentes

- **2026-04-07** : Kong rate-limit par IP (fix v2 `limit_by: ip`), tests violents staging+prod, audit archi Supabase → P1.0 decouplage Prospection
- **2026-04-06 soir** : Migration monorepo, self-hosted runner, CI refactor
- **2026-04-06 sprint** : 50+ commits, INPI v3.6, admin pages, Stripe, 30 e2e specs
- **2026-04-05** : SIREN refactor + invitations V1 (47 commits, 7 teammates)
- **2026-04-03-04** : Env var fixes, API admin, CI auto-deploy + rollback, 52 e2e tests
