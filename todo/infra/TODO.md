# Infra & transverses — TODO

> Sujets qui ne se rattachent à aucune app spécifique : CI/CD plateforme,
> agents Claude autonomes, cleanup monorepo, observabilité, sécurité V2.
>
> Source de vérité pour les sujets cross-app stratégiques (Stripe trial,
> magic link, workspace admin) : [`../VISION-CROSS-APP.md`](../VISION-CROSS-APP.md).
>
> **🚨 Sécurité post-incident verger-shop (7 mai 2026)** :
> [`INCIDENT-2026-05-07-TODO.md`](./INCIDENT-2026-05-07-TODO.md) — actions
> P0 (Boxtal/Stripe/Telegram révocations), P1 (CrowdSec mal configuré, CVE
> Twenty 1.16.7 RCE active, Kong 2.8.5 vieux), P2 (audit surface, secrets
> manager), P3 (migration sites clients vers serverless).

## CI/CD plateforme

### Tests e2e — séparation core/extended pour Prospection
- [ ] Séparer 5 specs core (auth-login, prospects-crud, pipeline-flow, health, tenant-isolation, ~2min, BLOQUANT) des 15 extended (admin, search, export, mobile, NON-BLOQUANT)
- [ ] Core sur cloud (ubuntu-latest, réseau stable — self-hosted a flaky réseau)
- [ ] Extended sur cloud en parallèle, sharding 3 browsers (chromium/firefox/webkit)
- [ ] Docker build reste self-hosted (cache local 20s vs 3min cloud)
- [ ] Tests lourds en batch : toutes les 3h ou tous les 5 commits, clone DB prod + migrations + e2e complet
- [ ] Health check prod post-deploy : 1 spec login-only (pas de signup, évite rate limit Supabase)
- [ ] Appliquer les mêmes principes à `hub-ci.yml`

### Maintenance CI
- [ ] Lier package GHCR `veridian-dashboard` au repo monorepo (Robert : settings package)
- [ ] **Node.js 20 deprecation** : actions GitHub forcées en Node 24 le 2026-06-02 — auditer et bumper avant
- [ ] Script `ci/check-oss-versions.sh` : alertes sur bump Twenty / Notifuse / Postgres / Payload

### E2E core robustes pour validation Dependabot CVE auto-merge

> **Contexte** : depuis 2026-05-08, le workflow `dependabot-cve-automation.yml`
> auto-merge les PR Dependabot patch+minor si la CI est verte. Mais les CI
> Veridian sont actuellement flaky (success rate sur main : prospection 70%,
> cms 46%, hub 40%, analytics 36%). Risque concret : une PR Dependabot
> patchant une CVE high fail à cause d'un test flaky → pas de merge → CVE
> reste exploitable en prod jusqu'à intervention manuelle.
>
> **Objectif** : un set de tests e2e "core" ultra-stable (95%+ pass sur main,
> sans intervention) qui valident qu'un bump de dep ne casse rien de critique.
> Ces tests core deviennent le **seul gate** pour l'auto-merge Dependabot.
> Les tests extended actuels restent en place pour le reste du flow (PR humaines).

- [ ] **Identifier les golden paths** par app (3-5 specs max, < 2min total) :
  - prospection : login + create lead + move pipeline stage
  - hub : signup + login + provision tenant Stripe
  - analytics : login + view tenant dashboard + check tracker payload reçu
  - cms : login admin + create tenant page + publish
