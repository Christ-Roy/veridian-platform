# Veridian Platform

> Monorepo SaaS Veridian. Lire ce fichier en premier a chaque session.
> Derniere mise a jour : 2026-05-10

## ⚠️ RÈGLE WORKTREE — un agent = un worktree (NON NÉGOCIABLE)

> Mise en place le 2026-05-10 après que `feat/tenants-magic-link` ait avalé 18
> commits de `feat/hub-authjs-migration` à cause d'agents concurrents dans le
> même working directory.

**Plusieurs agents Claude tournent en parallèle sur ce repo.** Pour éviter les
courses critiques (corruption d'index Git, vol de branche checkout, fichiers
édités en concurrence, builds qui se marchent dessus), chaque agent **DOIT**
travailler dans un worktree dédié à son app/sujet.

### Worktrees disponibles (déjà créés)

| Working dir | Branche | Pour quoi |
|---|---|---|
| `~/Bureau/veridian-platform/` | (variable) | **Robert uniquement** — main worktree, pas pour les agents |
| `~/Bureau/veridian-platform-hub/` | `work/hub` | App `hub/` (Auth.js, signup, billing, provisioning) |
| `~/Bureau/veridian-platform-prospection/` | `work/prospection` | App `prospection/` (dashboard B2B, pipeline, leads) |
| `~/Bureau/veridian-platform-cms/` | `work/cms` | App `cms/` (Payload CMS multi-tenant) |
| `~/Bureau/veridian-platform-analytics/` | `work/analytics` | App `analytics/` (dashboard tracking) |
| `~/Bureau/veridian-platform-notifuse/` | `work/notifuse` | App `notifuse/` (email transactionnel fork) |
| `~/Bureau/veridian-platform-twenty/` | `work/twenty` | App `twenty/` (CRM fork + migrations) |
| `~/Bureau/veridian-platform-sites/` | `work/sites` | Sites vitrines clients (`sites/avse`, `sites/morel`, etc.) |
| `~/Bureau/veridian-platform-infra/` | `work/infra` | Dokploy, docker-compose, CI/CD, monitoring |
| `~/Bureau/veridian-platform-cve/` | `work/cve` | Audits CVE, security patches transverses |

> Worktrees historiques (chantiers en cours, NE PAS REUTILISER) :
> `veridian-platform-cve-fix/` (chore/dependabot-cve-automation),
> `veridian-platform-prospection-auth/` (staging, migration auth Prospection),
> `veridian-platform-prodsnap/` (snapshot prod detached HEAD).

### Règles d'utilisation

1. **Avant TOUT travail**, vérifier dans quel worktree tu es :
   ```bash
   pwd && git worktree list | grep "$(pwd)"
   ```
2. **Si tu travailles sur `prospection/`**, tu dois être dans `~/Bureau/veridian-platform-prospection/prospection/`. Idem pour les autres apps.
3. **Pour une nouvelle feature**, partir TOUJOURS d'origin/main frais :
   ```bash
   cd ~/Bureau/veridian-platform-<app>
   git fetch origin
   git checkout -b feat/<app>-<sujet> origin/main
   ```
4. **Les branches doivent être préfixées par leur app** : `feat/prospection-xxx`,
   `fix/hub-yyy`, `chore/cms-zzz`. Pas de noms ambigus comme `feat/tenants-xxx`.
5. **Une PR = une app touchée**. Si tu dois toucher 2 apps, ouvre 2 PRs, sauf
   refacto cross-app explicite.
6. **JAMAIS travailler dans `~/Bureau/veridian-platform/`** (le main worktree)
   en tant qu'agent — c'est l'espace de Robert pour les merges et arbitrages.
7. **JAMAIS faire `git checkout`** d'une branche qui appartient à un autre
   worktree — Git refuse de toute façon, mais ne pas insister.
8. **Créer un nouveau worktree** si ton sujet ne rentre dans aucun de ceux
   listés (ex: gros chantier transverse) :
   ```bash
   cd ~/Bureau/veridian-platform
   git worktree add -b work/<sujet> ../veridian-platform-<sujet> origin/main
   ```

### Pourquoi cette discipline

- **Index Git séparé par worktree** → zéro race sur `.git/index`
- **Branche checkout indépendante** → ton agent ne se retrouve pas sur la
  branche d'un autre par surprise
- **node_modules séparé par app** → installs concurrents ne se cassent pas
- **Builds isolés** → cache `.next/` propre par worktree
- Les agents peuvent vraiment tourner en parallèle sans se polluer

## Ce que c'est

Veridian est un **hub SaaS B2B** qui orchestre plusieurs applications open-source
en les packagant pour des utilisateurs business. Chaque app est independante,
avec son propre auth, sa propre DB, et son integration Stripe.

Le hub (`hub/`) gere l'inscription, le billing centralisé, et le provisioning
automatique des apps pour chaque nouveau tenant.

## Architecture cible

```
                    ┌─────────────────┐
                    │   Stripe        │  ← Source de verite billing
                    │   (webhooks)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      Hub        │  ← Signup, billing, provisioning
                    │  (Next.js 14)   │
                    └────────┬────────┘
                             │ provisionne
              ┌──────────────┼──────────────┐──────────────┐
              │              │              │              │
     ┌────────▼──────┐ ┌────▼───────┐ ┌────▼─────┐ ┌─────▼─────┐
     │  Prospection  │ │  Twenty    │ │ Notifuse │ │  App N    │
     │  (Next.js 15) │ │  (CRM)    │ │ (Email)  │ │  (futur)  │
     │  auth propre  │ │ auth OSS  │ │ auth OSS │ │ auth OSS  │
     │  Prisma+PG    │ │ PG+Redis  │ │ PG       │ │           │
     │  Stripe       │ │           │ │          │ │ Stripe    │
     └───────────────┘ └────────────┘ └──────────┘ └───────────┘
```

