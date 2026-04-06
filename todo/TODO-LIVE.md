# TODO-LIVE — Veridian Prospection

> **Fichier vivant** lu en premier quand je suis en mode autonome.
> Édité à la main au fil de l'eau. Gitignored (`tmp/` dans .gitignore).
> Source de vérité pour "qu'est-ce qu'il reste à faire" — pas les anciens
> fichiers en mémoire qui sont archivés.
>
> Dernière update : 2026-04-05 soir, session Agent Teams `veridian-invite-flow`
> — 47 commits pushés, feature invitations V1 shipped, CI security + unit gate
> en place.
>
> Légende priorité :
> - 🔥 **P0** — bloquant / urgent (demo demain, régression prod, sécurité critical)
> - ⚡ **P1** — prochaine session (polish UI, fix sécu high, perf)
> - 📦 **P2** — backlog court terme (nouvelles features, refactor)
> - 🌱 **P3** — nice to have / long terme (dark mode, SSO, etc.)

---

## 🔥 P0 — À attaquer en priorité absolue

### P0.URGENT — Rate-limit Supabase : JAMAIS d'admin API dans les hot paths
**Incident 2026-04-06** : `checkTrialExpired()` appelait `getUserById()` à chaque `/api/prospects`, + les e2e-prod faisaient des signup × 3 browsers sur la prod Supabase → rate limit 429 pour TOUT le SaaS (y compris hub).

**Règles absolues** :
- [ ] **JAMAIS `admin.auth.admin.*` dans un hot path** (prospects, pipeline, leads, trial, health, settings). Test guard `trial.test.ts` bloque en CI.
- [ ] **E2e-prod = login-only** (compte existant robert.brunon). JAMAIS de signup/provision en e2e-prod. Les tests signup restent en staging UNIQUEMENT.
- [ ] **Cacher les lookups tenant/plan** : in-memory Map + TTL 5min par user_id. Un seul appel Supabase toutes les 5 min par user, pas à chaque request.
- [ ] **Browser e2e sur staging** : cloner la stack prod (containers + DB dump) en staging pour tester browser headful sans toucher la prod Supabase.
- [ ] **Per-user rate limit côté app** : si un user spam, bloquer CE user (IP ou user_id), pas toute l'app. La rate-limit existante (`src/lib/rate-limit.ts`) doit être appliquée AVANT les appels Supabase, pas après.

