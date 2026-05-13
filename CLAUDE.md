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

### Worktrees disponibles (état au 2026-05-10)

**Modèle : 1 app = 1 worktree permanent**. Tous les chantiers d'une app vivent
dans le même worktree, accessibles via `git checkout <branche>` à l'intérieur.
Si plusieurs chantiers concurrents sur la même app doivent vraiment tourner en
parallèle, créer un worktree temporaire à ce moment-là (pas avant).

| Working dir | Branche actuelle | Branches accessibles via checkout |
|---|---|---|
| `~/Bureau/veridian-platform/` | `ci-prod-smoke` | **Robert uniquement** — agents : interdit |
| `~/Bureau/veridian-platform-main/` | `main` | `main` (commits transverses : CLAUDE.md, doc, `.claude/rules/`) |
| `~/Bureau/veridian-hub/` | `main` | **EXTRAITE 2026-05-13** vers `Christ-Roy/veridian-hub` |
| `~/Bureau/veridian-prospection/` | `main` | **EXTRAITE 2026-05-13** vers `Christ-Roy/veridian-prospection` |
| `~/Bureau/veridian-cms/` | `main` | **EXTRAITE 2026-05-13** vers `Christ-Roy/veridian-cms` |
| `~/Bureau/veridian-platform-analytics/` | `work/analytics` | `feat/analytics-*`, `fix/analytics-*` |
| `~/Bureau/notifuse-deploy/` | `main` | **EXTRAITE 2026-05-13** vers `Christ-Roy/notifuse-deploy` |
| `~/Bureau/veridian-platform-twenty/` | `work/twenty` | `feat/twenty-*`, `fix/twenty-*` |
| `~/Bureau/veridian-platform-sites/` | `work/sites` | `feat/sites-*`, sites clients |
| `~/Bureau/veridian-platform-infra/` | `work/infra` | `feat/infra-*`, CI, Docker, Dokploy |
| `~/Bureau/veridian-platform-cve/` | `fix/cve-2026-05-08` | `fix/cve-*`, `chore/dependabot-*` |
| `~/Bureau/veridian-platform-prodsnap/` | (detached) | Snapshot prod intact, ne pas toucher |

Les branches `work/<app>` servent juste de point de départ frais quand le worktree
n'a pas de chantier actif — elles trackent `origin/main` et restent vides.

### Règles d'utilisation

1. **Avant TOUT travail**, vérifier dans quel worktree tu es :
   ```bash
   pwd && git worktree list | grep "$(pwd)"
   ```
2. **Travail sur une app spécifique** → worktree app-scopé. Si pour `prospection/`,
   tu dois être dans `~/Bureau/veridian-platform-prospection/prospection/` (ou un
   worktree dédié au chantier en cours).
3. **Modif transverse / globale** (CLAUDE.md racine, doc, règles `.claude/rules/`,
   TODO globale, scripts `infra/`) → utiliser `~/Bureau/veridian-platform-main/`,
   commit direct sur `main`, push direct. Pas de branche feature inutile pour ça.
4. **Pour une nouvelle feature applicative**, partir TOUJOURS d'origin/main frais :
   ```bash
   cd ~/Bureau/veridian-platform-<app>
   git fetch origin
   git checkout -b feat/<app>-<sujet> origin/main
   ```
5. **Les branches doivent être préfixées par leur app** : `feat/prospection-xxx`,
   `fix/hub-yyy`, `chore/cms-zzz`. Pas de noms ambigus comme `feat/tenants-xxx`.
6. **Une PR = une app touchée**. Si tu dois toucher 2 apps, ouvre 2 PRs, sauf
   refacto cross-app explicite.
7. **JAMAIS travailler dans `~/Bureau/veridian-platform/`** (le main worktree)
   en tant qu'agent — c'est l'espace de Robert pour les merges et arbitrages.
8. **JAMAIS faire `git checkout`** d'une branche qui appartient à un autre
   worktree — Git refuse de toute façon, mais ne pas insister.
9. **Switch de chantier dans le même worktree** : `cd ~/Bureau/veridian-platform-<app> && git checkout <branche>`. Les autres branches de l'app restent accessibles, pas besoin de worktree par chantier.
10. **Worktree temporaire** uniquement si 2 agents doivent VRAIMENT bosser en parallèle sur 2 branches différentes de la même app **au même moment**. Sinon : 1 worktree par app suffit.
   ```bash
   cd ~/Bureau/veridian-platform
   git worktree add ../veridian-platform-<app>-<sujet> <branche-existante>
   # ... travail ...
   git worktree remove ../veridian-platform-<app>-<sujet>  # nettoyer après
   ```