- [ ] **Réécrire ces specs robustes** : pas de retry caché (chaque retry masque un bug), waitFor sur sélecteurs stables (data-testid, pas du texte qui bouge), DB seed déterministe par run (UUID préfixés `e2e-${runId}-`), nettoyage en `afterAll` même si test fail
- [ ] **Job dédié `e2e-core-cve` dans chaque CI** : ne tourne que sur les PR Dependabot (filter par `github.actor == 'dependabot[bot]'` ou label `dependencies`), self-hosted runner pour cache Docker
- [ ] **Modifier `dependabot-cve-automation.yml`** : auto-merge ne se déclenche que si `e2e-core-cve` est vert (pas l'intégralité de la CI). Autres jobs (extended, lighthouse, etc.) restent informatifs pour PR humaines
- [ ] **Mesurer la stabilité** : 30 runs back-to-back sur main avant d'activer (script `ci/measure-flakiness.sh` qui boucle `gh run rerun`). Cible : 30/30 pass
- [ ] **Garde-fou** : si `e2e-core-cve` fail 3 fois de suite sur main (donc pas un cas isolé), bot Telegram alerte → suspendre temporairement l'auto-merge Dependabot (`gh secret set DEPENDABOT_AUTO_MERGE_DISABLED`)

### Backup automatique
- [ ] CI : job `test-prod-migration` (pg_dump prod → stack-test → migrations Prisma → smoke tests)
- [ ] Backup automatique Postgres staging + prod via Dokploy Schedule (déjà fait pour CMS, à étendre)
- [ ] Rotation 7j stockage dev server, 30j stockage R2

## Agents Claude autonomes

> Permettre aux agents de boucler en autonomie sur une feature avec la CI comme
> seul oracle de vérité. Possible parce que la CI est 100% anti-régression et
> envoie en prod automatiquement.
>
> **Attention coût** : pas de Haiku/Sonnet sur des tâches complexes — les
> allers-retours crament plus de contexte que le gain en token. Lead = Opus 1M,
> teammates adaptés à la complexité.

**Infrastructure**
- [ ] Dossier `.claude/agents/` avec agents spécialisés :
  - `prospection-dev.md` (Sonnet/Opus) — Prisma, Next.js 15, e2e
  - `hub-dev.md` (Opus) — Auth.js, Stripe, provisioning
  - `notifuse-dev.md` (Opus) — Go, API-only
  - `analytics-dev.md` (Sonnet) — stack Prospection clone
  - `cms-dev.md` (Opus) — Payload 3, multi-tenant, blocks
  - `ci-fixer.md` (Opus) — debug CI, parse `gh run view`, fix
  - `migration-agent.md` (Opus, supervisé) — Prisma Migrate, dry-run, rollback
  - `test-writer.md` (Sonnet) — e2e + unit
  - `ui-polish.md` (Sonnet) — UI, copy, styling
- [ ] Prompt système de chaque agent : lire les rules, lire la TODO de l'app, explorer avec Glob/Grep, push proprement (batch commits, jamais force push)

**Workflow CI-loop**
- [ ] Agent push → `gh run watch` → si fail, `gh run view --log-failed` → parse → fix → re-push
- [ ] Boucle max 5 itérations avant escalade au lead
- [ ] Patterns de fix courants documentés : TS error, test fail, lint, docker build cache miss
- [ ] Cap tokens par tâche (ex 200k) pour éviter les ruineuses
- [ ] Vérifier doc Claude Code : `TaskCreate` + `SendMessage` supportent-ils déjà ce pattern ? Ou skill custom `ci-loop` ? Hook `PostToolUse` pour trigger auto post-push ?

**Validation**
- [ ] Test réel : 3 agents en parallèle sur 3 tâches P2, boucler 1h, mesurer taux de succès (feature livrée + CI verte + zéro intervention)
- [ ] Doc `docs/agents-autonomous.md` : comment lancer un sprint autonome, limites connues, quand escalader

## Monorepo cleanup

- [ ] Nettoyer `infra/` : virer docs legacy (AGENTS.md, SOUL.md, IDENTITY.md si présents), `_archive/`
- [ ] Nettoyer `hub/` : virer tmp/archives si présent
- [ ] `.env.example` à jour pour `hub/`, `prospection/`, `analytics/`, `cms/`
- [ ] Audit imports inutilisés / dépendances obsolètes (`npx depcheck` par app)

## Observabilité / monitoring

- [ ] Dashboard admin uptime + error rate (consommant `/api/status` + `/api/errors`)
- [ ] Sentry ou équivalent côté serveur pour les 4 apps (hub, prospection, analytics, cms)
- [ ] Étendre `veridian-prod-healthcheck` (déjà fait pour CMS) à analytics, prospection, hub
- [ ] Centraliser les logs (Loki + Grafana ?) — décision à prendre

## Sécurité V2

- [ ] Rotate `TENANT_API_SECRET` staging ET prod + HMAC par tenant
- [ ] Migrer `ADMIN_EMAILS` hardcodé vers table `platform_admins` Prisma
- [ ] TOTP obligatoire pour les admins (extension du 2FA email Hub)
- [ ] CSP strict par app
- [ ] Étendre 2FA email à Prospection, Notifuse, Analytics (déjà sur Hub + Analytics)

## Bugs transverses

- [ ] `twenty.ts getQualifications` : vérifier mapping SIREN→web_domain en staging (Prospection)
- [ ] `/segments/rge/sans_site` : root cause serveur (body vide) — Prospection
- [ ] DB locale `postgres:5433` pas migrée → documenter `npm run db:fresh:siren`

## Recently shipped

- **2026-04-25** — CMS Payload 3 multi-tenant en prod (CI/CD 5 phases, backup R2 quotidien, monitoring systemd)
- **2026-04-13** — Analytics POC en prod (CI/CD 6 phases, rollback auto)
- **2026-04-10** — `veridian-core-db` Postgres dédié provisionné via Dokploy sourceType git
- **2026-04-10** — `docs/saas-standards.md` (699+ lignes, 12 sections + checklist audit, §9 flow CI/CD avec rollback)
- **2026-04-07** — Kong rate-limit par IP client (`limit_by: ip`, 100/min open + 200/min auth en prod)
- **2026-04-06** — Migration monorepo + self-hosted runner + CI refactor (docker 25s, deploy 11s)