### P0.URGENT2 — Membres workspace : admin caché + pipeline partagé
- [ ] **Membres non-admin ne doivent PAS voir /admin** — le guard serveur existe (`layout.tsx`) mais le nav link "Admin" apparaît si `/api/me` retourne isAdmin=true par erreur. Vérifier que le membre invité a bien isAdmin=false.
- [ ] **Pipeline partagé** : admin voit tous les pipelines, membre voit le sien + optionnellement celui des autres (visibility_scope='all'|'own'). Le wiring `getUserFilter` dans `/api/pipeline` et `/api/prospects` est commencé (#26) mais pas terminé.
- [ ] **Bouton "Ajouter au pipeline"** sur chaque prospect row pour qu'un membre puisse claim un lead (crée outreach.status='fiche_ouverte' + user_id du membre).

### P0.-1 — Contrainte compte prod historique `robert.brunon@veridian.site`
- [ ] Robert a noté que son compte réel est `robert.brunon@veridian.site`
      (avec un point) qui existe en **prod**, pas `robert@veridian.site`
      (compte staging utilisé pour les tests).
- [x] **Validé en staging** : le compte `robert@veridian.site` + tenant
      `34f5ee6c-5446-4fe8-a2d1-31c0e4521036` créé le 28 mars (avant le
      refactor SIREN du 4 avril) fonctionne parfaitement avec le nouveau
      flow invitations. Le test e2e chromium qui vient de passer (22s)
      utilise ce vieux tenant. Preuve que le refactor invitations est
      rétro-compatible avec les anciens tenants.
- [ ] **NON validé en prod** : lire en read-only la table `public.tenants`
      prod pour vérifier que `robert.brunon@veridian.site` a bien un
      `user_id` → `tenant_id` mapping équivalent. Si oui, la démo marche
      direct. Si non, il faut créer le tenant manuellement via admin API.
- [ ] **Règle** : ne PAS déployer le code nouveau flow invitations en
      prod (`main`) avant la démo. Rester sur staging pour la démo, prod
      reste intacte.

### P0.0 — GARANT que Robert peut faire l'onboarding de son commercial DEMAIN MATIN
**Critère de succès** : à 9h demain, Robert ouvre staging, crée une
invitation pour son commercial depuis `/admin/invitations`, le commercial
reçoit (ou copie) le lien, clique, pose un password, et atterrit sur
`/prospects` avec des données visibles. Point. Si ça marche pas, rien
d'autre ne compte.

**Liste des vérifs à faire ce soir AVANT qu'il dorme** (~15 min):
- [ ] 1. Staging `/api/status` renvoie healthy, 996K entreprises
- [ ] 2. `robert@veridian.site` password `DevRobert2026!` fonctionne sur
      `/login` en vrai browser (pas juste curl)
- [ ] 3. `/admin/invitations` charge avec le bouton "Nouvelle invitation"
- [ ] 4. `POST /api/admin/invitations` via curl avec cookie admin →
      retourne 200 avec token + inviteUrl + emailSent
- [ ] 5. `GET /api/invitations/{token}` public → 200 avec la shape
      attendue (email, role, workspaceName, inviterEmail, expiresAt)
- [ ] 6. `POST /api/invitations/{token}/accept` avec password valide →
      crée le user Supabase, retourne session
- [ ] 7. **Test manuel bout en bout dans un vrai browser** : login admin,
      créer invitation, copier lien, ouvrir en incognito, accepter,
      redirect /prospects
- [ ] 8. Si échec quelque part : hotfix immédiat, pas de polish, pas de
      ticket, on répare et on re-teste

**Si le flow échoue** → fallback démo backup :
- Fallback A : si l'UI admin invitations crash mais l'API marche → Robert
  peut appeler `/api/admin/invitations` via Postman en démo live (moins
  sexy mais fonctionne)
- Fallback B : si POST /accept crash → Robert crée manuellement le user
  Supabase via admin API puis l'ajoute au workspace via SQL direct (je
  prépare un script `scripts/manual-onboard-commercial.sh` qui fait ça)
- Fallback C : si TOUT pète → Robert fait la démo avec un user existant,
  pas d'invitation live, et montre la page `/admin/invitations` statique
  en disant "et bientôt on pourra inviter depuis ici"

### P0.1 — Valider le run CI actuellement in_progress
Le run `24010624490` teste le nouveau gate `unit` + tout le pipeline avec
bascule non-bloquant admin-pages-v1 + invite-flow. Checker :
- [ ] `build` vert après `unit` (needs chain)
- [ ] `integration` vert (fix tenant-isolation tient)
- [ ] `docker-staging` vert
- [ ] `deploy-staging` vert
- [ ] `e2e-staging` vert (ou WARN sur les non-bloquants seulement)
- [ ] **Si tout vert → marquer la session session Agent Teams comme success et
      shutdown les teammates via SendMessage shutdown_request**

### P0.2 — Fix CI vulns critical avant démo si possible
- [ ] `next@15.3.3` → `15.5.14` (2 CVEs image-optimization). 1 commande :
      `cd dashboard && npm install next@15.5.14 && npm test && git commit`
- [ ] Vérifier que ça ne casse pas le build (minor bump, devrait passer)
- [ ] Si ça casse → revert, documenter dans SECURITY-DEBT.md, reporter post-démo

### P0.3 — Démo session test Robert (quand il le décide)
Suivre `dashboard/docs/DEMO-TEST-PLAN.md` étape par étape. Je suis lead
CI/CD, Robert fait le test manuel. Si quelque chose casse pendant sa
session, fix immédiat par hotfix commit → push.

---

### P0.URGENT3 — E2e browser tests sur staging = copie exacte de prod
**Principe** : les tests browser (Playwright headful) doivent tourner contre staging qui est une **copie exacte** de la stack prod (même DB schema, même data snapshot, même env vars sauf URLs). Jamais contre la prod directe.