### Pourquoi cette discipline

- **Index Git séparé par worktree** → zéro race sur `.git/index`
- **Branche checkout indépendante** → ton agent ne se retrouve pas sur la
  branche d'un autre par surprise
- **node_modules séparé par app** → installs concurrents ne se cassent pas
- **Builds isolés** → cache `.next/` propre par worktree
- Les agents peuvent vraiment tourner en parallèle sans se polluer

### Worktree `-main` — référence read-only synchronisée avec `origin/main`

Le worktree `~/Bureau/veridian-platform-main/` est la **source de vérité du repo
pour les agents**. Sa fonction est unique : refléter `origin/main` à tout moment,
pour que n'importe quel agent puisse aller voir "à quoi ressemble la prod
maintenant" sans avoir à fetch/checkout dans son propre worktree.

**Règles absolues** :

1. **JAMAIS coder dans `-main`**. Pas de `git commit`, pas de `git checkout`
   d'une autre branche, pas de modifs de fichiers. C'est read-only pour les
   agents (Robert peut y faire un commit transverse exceptionnel — doc/CI —
   mais en mode conscient).
2. **JAMAIS rebaser/merger depuis `-main` local**. Toujours depuis
   `origin/main` après un `git fetch`. Le worktree local peut être en retard
   sur le remote entre deux syncs.
3. **`-main` se sync automatiquement** :
   - **Au lancement de `cc-saas`** : `git fetch origin && git reset --hard origin/main`
     dans `-main` AVANT d'ouvrir Konsole. Sync immédiate à chaque session.
   - **Cron utilisateur toutes les 15 min** (backup pour sessions longues) :
     même commande. Idempotent, silencieux si déjà à jour.
   - **Guard** : si `-main` a des modifs locales détectées au démarrage, le
     script `cc-saas` ne sync pas et alerte (= signe que quelqu'un a bricolé,
     à investiguer manuellement avant écrasement).
4. Les autres worktrees gèrent leur sync eux-mêmes (`git pull --rebase
   origin <branche>` quand ils ont besoin). Pas de sync auto sur les
   worktrees de travail — sinon on écrase du WIP.

**Si tu veux savoir ce qui est en prod maintenant** :
```bash
cd ~/Bureau/veridian-platform-main
git log --oneline -10           # 10 derniers commits sur origin/main
git diff HEAD~5 --stat          # ce qui a changé sur main ces 5 derniers commits
```

## Ce que c'est

Veridian est un **hub SaaS B2B** qui orchestre plusieurs applications open-source
en les packagant pour des utilisateurs business. Chaque app est independante,
avec son propre auth, sa propre DB, et son integration Stripe.

Le Hub gere l'inscription, le billing centralisé, et le provisioning
automatique des apps pour chaque nouveau tenant.

**Hub a été extrait le 2026-05-13** vers `Christ-Roy/veridian-hub`. Le code,
le compose Dokploy, la CI et la TODO hub vivent maintenant LÀ-BAS.
Le monorepo garde les apps non-extraites (cms, analytics, twenty, sites) et
l'infra commune.

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
├── infra/                  # Docker compose prod/staging/dev + scripts
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── docker-compose.staging.yml
├── .github/workflows/
│   ├── _audit-cve.yml      # Reusable npm audit (utilisé par toutes apps)
│   └── _trivy-image.yml    # Reusable Trivy image scan
├── .claude/
│   └── rules/              # Regles contextuelles par domaine
├── todo/
│   └── TODO-LIVE.md        # Backlog priorise P0→P3, source unique
└── docs/                   # Architecture, deploy, testing
```

**Hub a été extrait le 2026-05-13** vers son propre repo :
- Repo : `Christ-Roy/veridian-hub` (public)
- Worktree local : `~/Bureau/veridian-hub/`

**Prospection a été extraite le 2026-05-13** vers son propre repo :
- Repo : `Christ-Roy/veridian-prospection` (privé)
- Worktree local : `~/Bureau/veridian-prospection/`
- Raison : aucun code partagé prospection ↔ monorepo, PRs/Dependabot polluaient
  inutilement le contexte des autres agents apps.

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
| Prospection ⚠️ extraite | prospection.app.veridian.site | saas-prospection.staging.veridian.site |
| Supabase API | api.app.veridian.site | saas-api.staging.veridian.site |
| Twenty | twenty.app.veridian.site | — |
| Notifuse | notifuse.app.veridian.site | — |

⚠️ Prospection vit maintenant dans `Christ-Roy/veridian-prospection` (extrait du monorepo 2026-05-13).

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
