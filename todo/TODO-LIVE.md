# TODO-LIVE — Veridian Platform

> Source de verite strategique pour le backlog. Mis a jour a chaque session.
> Derniere update : 2026-04-10.
>
> **Repo** : github.com/Christ-Roy/veridian-platform (public)
> **CI** : self-hosted runner sur dev server + cloud GitHub
> **Blocker actuel** : aucun
>
> ## Ce fichier vs TODO par app
>
> Ce fichier = **vue strategique globale** (ordre des sprints, arbitrages, chantiers douloureux).
> Pour les **sous-taches detaillees, bugs, decisions techniques, notes agents** d'une app,
> consulter les TODO dediees :
> - [`apps/hub/TODO.md`](./apps/hub/TODO.md) — Hub SaaS
> - [`apps/prospection/TODO.md`](./apps/prospection/TODO.md) — Dashboard prospection
> - [`apps/notifuse/TODO.md`](./apps/notifuse/TODO.md) — Notifuse fork (a creer)
> - [`apps/analytics/TODO.md`](./apps/analytics/TODO.md) — Analytics beta POC (a creer)
> - [`apps/twenty/TODO.md`](./apps/twenty/TODO.md) — Twenty hands-off
>
> **Polish UI solo** : chaque app a son `UI-REVIEW.md` — file d'attente pour Robert en session
> standalone, hors sprint. Les agents livrent fonctionnel, Robert polish ensuite tranquillement.
>
> **Regle agent** : avant de bosser sur une app → lire sa `TODO.md`. Pendant → cocher et noter.
> A chaque livraison UI → entree dans `UI-REVIEW.md`. A la fin → archiver en "Recently shipped".

## Sommaire

