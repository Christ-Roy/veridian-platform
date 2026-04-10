# Veridian Platform

> Monorepo SaaS Veridian. Lire ce fichier en premier a chaque session.
> Derniere mise a jour : 2026-04-06

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
