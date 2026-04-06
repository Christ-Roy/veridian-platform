# TODO-LIVE — Veridian Platform

> Source de verite unique pour le backlog. Mis a jour a chaque session.
> Derniere update : 2026-04-06 — post migration monorepo.
>
> **Repo** : github.com/Christ-Roy/veridian-platform (public)
> **CI** : self-hosted runner sur dev server + cloud GitHub
> **Blocker actuel** : aucun (billing GitHub fixe via passage public)

---

## P0 — Bloquant / Urgent

### P0.0 — CRITIQUE : Kong rate-limit par app au lieu de par IP client
- [x] Diagnostic : limit_by absent → default = consumer (tous les users dans le meme bucket)
- [x] Fix : `limit_by: header` + `header_name: X-Real-IP` sur les 4 blocs rate-limiting
- [x] Limites augmentees : 100/min open routes, 200/min auth routes
- [x] Commit pret (infra/volumes/supabase/api/kong.yml)
- [ ] **Appliquer en staging** : restart Kong container sur dev server
- [ ] **Tester** : 2 IPs differentes → quotas independants
- [ ] **Appliquer en prod** : accord Robert necessaire, restart Kong prod

### P0.1 — CVE next@15.3.3 (prospection)
- [x] `npm install next@15.5.14` — fait le 7 avril
- [ ] Verifier que le build CI passe avec la nouvelle version

### P0.6 — Stratégie OSS : Notifuse fork + Twenty hands-off
- [x] Script `ci/check-oss-versions.sh` pour détecter les mises à jour
- [ ] **Notifuse** : fork léger `Christ-Roy/notifuse`, branche `veridian` pour nos modifs.
  Image custom `ghcr.io/christ-roy/notifuse-veridian`. Merge upstream pour les updates.
- [ ] **Twenty** : NE PAS forker. Utiliser via API GraphQL comme boîte noire.
  Updates = simple bump d'image dans docker-compose. Custom features dans le Hub.

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

## P1 — Prochaine session

### P1.1 — CI → trunk-based + tests core
- [x] Self-hosted runner installe sur dev server
- [x] docker/deploy/e2e sur self-hosted (docker build 25s, deploy 11s)
- [x] Integration test fix (FK constraint cleanup)
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

### P3.1 — Architecture SaaS : auth independant par app
- [ ] Prospection : migrer vers auth propre (pas Supabase) pour independence
- [ ] Chaque app a son integration Stripe (source de verite billing)
- [ ] Hub leger : signup + billing + provisioning, pas de logique metier

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
- [ ] Separer DBs : Prospection Postgres dedie + Supabase auth separe
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

- **2026-04-06 soir** : Migration monorepo, self-hosted runner, CI refactor
- **2026-04-06 sprint** : 50+ commits, INPI v3.6, admin pages, Stripe, 30 e2e specs
- **2026-04-05** : SIREN refactor + invitations V1 (47 commits, 7 teammates)
- **2026-04-03-04** : Env var fixes, API admin, CI auto-deploy + rollback, 52 e2e tests