- [ ] **Nightly cron** qui dump la DB prod (`pg_dump -Fc`) et restore dans staging. Script `scripts/sync-prod-to-staging.sh`.
- [ ] **Staging Supabase = copie prod** : les users/tenants/plans staging doivent mirrorer la prod. Actuellement staging a ses propres users. Sync via script admin API.
- [ ] **E2e-staging utilise les mêmes comptes que prod** : `robert.brunon@veridian.site` + `Mincraft5*55` (mot de passe synced). Pas de signup en e2e.
- [ ] **E2e-prod SUPPRIMÉ ou réduit au strict minimum** : un seul health check curl, pas de Playwright. Les vrais tests passent en staging.
- [ ] **CI flag `BROWSER=chromium`** en staging, multi-browser uniquement en nightly (pas à chaque push).

---

### P0.URGENT4 — Lead quota freemium + pricing par lot
- [ ] **Freemium** : 300 leads score≥25, zone géo + secteur choisis, distribution proportionnelle par score tier (bronze/silver/gold/diamond). Module `lead-quota.ts` créé, SQL testé.
- [ ] **Payant géo ~20€/mois** : tous les leads de la zone départementale, tous secteurs
- [ ] **Payant full ~50€/mois** : toute la DB 996K
- [ ] **Achat par lot (sans abo)** : payer N leads supplémentaires one-shot (ex: 100 leads = 10€)
- [ ] **Workspace sharing** : leads = pool tenant. Admin invite membres qui partagent le pool. Admin choisit quels leads donner à quel membre.
- [ ] **UI onboarding** : choix zone géo + secteur → distribution 300 leads → affichage compteur "X/300 leads restants"

### P0.URGENT5 — CI pixel-perfect : sécurité, perf, réseau, anti-ratelimit
- [ ] **Compiler tous les tests en un** : un seul job `test-all` qui lance tsc+eslint+vitest+playwright séquentiellement, plus rapide que les jobs séparés avec overhead setup
- [ ] **Tests sécurité API** : scanner les routes pour injection SQL, XSS, auth bypass. Spec Playwright ou script dédié.
- [ ] **Tests réseau anti-ratelimit** : vérifier que AUCUN hot path n'appelle Supabase admin API sans cache. Guard test `trial.test.ts` déjà en place, étendre à tous les fichiers.
- [ ] **CI perf** : lighthouse score sur /prospects et /pipeline, fail si score < 50
- [ ] **CI sur dev server** : self-hosted runner sur dev-server, cache Docker persistant, e2e contre staging local (pas HTTPS)
- [ ] **E2e-prod = login-only** : JAMAIS de signup en prod. Seul invite-flow-demo avec Robert existant.
- [ ] **Staging = copie prod** : nightly sync DB prod → staging pour tests réalistes

---

## ⚡ P1 — Prochaine session (probablement demain après démo)

### P1.1 — CI Priorité 1 (gros gain, 30 min)
Depuis la discussion CI optimisations :
- [ ] Ajouter cache agressif : `node_modules`, `.next/cache`,
      `~/.cache/ms-playwright`, `src/generated/prisma` dans tous les jobs.
      Gain estimé **3-4 min** par run.
- [ ] Paralléliser vraiment `build` et `integration` (actuellement
      integration dépend implicitement de build). Gain **1-2 min**.
- [ ] **Pre-push hook local** `.git/hooks/pre-push` qui lance `tsc + vitest src/`
      avant push. Feedback < 2s localement, protège le CI.

### P1.2 — Polish UI invitations post-démo
Depuis `dashboard/docs/DEMO-TEST-PLAN.md` section "Polish UI" :
- [ ] **P0 polish** dans le doc : loader bouton "Accepter l'invitation"
      (anti double-clic), dialog "copier lien" pas popup mais inline
      dans la table
- [ ] **P1 polish** : logo Veridian sur `/invite/[token]`, message de
      bienvenue plus commercial, badge status couleurs alignées