## Principes architecturaux

1. **Chaque app a son propre auth.** Pas de dependance a Supabase pour les apps.
   Si Supabase tombe, les apps continuent de fonctionner. Le hub utilise Supabase
   pour SON auth, mais les apps gerent leur auth independamment.

2. **Stripe est la source de verite.** L'etat d'un tenant (plan, limites, actif/suspendu)
   est pilote par Stripe via webhooks. Pas de table maison "plans" qu'on maintient
   a la main. Chaque app qui a un modele payant a sa propre integration Stripe.

3. **Les apps sont des blocs independants.** On doit pouvoir ajouter une app OSS
   au SaaS en une session : fork, adapter l'auth, brancher Stripe, deployer.
   On doit pouvoir retirer une app sans casser le reste.

4. **Le hub est leger.** Il fait signup + billing + provisioning. Pas de logique
   metier. La logique metier vit dans chaque app.

5. **Infrastructure simple.** Docker compose + Dokploy + OVH VPS. Pas de Kubernetes,
   pas de microservices compliques. Un commercial seul doit pouvoir maintenir ca.

## Structure du monorepo

```
veridian-platform/
├── hub/                    # Hub SaaS (ex Web-Dashboard) — Next.js 14, pnpm
│   ├── Dockerfile
│   ├── package.json
│   └── app/, lib/, ...
├── prospection/            # Dashboard B2B prospection — Next.js 15, npm
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   └── src/, e2e/, ...
├── infra/                  # Docker compose prod/staging/dev + scripts
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── docker-compose.staging.yml
├── .github/workflows/
│   ├── hub-ci.yml          # CI hub (trigger: hub/**)
│   └── prospection-ci.yml  # CI prospection (trigger: prospection/**)
├── .claude/
│   └── rules/              # Regles contextuelles par domaine
├── todo/
│   └── TODO-LIVE.md        # Backlog priorise P0→P3, source unique
└── docs/                   # Architecture, deploy, testing
```

## CI/CD — Ship fast, break nothing

La CI est le seul filet de securite. Si elle passe, le code va en prod.
Si elle est cassee ou incomplete, on ne ship plus rien tant que c'est pas fixe.

**Flow** : push main → lint/test (cloud 30s) → docker build + e2e (self-hosted 3min) → deploy prod (1min)
**Self-hosted runner** : dev server (37.187.199.185), cache Docker local, builds en 25s.
**Rollback auto** : si health check prod fail, retour a l'image precedente en 30s.

Voir `ci/README.md` pour les details.

## Branches

| Branche | Role |
|---------|------|
| `main` | Production. Push = test = deploy prod (si CI verte) |
| `staging` | Tests staging (transition vers trunk-based, a terme tout sur main) |

## Deploiement

- **Prod OVH** (`ssh prod-pub`) : hub + prospection + Supabase + Twenty + Notifuse
- CI : push main → build → test → docker → deploy prod → health check → rollback si fail

## URLs

| Service | Prod | Staging |
|---------|------|---------|
| Hub | app.veridian.site | saas-hub.staging.veridian.site |
| Prospection | prospection.app.veridian.site | saas-prospection.staging.veridian.site |
| Supabase API | api.app.veridian.site | saas-api.staging.veridian.site |
| Twenty | twenty.app.veridian.site | — |
| Notifuse | notifuse.app.veridian.site | — |

## Regles absolues

- **La CI est sacree** — si un test fail, on fixe le test ou le code. Pas de skip, pas de contournement
- **JAMAIS modifier la prod** sans accord de Robert
- **JAMAIS d'appel Supabase admin API dans un hot path** — cache obligatoire
- **JAMAIS `git push --force`** sur une branche partagee
- **JAMAIS `git stash -u`** — deplacer vers /tmp/
- **Toujours tester** : `npm run build` + `npm test` avant push
- **Toujours penser aux tenants existants** avant toute migration DB

## Credentials

Tout dans `~/credentials/.all-creds.env` (local). Ne JAMAIS commit de secrets.

## TODO

- **Backlog strategique global** : `todo/TODO-LIVE.md` (source de verite, ordre des sprints,
  arbitrages, chantiers douloureux en bas a ne PAS commencer sans accord)
- **TODO detaillee par app** : `todo/apps/<app>/TODO.md` (sous-taches, etat d'avancement,
  bugs connus, decisions techniques, notes agents au fil de l'eau)
- **UI polish solo** : `todo/apps/<app>/UI-REVIEW.md` (file d'attente de review pour Robert
  en session standalone, hors sprint, avec Next dev)

**Workflow agent obligatoire** :
1. Avant de bosser sur une app → lire `todo/apps/<app>/TODO.md`
2. Pendant le sprint → cocher les sous-taches, noter decisions/blockers dans ce fichier
3. A la livraison d'une page ou composant UI → creer une entree dans `todo/apps/<app>/UI-REVIEW.md`
   avec URL dev, fichiers modifies, points a polish suspectes
4. A la fin → mettre a jour l'etat actuel (version, sante, recently shipped)

Les entrees UI-REVIEW sont traitees par Robert en solo, tranquillement, sans bloquer les
sprints en cours. Les agents ne polishent pas l'UI eux-memes — ils livrent fonctionnel,
Robert polish ensuite.