- [Mode de travail — Agent Teams](#mode-de-travail--agent-teams)
- [CI/CD — Flow et role du lead](#cicd--flow-et-role-du-lead)
- [P0 — Bloquant / Urgent](#p0--bloquant--urgent)
- [P1 — Sprint en cours](#p1--sprint-en-cours)
- [P2 — Court terme](#p2--court-terme)
- [P3 — Long terme](#p3--long-terme)
- [⚠️ Chantiers douloureux — NE PAS commencer sans accord Robert](#chantiers-douloureux)
- [Recently shipped](#recently-shipped)
- [Historique sessions](#historique-sessions)

---

## Mode de travail — Agent Teams

> **Toutes les taches ci-dessous doivent etre realisees en mode Agent Team** (TeamCreate + teammates specialises).
> Le lead agent ne code pas : il delegue aux teammates, surveille la CI/CD, valide les resultats,
> et s'assure que chaque feature arrive proprement en prod.
>
> **Lead agent** = chef d'orchestre :
> - **Modele : Opus 4.6 avec contexte 1M tokens** (vue long terme, planification, arbitrages)
> - Lit cette TODO, planifie le sprint, dispatche les taches
> - Lance les teammates en parallele (3-4 max, fichiers differents)
> - Surveille les runs CI (unit → build → integration → e2e-core → deploy)
> - Valide que le staging est vert avant promote → main → prod
> - Ne touche au code que pour debloquer un teammate ou fixer la CI
> - **Met a jour cette TODO en permanence** : cocher les taches finies, ajouter des taches
>   quand la CI revele des problemes (test fail, build casse, warning, regression)
> - **Alimente les teammates en continu** : si un agent finit sa tache, lui en donner une
>   nouvelle immediatement depuis cette TODO. Pas de temps mort, pas d'agents idle.
>
> **Teammates** = executants specialises (1 tache chacun) :
> - **Modele selon complexite** :
>   - Taches simples (tests, lint, rename, copy, UI polish) → **Sonnet 4.6**
>   - Taches complexes (refactor, archi, debug CI, migration) → **Opus 4.6**
>   - **JAMAIS Haiku sur du code metier** — ca cree des allers-retours qui crament plus de
>     contexte que ce qu'on economise en cout token
> - Codent, testent localement, commitent
> - Signalent au lead quand c'est pret pour review/push
>
> **Regle d'or** : la CI est le filet de securite. Tant qu'elle est 100% anti-regression
> et envoie en prod automatiquement, on peut se permettre de deleguer beaucoup.
> Mais jamais de compromis sur la CI elle-meme.
>
> Objectif : shipper vite, shipper propre, ne jamais casser la prod.

## CI/CD — Flow et role du lead

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
> - **Le lead ne code pas, il surveille** : `gh run list`, `gh run view <id>`,
>   verifier que chaque push passe vert, diagnostiquer immediatement si un job fail
> - **Si la CI casse, TOUT s'arrete** : pas de "on verra plus tard". Le lead doit fixer
>   ou creer une tache pour un teammate avant de continuer a shipper
> - **La CI doit etre 100% anti-regression** : chaque bug trouve = un test ajoute.
>   Chaque test qui fail = un fix. Jamais de skip, jamais de `continue-on-error` sur du core.
> - **Ajouter des taches dans cette TODO** des qu'un probleme CI est detecte :
>   test flaky, build warning, regression, coverage insuffisante, job trop lent.
> - **Batch les commits** : les agents commitent localement, le lead batch 3-5 commits
>   par push. Max 1 push / 15 min. JAMAIS de ping-pong commit-push-fix-push.

---

## P0 — Bloquant / Urgent

> Tout ce qui doit etre fixe AVANT de continuer a shipper des features.
> Si un item P0 traine, le lead doit l'adresser en priorite absolue.

### P0.1 — checkTrialExpired = return false en prod
- [ ] Hack temporaire depuis le sprint du 6 avril. Le trial ne bloque plus personne.
- [ ] Recabler proprement : lookup tenant via workspace_members, cache 5min, pas d'admin API
- **2026-04-10** : audit confirme toujours `return false` dans `prospection/src/lib/trial.ts:10-11`, bien que `useTrial` hook + paywall UI soient deja en place

### P0.2 — Audit hot paths Supabase admin API [RESOLU 2026-04-10]
- [x] Cache getTenantProspectLimit 5min
- [x] E2e-prod login-only (plus de signup)
- [x] Test guard CI (check-supabase-ratelimit.sh)
- [x] Audit complet : `getTenantProspectLimit` avec `planCache` (TTL 5min) confirme dans `prospection/src/lib/supabase/tenant.ts:109-160`. Hot paths `/api/prospects`, `/api/leads` passent via ce helper.

### P0.3 — Valider compte prod robert.brunon@veridian.site
- [ ] Lire table `public.tenants` prod en read-only pour verifier le mapping user_id → tenant_id
- [ ] Si absent → creer manuellement via admin API

### P0.4 — Integration tests flaky (continue-on-error temporaire)
- [x] Diagnostic : tenant-isolation et workspace-isolation partagent une DB Postgres ephemere en CI.
- [x] Workaround : `continue-on-error: true` + retire des `needs` du promote. Non-bloquant.
- [ ] **Fix propre** : investiguer le root cause (probablement visibility Prisma ou auto-increment)
  - Chaque fichier dans sa propre DB, OU transactions rollback beforeAll/afterAll, OU merge fichiers
- [ ] **Re-activer comme bloquant** une fois fixe

### P0.5 — CVE next@15.3.3 (prospection) [RESOLU 2026-04-10]
- [x] `npm install next@15.5.14` — fait le 7 avril
- [x] Build CI vert avec `next@^15.5.14` (confirme dans `prospection/package.json:33` + derniers runs `gh run list -w prospection-ci.yml`)

### P0.6 — Finir le plan pricing Prospection
- [x] Module lead-quota.ts cree, SQL teste
- [x] Freemium 300 leads wire dans /api/prospects (distribution selon `score_dept`)
- [ ] Payant geo ~20EUR/mois : tous les leads de la zone departementale
- [ ] Payant full ~50EUR/mois : toute la DB 996K
- [ ] Achat par lot (one-shot) : 100 leads = 10EUR
- [ ] UI onboarding : choix zone geo + secteur → distribution 300 leads

---

## P1 — Sprint en cours

> **Objectif sprint** : peupler le Hub rapidement, le rendre pro, et poser les fondations
> multitenant propres pour les nouveaux services sans toucher aux sujets douloureux.
> On accepte la dette Supabase pour l'instant (voir section Chantiers douloureux).

### P1.0 — Provisionner `veridian-core-db` (Postgres dedie, hors Supabase) [2026-04-10]

> **Contexte — decision 2026-04-10** : au lieu de brancher Prisma Hub sur la Postgres
> Supabase existante (chemin legacy, aggraverait la dette), on provisionne un **nouveau
> Postgres dedie** partage par le Hub (tables app) et Analytics (nouveau service). Ce sera
> la **brique de base du futur post-Supabase** — toute nouvelle table/feature ecrit ici,
> plus jamais sur Supabase Postgres sauf pour les tables legacy deja presentes.
>
> **Pourquoi P1.0 et pas dans un chantier separe** : P1.4 (OAuth + 2FA Hub) et P1.5
> (membres workspace Hub) + P1.2 (Analytics) ont toutes besoin de Prisma **et** il serait
> absurde de les brancher sur Supabase maintenant pour les migrer dans 6 mois. On paie
> une fois maintenant, pas deux fois plus tard.

- [ ] **Nouveau service `veridian-core-db`** dans `infra/docker-compose.yml` (+ staging +
  prod override) : Postgres 16 officiel, volume dedie `veridian-core-db-data`, reseau
  `global-saas-network`, port NON-exposed (acces interne Docker uniquement)
- [ ] **Mot de passe** dans `~/credentials/.all-creds.env` : `VERIDIAN_CORE_DB_PASSWORD`
  (generer un nouveau secret, NE PAS reutiliser POSTGRES_PASSWORD Supabase)
- [ ] **Schemas par app** : a la premiere migration Prisma de chaque app :
  - `hub_app` — tables Hub (WorkspaceMember, Invitation, mfa_codes, etc.)
  - `analytics` — tables Analytics (Tenant, Site, Pageview, FormSubmission, SipCall, etc.)
  - Notifuse fork viendra plus tard, a trancher en P1.3 (probablement sa propre DB comme
    aujourd'hui pour preserver la logique "boite noire")
- [ ] **Backup auto** : job Dokploy Schedule (hebdo au debut) qui `pg_dump` sur volume
  dedie. Ne PAS bricoler un cron ad hoc — passer par Dokploy comme convenu
- [ ] **Health check** dans le compose pour eviter que les apps demarrent avant la DB
- [ ] **Documenter** dans `infra/CLAUDE.md` + dans `docs/saas-standards.md` (ecrit en P1.1) :
  "toute nouvelle app/feature ecrit sur `veridian-core-db`, plus jamais sur Supabase PG
  sauf tables legacy". Regle opposable lors des reviews.
- [ ] **Prerequis** pour : P1.2 (Analytics), P1.4 (Hub OAuth/2FA), P1.5 (Hub membres)

### P1.1 — Standards cross-SaaS (base avant tout le reste)
> **Priorite absolue** : avant de forker Notifuse ou de creer Analytics, on definit les
> standards que TOUTES nos apps doivent respecter pour etre "SaaS-ready". Twenty est deja
> parfait sur ces points → on se cale sur ses patterns. Notifuse est un OSS "pas vraiment
> SaaS-ready" → on l'enrichit pour qu'il respecte le standard.
>
> **Pourquoi d'abord ?** Sans ces standards, chaque agent va reinventer le wheel et on se
> retrouvera avec 3 implementations differentes du soft-delete, 3 du paywall, 3 des roles.
> C'est exactement ce qu'on veut eviter.
- [ ] **Doc `docs/saas-standards.md`** : charte des patterns obligatoires pour toute app Veridian
  - **Soft deletion** : colonne `deleted_at` sur les tables tenant-scoped, cron purge 30j
  - **Stripe paywall** : middleware qui verifie `plan_status` + `trial_ends_at` sur les routes payantes
  - **Limites par plan** : config centralisee `PLAN_LIMITS = { free: {...}, pro: {...} }` + enforcement
  - **Roles workspace** : `owner`, `admin`, `member`, `viewer` (calque sur Twenty)
  - **Invitations** : flow email + token + acceptation, expire 7j
  - **Audit log** : table `audit_log` (who, what, when, target) sur les actions sensibles
  - **Provisioning API** : `POST /api/tenants/provision` + `update-plan` + `suspend` + `delete` (contrat standard)
  - **Webhooks Stripe** : chaque app a son propre `/api/webhooks/stripe`, source de verite = Stripe
  - **Health check** : `/api/health` retourne `{ status, version, db, dependencies }`
- [ ] **Implementation reference dans Prospection** : Prospection devient l'app de reference.
  Tout ce qui manque par rapport au standard → ajoute dans Prospection d'abord, puis replique.
- [ ] **Checklist d'audit** : chaque app qu'on ajoute ou met a jour doit cocher tous les items
  du standard. Le lead agent verifie avant d'accepter un merge.

### P1.2 — Analytics (beta POC) : nouveau micro-service multitenant
> **Objectif** : dashboard de metrics pour les sites vitrine clients (Tramtech d'abord).
> Ingestion formulaires + tracking appels SIP (upload manuel au debut). Multitenant des
> le jour 1, basique mais propre. Proposer a terme aux clients actuels comme valeur ajoutee
> a cote des SaaS.
>
> **Philosophie** : meme stack que Prospection (Next.js 15 + Prisma + Postgres dediee).
> Boite noire API-only, zero interdependance avec les autres apps, pilotable par webhook
> depuis le Hub. Pas de Supabase (on ne reproduit pas l'erreur).
>
> **Dissociation UI dans le Hub** : creer deux sections sur la home du Hub :
> - **"Vos SaaS"** : Prospection, Twenty, Notifuse
> - **"Services de suivi"** : Analytics (beta), futurs services (uptime, etc.)
> Badge "BETA" sur la card Analytics tant que c'est POC.

**Fondations multitenant**
- [ ] **Dossier `analytics/`** dans le monorepo, stack Next.js 15 + Prisma + Postgres dediee
- [ ] **Auth locale simple** : Auth.js credentials (email/password), comme Prospection au debut.
  Pas de dependance Hub pour l'auth — l'app tourne meme si le Hub est down.
- [ ] **Model Prisma multitenant** :
  - `Tenant` (id, name, site_key, plan, status, created_at)
  - `User` (id, email, password_hash, tenant_id, role)
  - `Site` (id, tenant_id, domain, name) — un tenant peut avoir plusieurs sites
  - `Pageview` (id, site_id, url, referrer, utm_source, utm_medium, utm_campaign, session_id, created_at)
  - `FormSubmission` (id, site_id, form_name, payload_json, session_id, created_at)
  - `SipCall` (id, tenant_id, line_number, caller_number, called_at, duration, source_tag, raw_log_json)
  - `SipLineMapping` (id, line_number, tenant_id, label, notes) — table manuelle editable
- [ ] **Endpoint ingestion formulaires** : `POST /api/collect/form`
  - Auth : header `X-Site-Key: <site_key>` (public, embarquable dans le frontend)
  - Body : `{ form_name, payload, session_id, utm_* }`
  - Valide le site_key, resout le tenant, insert la submission
  - Rate limit 60 req/min par site_key
- [ ] **Endpoint pageviews** : `POST /api/collect/pageview` (meme auth site_key)
- [ ] **Page `/admin/sip-upload`** : upload CSV/JSON des logs OVH
  - Parse le format OVH voiceConsumption
  - Match `line_number` contre `SipLineMapping` → assigne chaque appel au bon tenant
  - Appels sans mapping → table `sip_unmapped` pour triage manuel
- [ ] **Page `/admin/sip-mapping`** : CRUD table `SipLineMapping` (UI simple)
- [ ] **Dashboard client** : page `/dashboard` affichee au user tenant
  - Stats 30j : pageviews, formulaires, appels recus, taux conversion
  - Graphique temporel simple
  - Filtres par site, par UTM source
  - Liste des dernieres submissions + appels
- [ ] **URL prod** : `analytics.app.veridian.site` (cohert avec twenty/notifuse)
- [ ] **Deploy direct en prod** avec badge "BETA" sur la card Hub (pas de staging dedie au debut)

**Documentation integration (dans le repo, versionnee)**
- [ ] **`analytics/docs/integration.md`** : guide complet d'integration cote sites vitrine
  - Snippet HTML `<script>` tracker pageviews (vanilla, marche partout)
  - Snippet JS pour binding formulaires HTML natifs (intercepter submit, POST vers analytics)
  - Exemple integration Next.js (fetch cote serveur, server action)
  - Exemple integration WordPress (shortcode)
  - Comment recuperer son site_key depuis le dashboard
  - Dev tools : verifier que les events arrivent (onglet network, logs console)
- [ ] **Page "Comment integrer"** dans le dashboard Analytics qui reprend la doc + copie-coller rapide
- [ ] **Lien depuis le Hub** : card Analytics → "Documentation integration"

**Call tracking POC (simple)**
- [ ] **Phase 1 — upload manuel** : Robert upload les CDR OVH en CSV depuis l'admin Analytics
  - Pas de sync automatique au debut, c'est OK pour un POC
- [ ] **Phase 2 (plus tard, P2/P3)** : cron qui pull l'API OVH toutes les 15min et insert les CDR
- [ ] **Phase 3 (futur)** : swap Telnyx + pool de numeros + attribution par page (pas pour le POC)

### P1.3 — Notifuse fork boite noire (API-only, standard SaaS)
> Fork leger de Notifuse pour le rendre "SaaS-ready" selon le standard defini en P1.1.
> Meme philosophie que Prospection : boite noire autonome, pilotable exclusivement par API
> depuis le Hub. Le Hub parle HTTP, point.
>
> **Pourquoi forker plutot que utiliser l'image upstream telle quelle** :
> - Notifuse n'est pas vraiment SaaS-ready : pas de soft delete tenant, pas de paywall Stripe,
>   pas de limites par plan propres. On doit enrichir.
> - Ajouter les endpoints de provisioning tenant (contrat standard P1.1)
> - Garder la possibilite de merger l'upstream facilement (branche `veridian` dediee, minimal diff)

**Setup fork**
- [ ] **Fork `Christ-Roy/notifuse-veridian`** avec branche `veridian` pour nos modifs
- [ ] **Dossier `notifuse/` dans le monorepo** : Dockerfile custom, compose entry, CI dediee
- [ ] **Image custom** `ghcr.io/christ-roy/notifuse-veridian:latest` buildee par self-hosted runner
- [ ] **Script `ci/check-oss-versions.sh`** etendu : alerte quand upstream Notifuse bump
- [ ] **Doc merge upstream** dans `notifuse/MERGING-UPSTREAM.md` : procedure pour rebase `veridian`
  sur `main` upstream sans casser — **point critique** pour pouvoir suivre les updates facilement

**Reutiliser les tests + CI Notifuse upstream**
- [ ] **Ne pas remplacer** les tests e2e natifs Notifuse (Go) — les garder et s'en servir
- [ ] **Etendre** avec nos specs Veridian par-dessus (provisioning API, paywall, limites plan)
- [ ] **CI native Notifuse** : reutiliser le workflow GitHub Actions upstream, ajouter nos jobs
- [ ] A chaque merge upstream, les tests upstream valident qu'on n'a rien casse

**Appliquer le standard P1.1**
- [ ] **Endpoints provisioning** (contrat standard) :
  - `POST /api/tenants/provision` — cree un workspace Notifuse pour un tenant Hub
  - `POST /api/tenants/update-plan` — applique le plan Stripe (quota emails, limites)
  - `POST /api/tenants/suspend` — suspend l'envoi (paywall)
  - `DELETE /api/tenants/:id` — soft delete, purge cron 30j
  - `GET /api/tenants/:id/status` — usage mois en cours, quota restant
- [ ] **Soft deletion** sur les tenants + workspaces + templates
- [ ] **Stripe paywall** : middleware qui bloque l'envoi si plan suspendu / trial expire
- [ ] **Limites par plan** (reutiliser les products Stripe existants) :
  - Freemium : 500 emails/mois
  - Pro 29EUR : 10k emails/mois
  - Business 49EUR : 50k emails/mois
- [ ] **Integration Stripe directe** dans Notifuse (webhook local, source de verite = Stripe)
- [ ] **Audit log** sur les actions sensibles (suspend, delete, change plan)
- [ ] **Health check** `/api/health` conforme au standard

### P1.4 — OAuth Google minimal + 2FA email opt-in (Hub)
> Objectif : accelerer le signup Hub avec OAuth Google minimal (login-only) + offrir un toggle
> 2FA email pour les users qui veulent securiser leur compte.
>
> **Philosophie** : cookies de session **3 mois** pour eviter que les tenants perdent leur
> compte facilement. Quand une nouvelle session sans cookie essaye de se login sur un compte
> avec 2FA active, on envoie un mail de confirmation avant d'autoriser.
>
> **Pas de MFA obligatoire a chaque refresh** (decision : ca gonflerait l'UX avec cookies 3 mois).
> Le 2FA email est un opt-in par user, bouton dans les settings.
- [ ] **Cookies session 3 mois** : Auth.js `maxAge: 60 * 60 * 24 * 90` sur le JWT cookie
- [ ] **Agent MCP Chrome — recup credentials OAuth Google** :
  - Google Cloud Console : creer OAuth 2.0 Client ID (scope minimal : `openid email profile`)
  - Configurer screen consent (nom, logo, domaine)
  - Callback URLs : `https://app.veridian.site/api/auth/callback/google`
  - Sauver dans `~/credentials/.all-creds.env` (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)
- [ ] **Auth.js Google provider** : ajout dans le Hub, scope minimal, pas de Gmail/Drive pour l'instant
  - Login Google = si email existe deja → link account, sinon → create user
- [ ] **2FA email opt-in** :
  - Toggle dans `/settings/security` pour activer le 2FA email
  - Table `mfa_enabled` sur `User` (bool)
  - Quand une nouvelle session (sans cookie valide) essaye de se login → envoi code 6 chiffres
    par mail (Brevo ou Notifuse), verification obligatoire avant emission du cookie session
  - Table `mfa_codes` Prisma (user_id, code_hash, expires_at 10min)
  - Template mail "Code de connexion Veridian" (6 chiffres, expire 10min)
  - UI : page `/auth/mfa` avec input code + bouton resend
- [ ] **Tests e2e** : login Google (mock provider), flow 2FA email, cookies long terme

### P1.5 — Hub : page membres workspace + invitations
> **Contexte** : tu veux une premiere version simple de la gestion workspace dans le Hub.
> Pas d'impersonate, pas de dashboard cross-apps pour l'instant. Juste la base : liste membres,
> invitations, roles owner/admin/member. On enrichira plus tard.
>
> **Note long terme** : a terme on voudra mutualiser les tenants et membres entre toutes les
> apps (prospection, twenty, notifuse, analytics) avec une logique intelligente — mais c'est
> bloque par le SSO avance qui est un chantier douloureux a voir plus tard avec Robert.
- [ ] **Page `/workspace/members`** dans le Hub
  - Liste des membres du workspace (email, role, date d'invitation, derniere connexion)
  - Bouton "Inviter un membre" → modal email + choix role
  - Actions par ligne : changer role, supprimer membre
- [ ] **Modele Prisma Hub** :
  - `WorkspaceMember` (id, workspace_id, user_id, role: 'owner' | 'admin' | 'member', invited_at, joined_at)
  - `Invitation` (id, workspace_id, email, role, token, expires_at, accepted_at)
- [ ] **Flow invitation** :
  - Envoi mail (Brevo) avec lien `/invite/[token]`
  - Si user existe → ajout direct au workspace
  - Si user n'existe pas → creation compte + ajout workspace
  - Token expire 7j
- [ ] **UI adaptee selon role** :
  - `owner` : tout peut (incluant delete workspace, transferer ownership)
  - `admin` : peut inviter, changer roles (sauf owner), mais pas delete workspace
  - `member` : read-only sur la liste membres, ne peut pas inviter
- [ ] **Tests e2e** : invitation flow, changement role, permissions par role

### P1.6 — Tenants Prospection : nettoyage workspaces + isolation membres
> Suite du chantier invitations V1. Aujourd'hui un workspace Prospection peut avoir plusieurs
> membres mais l'isolation logique est incomplete : tous voient tout, pas de roles fins internes,
> pas de purge quand le tenant est supprime cote Hub.
>
> Le freemium 300 leads distribue selon `score_dept` est DEJA en place (lead-quota.ts).
> Cette tache c'est la PARTIE GESTION, pas la partie quota.
- [ ] **Nettoyage workspaces** (suit le standard P1.1) : quand un tenant est suspendu/supprime cote Hub
  - Soft-delete Prospection : `deleted_at` sur tenants + workspace_members
  - Cron purge definitive apres 30j (leads, outreach, pipeline, notes)
  - Endpoint `DELETE /api/tenants/:id` appele par le Hub via HMAC
- [ ] **Isolation membres workspace** (roles calques sur Twenty) :
  - `owner`, `admin`, `member`, `viewer` au sein d'un workspace
  - `member` peut CRUD les leads qu'il a assignes, voir les autres en read-only
  - `viewer` read-only sur tout le workspace
  - `admin` = owner sauf delete workspace
  - `owner` = full access
- [ ] **UI gestion membres** : page `/admin/members` dans Prospection (liste, invite, change role, remove)
- [ ] **Middleware filtrage** : chaque query prospects/outreach/pipeline filtree par `workspace_id` + role
- [ ] **Tests e2e** : scenarios multi-users (member ne voit pas les leads d'un autre, viewer read-only)

### P1.7 — Prisma Migrate + API sync data (main agent only)
> **Cette tache ne doit JAMAIS etre deleguee a un agent ephemere.**
> Le main agent gere ca a la main, etape par etape, avec validation Robert entre chaque etape.
> Une migration DB foireuse = donnees perdues, tenants casses, prod down. Zero tolerance.
>
> **Pourquoi c'est critique :**
> - Les 996K entreprises + toutes les outreach/pipeline sont dans cette DB
> - Les tenants existants ne doivent JAMAIS perdre leurs donnees
> - Le scraping (dev server) pousse regulierement des donnees enrichies → il faut un flow fiable
> - Aujourd'hui c'est du SQL a la main via SSH → aucune tracabilite, aucun rollback

**Etape 1 — Prisma Migrate** (remplace `db push` par des migrations versionnees)
- [ ] `npx prisma migrate dev --name init` pour creer la baseline depuis le schema actuel
- [ ] Tester en local que la migration s'applique proprement sur une DB vide
- [ ] Ajouter `npx prisma migrate deploy` dans le Dockerfile Prospection (au start, avant l'app)
- [ ] Tester en staging : le container applique les migrations au demarrage
- [ ] Appliquer en prod (accord Robert, backup avant)
- [ ] Supprimer les scripts SQL manuels dans `prospection/scripts/` (archiver dans git history)

**Etape 2 — API interne sync-data** (remplace les dumps SQL manuels)
- [ ] `POST /api/internal/sync-data` — endpoint protege par HMAC, upsert batch d'entreprises
  - Validation des donnees entrantes (SIREN format, colonnes autorisees)
  - Mode upsert (insert ou update, jamais delete)
  - Log des changements (combien inseres, combien mis a jour)
  - Rate limit : 10 req/min, batch max 1000 lignes
- [ ] Script `sync.ts` dans le scraping qui appelle cette API
  - Remplace : SSH → psql → COPY FROM → esperer que ca marche
  - Par : HTTP POST → validation → upsert → log → confirmation
- [ ] Tester le flow complet : scraping enrichit → API sync → Prospection DB mise a jour

**Etape 3 — Integrer le scraping au monorepo** (optionnel, peut glisser en P2)
- [ ] Deplacer `scraping-dor-fr-script` dans `veridian-platform/scraping/`
- [ ] Le pipeline de scraping pousse via l'API sync au lieu de dumps
- [ ] Cron GitHub Actions (ou Clawdbot) pour les syncs regulieres

### P1.8 — Infra agents autonomes : `.claude/agents/` + workflow CI-loop
> Objectif : permettre a des agents de boucler en autonomie sur une feature, avec la CI comme
> seul oracle de verite. Peu d'aide humaine : l'agent lit la TODO, choisit une tache, code, push,
> attend la CI, lit les logs d'echec, fixe, re-push — jusqu'a CI verte.
>
> **Pourquoi c'est possible maintenant** : la CI est 100% anti-regression et envoie en prod
> automatiquement. Ca permet d'envoyer des agents avec des modeles moins couteux (Sonnet) sur
> des taches simples sans prendre de risque — la CI rattrape les erreurs.
>
> **Attention cout** : pas de Haiku/Sonnet sur des taches complexes, ca cree des allers-retours
> qui crament plus de contexte que ce qu'on economise. Lead = Opus 1M, teammates adaptes.
- [ ] **Dossier `.claude/agents/`** dans le projet avec agents specialises :
  - `prospection-dev.md` — agent specialiste Prospection (Prisma, Next.js 15, tests e2e) — Sonnet/Opus selon tache
  - `hub-dev.md` — agent specialiste Hub (Auth.js, Stripe, provisioning) — Opus
  - `notifuse-dev.md` — agent specialiste Notifuse fork (Go, API-only) — Opus
  - `analytics-dev.md` — agent specialiste Analytics (stack Prospection clone) — Sonnet
  - `ci-fixer.md` — agent debug CI (lit gh run view, identifie root cause, fixe) — Opus
  - `migration-agent.md` — agent Prisma Migrate (schema, dry-run, rollback) — Opus, supervise
  - `test-writer.md` — agent ecriture tests e2e + unit — Sonnet
  - `ui-polish.md` — agent UI/copy/styling — Sonnet
- [ ] **Prompt system de chaque agent** : comment lire les rules, comment lire la TODO, comment
  explorer le code avec Glob/Grep, comment push proprement (batch commits, pas de force push)
- [ ] **Workflow CI-loop** :
  - Agent push → attend `gh run watch` → si fail, `gh run view --log-failed` → parse → fix → re-push
  - Boucle max 5 iterations avant d'escalader au lead
  - Patterns de fix courants documentes : TS error, test fail, lint, docker build cache miss
  - Cap tokens par tache (ex: 200k) pour eviter les ruineuses
- [ ] **Verifier doc Claude Code** : est-ce que `TaskCreate` + `SendMessage` supportent deja ce
  pattern d'iteration auto ? Ou faut-il un skill custom `ci-loop` ? Explorer aussi le hook
  `PostToolUse` pour trigger auto apres un push.
- [ ] **Test reel** : lancer 3 agents en parallele sur 3 taches P2, les laisser boucler 1h,
  mesurer le taux de succes (feature livree, CI verte, zero intervention humaine)
- [ ] **Doc `docs/agents-autonomous.md`** : comment lancer un sprint autonome, limites connues,
  quand escalader, patterns de prompts, choix du modele selon complexite

### P1.9 — Polish UI invitations
- [ ] Loader bouton "Accepter l'invitation" (anti double-clic)
- [ ] Dialog "copier lien" inline dans la table
- [ ] Logo Veridian sur /invite/[token]
- [ ] Dashboard /admin : ligne "Invitations recentes"

### P1.10 — Bugs post-sprint
- [ ] twenty.ts getQualifications : verifier SIREN→web_domain en staging
- [ ] /segments/rge/sans_site : root cause serveur (body vide)
- [ ] DB locale postgres:5433 pas migree → documenter `npm run db:fresh:siren`

---

## P2 — Court terme

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

### P2.6 — Analytics : call tracking auto
- [ ] Cron qui pull l'API OVH voiceConsumption toutes les 15min
- [ ] Insert automatique dans `SipCall` + matching `SipLineMapping`
- [ ] Alerte Telegram si appel non mappe

### P2.7 — Analytics : polish dashboard
- [ ] Export CSV des submissions + appels
- [ ] Filtres avances (date range, UTM, source)
- [ ] Comparaison periodes (30j vs 30j precedents)

### P2.8 — CI : separation core/extended (partiel, ce qui est independant de Supabase)
- [ ] **Separer tests core vs extended** :
  - core/ (5 specs, ~2min, BLOQUANT) : auth-login, prospects-crud, pipeline-flow, health, tenant-isolation
  - extended/ (15 specs, NON-BLOQUANT) : admin, search, export, mobile, etc.
- [ ] **Core sur cloud** (ubuntu-latest, reseau stable — le self-hosted a des flaky reseau)
- [ ] **Extended sur cloud** en parallele, sharde sur 3 browsers (chromium/firefox/webkit)
- [ ] **Docker build reste self-hosted** (cache local, 20s vs 3min sur cloud)
- [ ] **Tests lourds en batch** : toutes les 3h ou tous les 5 commits, clone DB prod + migrations + e2e complet
- [ ] **Health check prod post-deploy** : 1 spec login-only, pas de signup (pas de rate limit)
- [ ] hub-ci.yml : memes principes (test cloud + docker self-hosted)
- [ ] Lier package GHCR `veridian-dashboard` au repo monorepo (Robert: settings package)
- [ ] **Node.js 20 deprecation** : actions GitHub seront forcees en Node 24 le 2 juin 2026

---

## P3 — Long terme

### P3.1 — UX polish
- [ ] Dark mode (infra livree, polish pages)
- [ ] Command palette (livree, a enrichir)
- [ ] Mobile responsive (basique fait)
- [ ] Keyboard shortcuts

### P3.2 — Refactor & quality
- [ ] Hooks custom dans src/hooks/
- [ ] Tests unitaires lib/queries (mock Prisma)
- [ ] OpenAPI/Swagger genere depuis les routes API
- [ ] Migration depuis `any` vers types stricts

### P3.3 — Securite V2
- [ ] Rotate TENANT_API_SECRET staging ET prod + HMAC par tenant
- [ ] Migrer ADMIN_EMAILS hardcode vers table platform_admins
- [ ] TOTP obligatoire pour les admins (extension du 2FA email de P1.4)
- [ ] CSP strict
- [ ] Etendre 2FA email a Prospection, Notifuse, Analytics

### P3.4 — Infra & scaling
- [x] Separer DBs : Prospection a deja sa Postgres dediee (staging + prod)
- [ ] CDN Cloudflare devant Dokploy pour assets statiques
- [ ] Backup automatique Postgres staging + prod
- [ ] CI : job test-prod-migration (pg_dump prod → stack-test → migrations → smoke)

### P3.5 — Analytics phase 2 : call tracking avance
- [ ] Swap Telnyx + pool de numeros
- [ ] Attribution par page (swap dynamique frontend, matching backend)
- [ ] Tracker JS universel pour sites non-Next.js
- [ ] Integration Google Ads API (ROAS, CPC, conversion rate)

### P3.6 — Hub admin unifie : vue cross-apps
> Etendre P1.5 quand les autres apps seront matures. Pas prioritaire tant que le SSO avance
> n'est pas en place (voir chantiers douloureux).
- [ ] Vue unifiee d'un tenant avec blocs Prospection / Twenty / Notifuse / Analytics
- [ ] Actions centralisees : suspendre, reset quota, force sync Twenty, resend invitation
- [ ] Impersonate workspace (login as avec audit log) — utile pour le support
- [ ] Dashboard admin global : liste tenants, filtres, recherche
- [ ] Audit log `platform_audit_log` Prisma

### P3.7 — Multi-tenant entreprise (Phase 2 roadmap)
- [ ] Table `organizations` Prisma
- [ ] Mapping : 1 org = 1 workspace Twenty = 1 tenant Prospection = 1 workspace Notifuse
- [ ] Billing par org, pas par user
- [ ] Donnees partagees au sein de l'org

---

## ⚠️ Chantiers douloureux — NE PAS commencer sans accord Robert
<a id="chantiers-douloureux"></a>

> **IMPORTANT — lire avant de toucher a quoi que ce soit dans cette section :**
>
> Ces chantiers sont structurants, risques, et douloureux. Ils prennent beaucoup de temps
> et ne produisent pas de valeur visible a court terme. **Aucun agent ne doit commencer
> l'un d'entre eux parce qu'il est "arrive la dans la TODO"**. Ils sont ici pour memoire,
> pour qu'on sache qu'ils existent — mais leur declenchement doit etre une decision explicite
> de Robert avec discussion prealable sur le timing et la strategie.
>
> **Regle** : si un agent lit cette TODO et arrive ici, il STOP, ne touche a rien, et continue
> avec les taches P0/P1/P2/P3 regulieres. Ces chantiers ne s'executent que sur instruction
> directe de Robert avec le contexte "on attaque X maintenant".

### [DOULOUREUX] Decommission totale de Supabase
> **Dette technique acceptee a court terme**. On supprimera Supabase plus tard.
>
> **Decision 2026-04-10** : la decommission prend trop de place dans le sprint et bloque le
> peuplement rapide du Hub. On accepte de garder Supabase en l'etat tant que le Hub n'est pas
> mature. A revoir quand :
> - Le Hub est propre et pro avec les membres, analytics, notifuse forke
> - Le standard SaaS (P1.1) est stable sur les apps
> - On a une semaine calme a consacrer au refactor sans pression feature
>
> **Metrique de surveillance** : si le count `grep -r "supabase" prospection/ hub/` grossit
> au lieu de decroitre sur 2 sprints consecutifs → repasser en P1 d'urgence. Sinon laisser.

**Ce qui est prevu (pour memoire, quand on l'attaquera)** :

*Etape A — Prospection autonome (boite noire)*
- [ ] Auth propre : migrer de Supabase Auth vers Auth.js (table users Prisma)
- [ ] Table tenants locale Prisma : migrer `prospection_plan`, `prospection_config`, limites
- [ ] Supprimer toute dependance Supabase dans `prospection/` (lib/supabase, getTenantId, etc.)
- [ ] API contract Prospection : provision, update-plan, status, delete (conforme standard P1.1)
- [ ] Integration Stripe directe : webhook local, source de verite = Stripe
- [ ] Tests e2e Prospection sans Supabase

*Etape B — Hub autonome*
- [ ] Auth.js dans le Hub : credentials provider + Google (deja prevu en P1.4)
- [ ] Mails transactionnels via Brevo ou Notifuse self-host
- [ ] Table tenants dans Prisma Hub : migrer `public.tenants` de Supabase
- [ ] RLS remplace par middleware Next.js

*Etape C — Migration donnees (CRITIQUE, main agent only)*
- [ ] Dump Supabase prod : auth.users + public.tenants + workspace_members + invitations
- [ ] Script de mapping Supabase UUID → Prisma CUID (table de correspondance conservee)
- [ ] Hash passwords : Supabase bcrypt → compatible Auth.js direct, pas de reset force
- [ ] Dry-run staging : importer le dump, verifier que Robert peut se login
- [ ] Cutover prod : maintenance window, dump final, import, switch DNS, verif login
- [ ] Rollback plan : garder Supabase up 48h post-cutover

*Etape D — Supprimer Supabase de l'infra*
- [ ] Virer Kong, GoTrue, PostgREST, Realtime, Storage, Meta, Studio, Imgproxy, Functions
- [ ] Prod : recupere ~3GB RAM sur le VPS
- [ ] Staging : recupere ~2GB RAM sur le dev server
- [ ] docker-compose.yml : de 30+ services a ~10

*Etape E — CI cible post-Supabase*
- [ ] Refactor `prospection-ci.yml` + `hub-ci.yml` pour e2e dans service container cloud
- [ ] Pipeline cible : ~5min du push au prod live (vs ~13min actuellement)

### [DOULOUREUX] SSO avance Veridian (magic links, partage credentials)
> **A discuter plus tard avec Robert**. L'idee est d'avoir un vrai SSO Veridian ou le Hub
> est le depositaire unique des identites, et toutes les apps consultent le Hub pour l'auth.
>
> **Pourquoi douloureux** : ca touche a l'archi auth de TOUTES les apps, c'est le pire moment
> pour se planter, et ca necessite que le Hub soit deja stable et mature. Au debut on fait
> simple : chaque app a son login local (meme pattern que Prospection et Analytics), pas de
> dependance au Hub pour pouvoir fonctionner.
>
> **Idees a explorer le jour ou on l'attaque** :
> - Magic links : le Hub genere un JWT 5min, l'user clique, l'app valide aupres du Hub
> - Fallback credentials : si l'user arrive direct sur `app.veridian.site/login`, tentative DB
>   locale puis fallback vers le Hub via `POST /api/auth/verify-credentials`
> - Propagation invitations : quand on invite `alice@x.fr` dans Prospection, POST `/api/users/ensure`
>   vers le Hub qui cree le user s'il n'existe pas → meme password partout
> - Secret partage `HUB_AUTH_SECRET` pour signer les JWT entre Hub et apps
> - Mutualisation tenant/membres workspace entre toutes les apps (lien P3.6 et P3.7)
>
> **A discuter avec Robert** : scope exact, timing, ordre d'attaque (debut par Analytics qui
> est neuf ? Retrofit Prospection qui a deja son auth ?).

### [DOULOUREUX] Refactor trunk-based complet (supprimer staging)
> **A discuter**. Aujourd'hui on a main + staging. Le flow "push staging → promote main" marche
> bien mais ajoute une etape. Le vrai trunk-based c'est "push main → tests → prod direct".
>
> **Pourquoi douloureux** : il faut que la CI soit 100% bulletproof avant de supprimer staging,
> sinon chaque bug va directement en prod. Meme avec rollback auto, c'est risque tant qu'on
> n'a pas une couverture e2e 100% fiable. A attaquer quand on sera confiants dans la CI.

---

## Recently shipped

> Archive des taches terminees recemment. Decocher d'ici quand on en ajoute dans les sections actives.

- **2026-04-07** — Kong rate-limit par IP client
  - Diagnostic : limit_by absent → default = consumer (tous les users dans le meme bucket)
  - Fix v2 : `limit_by: ip` (Kong utilise ngx_realip pour resoudre l'IP client)
  - Limites : 100/min open routes, 200/min auth routes (prod)
  - Staging 2x prod (200/400) pour absorber les e2e sans masquer les vrais bugs de flood
  - Tests violents : flood 101 req → 429, IPs externes isolees, Docker interne n'impacte pas l'externe
- **2026-04-07** — Promote staging→main ne declenchait pas le pipeline prod
  - `GITHUB_TOKEN` ne trigger pas de workflow (protection anti-boucle GitHub)
  - Fix : `PROMOTE_PAT` (fine-grained PAT) dans le job promote
- **2026-04-07** — Pipeline-board JS crash + CI warm-up
  - `Object.values(pipeline).reduce((a, b) => a + b.length)` crash si entry undefined
  - Fix : `b?.length || 0` + warm-up staging avant Playwright + login timeout 30s
- **2026-04-07** — Hub deploy-staging fix (runner self-hosted)
  - Le dev server n'avait pas d'auth GHCR → pull echouait
  - Fix : runner passe de `ubuntu-latest` a `self-hosted` (comme prospection)
- **2026-04-06** — Self-hosted runner installe + CI refactor monorepo (docker 25s, deploy 11s)
- **2026-04-06** — Integration test fix FK constraint cleanup

---

## Historique sessions

- **2026-04-10 (amorcage sprint lead Opus 1M)** : Sync TODO apps vs code reel via audit Explore.
  Detecte : P0.2 (cache 5min) et P0.5 (next 15.5.14 + build vert) etaient DONE mais restaient
  coches partiellement. Hub avait `tenants.deleted_at` + `/api/health` + Stripe webhooks + plans
  v2/v3 + `/api/admin/impersonate` deja en place sans etre archives. Hub ne contient AUCUN
  fichier Prisma (alerte : P1.4 + P1.5 impliquent initialiser Prisma dans le Hub comme
  prerequis, a trancher avec Robert : Postgres dedie Hub ou Prisma sur Supabase Postgres).
  Prospection : paywall UI + useTrial hook deja wires mais gating `checkTrialExpired` toujours
  bypass hard (P0.1 pas touche). Prepare scaffold `notifuse/` + fork upstream + CI placeholder
  pour sprint P1.3. Teammates du sprint : prospection-p0-fixer (Opus), hub-auth-builder (Opus),
  hub-members-builder (Sonnet), saas-standards-writer (Opus). Notifuse + Analytics attendent P1.1.
- **2026-04-10 (reorg 2)** : Accepte la dette Supabase a court terme → decommission sort de P1
  et va en section "Chantiers douloureux" avec warning explicite. Ajout P1.1 Standards cross-SaaS
  (base avant Notifuse/Analytics). Ajout P1.2 Analytics beta POC (multitenant, ingestion forms +
  call tracking manuel). P1.4 simplifie (OAuth Google minimal + 2FA email opt-in, cookies 3 mois).
  P1.5 clarifie (juste page membres Hub, pas impersonate). SSO avance repousse en chantier douloureux.
  P1.8 agents autonomes enrichi (choix modele selon complexite, cap tokens).
- **2026-04-10 (reorg 1)** : Reorganisation TODO (P0 renumerote, P1 dans l'ordre logique, DONE archives).
- **2026-04-07** : Kong rate-limit par IP (fix v2 `limit_by: ip`), tests violents staging+prod,
  audit archi Supabase → decision de decommission totale (puis reportee apres)
- **2026-04-06 soir** : Migration monorepo, self-hosted runner, CI refactor
- **2026-04-06 sprint** : 50+ commits, INPI v3.6, admin pages, Stripe, 30 e2e specs
- **2026-04-05** : SIREN refactor + invitations V1 (47 commits, 7 teammates)
- **2026-04-03-04** : Env var fixes, API admin, CI auto-deploy + rollback, 52 e2e tests