- [ ] Dashboard `/admin` : ajouter ligne "Invitations récentes" (3-5 dernières)

### P1.3 — Fix bugs de la session détectés tardivement
- [ ] **ui-invite** a remplacé un ancien `/invite/[token]/page.tsx` legacy
      (flow magicLink Prisma). Valider que ça n'a pas cassé le cron cleanup
      des vieux magic_links Prisma ou la route admin/invites anciennement
      utilisée.
- [ ] **twenty.ts getQualifications** : vérifier en live sur staging que
      le resolver SIREN→web_domain marche avec des vraies données (commit
      `9ed5c0d` jamais testé en live)
- [ ] **DB locale postgres:5433 pas migrée** → `npm run db:fresh:siren`
      livré dans `f45153b`, à exécuter quand on voudra dev local

---

## 📦 P2 — Backlog court terme (cette semaine ou prochaine)

### P2.1 — CI Priorité 2 (self-hosted runner)
- [ ] Setup self-hosted runner sur dev-server via
      `myoung34/github-runner` container + registration token
- [ ] Labels `self-hosted,prospection,dev-server` pour les jobs lourds
- [ ] Bascule `docker-staging` et `e2e-staging` sur self-hosted, garder
      `unit` et `build` sur `ubuntu-latest`
- [ ] Mesurer gain (estim : docker build 3min→30s avec cache persistant)
- [ ] Monitoring du runner (script cron qui check qu'il répond)

### P2.2 — Monorepo hub+prospection (évaluation)
Question de Robert 2026-04-05 : "est-ce que ce serais pertinent d'avoir
dans le même repo toute la stack saas avec hub et supabase". Réponse
détaillée plus bas dans cette note. TL;DR : **oui à terme, non
maintenant**, voir P2.2.1 pour la checklist d'évaluation.

- [ ] P2.2.1 Évaluer avantages/inconvénients avec une matrice concrète
- [ ] P2.2.2 Prototyper un monorepo `veridian/` avec `packages/prospection`,
      `packages/hub`, `packages/shared-types`, `infra/supabase/migrations`
- [ ] P2.2.3 Tester la migration sur une branche sans casser les 2 repos
      existants

### P2.3 — Feature invitations V1.5 post-démo
- [ ] **Resend invitation** : bouton "Renvoyer le mail" sur les pending
- [ ] **Audit log** `invitations_audit` : qui a invité qui, quand
- [ ] **Bulk invite** via CSV upload (max 50 emails/batch)
- [ ] **Fine-grained roles** : viewer (read-only), sales (peut caller
      mais pas modifier outreach), admin_workspace (pas tenant-admin)
- [ ] **Expiration cleanup cron** : Dokploy Schedule Job qui marque les
      invitations > 7j en expired

### P2.4 — Tests e2e missing specs
Dans `.github/workflows/ci.yml` `e2e-staging` il y a 14+ specs, mais le
plan C2 en prévoyait 17. Il manque :
- [ ] `pipeline-kanban.spec.ts` (drag & drop statuts)
- [ ] `phone-call-flow.spec.ts` (Telnyx SIP)
- [ ] `stripe-paywall.spec.ts` (trial expired → paywall modal)
- [ ] `claude-ai-flow.spec.ts` (générer note Claude, delete)
- [ ] `global-full-flow.spec.ts` (TOUT le parcours user en une spec)

### P2.5 — Tests API smoke par domaine (C3)
Actuellement on a 2 scripts : `test-dashboard-api.ts` (15 routes) et
`test-invite-api.ts`. Plan prévoit d'éclater :
- [ ] `test-prospects-api.ts`
- [ ] `test-segments-api.ts`
- [ ] `test-stats-api.ts`
- [ ] `test-outreach-api.ts`
- [ ] `test-twenty-api.ts`
- [ ] `test-claude-api.ts`
- [ ] `test-phone-api.ts`

### P2.6 — Monitoring / observabilité
- [ ] Dashboard admin uptime + error rate graph (consommant `/api/status`
      + `/api/errors` ring buffer)
- [ ] Alerting Telegram via `/opt/veridian/monitoring/` si
      `entreprises_count` drop sous 900K ou `db_ms > 1000`
- [ ] Sentry ou équivalent (côté serveur, pour les exceptions route
      handlers)

---

## 🌱 P3 — Long terme (backlog > 1 mois)

### P3.1 — UX polish gros chantier
- [ ] Dark mode Tailwind avec `next-themes`
- [ ] Command palette (cmd+K) shadcn/ui Command
- [ ] Animations Framer Motion sur changements statuts
- [ ] Mobile vraiment responsive (pas juste no-overflow, vraie UX)
- [ ] i18n fr/en (librairie next-intl)

### P3.2 — Refactor & quality
- [ ] Hooks custom extraits dans `src/hooks/` (useLeadSheet, useProspectFilters, etc.)
- [ ] Tests unitaires lib/queries (mock Prisma pour chaque helper)
- [ ] OpenAPI/Swagger généré depuis les routes API
- [ ] Migration depuis `any` vers types stricts partout
- [ ] Extract `src/types/` partagé pour éviter les circular deps

### P3.3 — Sécurité V2
- [ ] Rotate `TENANT_API_SECRET` staging ET prod + HMAC par tenant
- [ ] Migrer `ADMIN_EMAILS` hardcodé vers table `platform_admins`
- [ ] 2FA obligatoire pour les admins (Supabase MFA)
- [ ] CSP strict (Content Security Policy headers)
- [ ] Audit trail cookies sb-* (session history visible dans admin)

### P3.4 — SSO entreprise
- [ ] Google Workspace SSO pour les équipes qui veulent pas gérer des
      passwords dédiés
- [ ] SAML pour les clients enterprise (Okta, Azure AD)
- [ ] Magic link email uniquement pour les petits clients

### P3.5 — Infra & scaling
- [ ] Séparer les DBs : Prospection Postgres dédié + Supabase auth
      séparé (actuellement tout dans le même Postgres Supabase)
- [ ] CDN Cloudflare devant Dokploy pour les assets statiques
- [ ] Backup automatique Postgres staging + prod (Dokploy Backups job)
- [ ] Disaster recovery plan documenté

### P3.6 — Hub UI admin (après intégration API)
L'API invitations vit côté Prospection standalone pour la démo. À terme
elle devra aussi être appelable depuis le Hub (cf. discussion avec Robert
2026-04-05). Checklist :
- [ ] Hub client HTTP pour `/api/admin/invitations` prospection
- [ ] Page `/dashboard/admin/invitations` Hub qui proxy
- [ ] Ou alternative : dupliquer les endpoints côté Hub avec orchestration

---

## Backlog idées diverses non classées

- Animations archivage lead (déjà fait ? session 2026-04-01)
- Keyboard shortcuts help modale — déjà shipped
- localStorage filters — partiellement shipped (presets + geoDepts)
- Rate limit custom `/api/invitations/[token]/accept` — déjà à 10/min
- Logo Veridian / branding cohérent sur Hub + Prospection + Twenty
- Page "Aide" ou documentation utilisateur
- Onboarding tour première connexion (driver.js ou shepherd.js)
- Export CSV prospects filtrés avec filters appliqués (déjà fait partiel)

---

## Historique quick (pour contexte mode autonome)

**Dernière grosse session** : 2026-04-05 Agent Teams `veridian-invite-flow`,
47 commits pushés, 7 teammates parallèles, feature invitations shipped
V1, CI strategy documentée (5 couches), security workflow opérationnel,
perf workflow en place, 4 docs livrés (CI-STRATEGY, SECURITY-DEBT,
INVITE-FLOW, DEMO-TEST-PLAN).

**Avant ça** : session SIREN refactor 2026-04-05 matin (15 commits), fix
UI web_domain vs SIREN, 12 specs Playwright créés, admin pages V1
shippées, endpoint `/api/status` + `/api/errors` + ClientErrorBoundary
trilogie monitoring.

**Session précédente** : marathon 3-4 avril env var fixes, API admin,
52 e2e tests, CI auto-deploy + rollback.
