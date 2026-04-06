# CI/CD — Veridian Platform

> Ce dossier contient des liens symboliques vers les workflows GitHub Actions
> pour les rendre accessibles sans naviguer dans `.github/workflows/`.

## Philosophie

**Ship fast, break nothing.** Chaque push sur `main` doit aller en prod
si les tests passent. La CI est le seul filet de securite — si elle est
cassee ou incomplete, on ne peut plus shipper en confiance.

La CI doit etre **100% regression** : si un test passe aujourd'hui,
il doit passer demain. Les tests flaky sont des bugs a fixer, pas a skip.

## Architecture actuelle

```
git push main
    |
    v
Phase 1 — Cloud GitHub (gratuit, illimite)     ~1min30
  tsc + eslint + vitest unit (30s)
  npm run build (1min)
    |
    v
Phase 2 — Self-hosted dev server               ~3min
  docker build (25s avec cache local)
  deploy staging (11s)
  e2e Playwright chromium (3min)
    |
    v
Phase 3 — Deploy prod                          ~1min
  docker push GHCR
  Dokploy redeploy
  health check (30s)
  rollback auto si health fail
```

**Temps total : ~5min30 du push a la prod.**

## Architecture cible (trunk-based)

```
git push main
    |
    v
Phase 1 — Cloud (30s)
  tsc + eslint + vitest
    |
    v
Phase 2 — Self-hosted (4min)
  docker build
  pg_dump prod → stack-test ephemere
  deploy dans stack-test
  run migrations sur vrais tenants
  e2e Playwright
  cleanup stack-test
    |
    v
Phase 3 — Deploy prod (1min)
  docker push + Dokploy redeploy
  health check prod (login-only, pas de signup)
  rollback auto si fail
```

**Diff avec l'actuel :**
- Plus de branche staging. Tout passe par main.
- Les tests tournent contre un clone de la prod (pas des donnees fake).
- Health check prod = 1 spec login-only (pas de signup = pas de rate limit).

## Workflows

| Fichier | Service | Trigger | Runner |
|---------|---------|---------|--------|
| [prospection-ci.yml](prospection-ci.yml) | Prospection | `prospection/**` | Cloud (lint/test) + Self-hosted (docker/e2e) |
| [hub-ci.yml](hub-ci.yml) | Hub | `hub/**` | Cloud (lint/test) + Self-hosted (docker) |

## Self-hosted runner

- **Machine** : dev server (37.187.199.185)
- **Service** : `actions.runner.Christ-Roy-veridian-platform.veridian-dev-server`
- **Labels** : `self-hosted, Linux, X64, veridian`
- **Avantages** : cache Docker local (build 25s vs 5min), cache node_modules, browsers Playwright pre-installes

```bash
# Verifier l'etat du runner
ssh dev-pub "sudo systemctl status actions.runner.Christ-Roy-veridian-platform.veridian-dev-server"

# Redemarrer
ssh dev-pub "sudo systemctl restart actions.runner.Christ-Roy-veridian-platform.veridian-dev-server"
```

## Regles

- **Jamais skip un test** : si un test est flaky, le fixer ou le supprimer. Pas de `.skip()`.
- **Jamais de signup Supabase en e2e** : login avec compte existant uniquement. Signup = rate limit.
- **cancel-in-progress** : si 3 pushes rapides, seul le dernier est teste. Les autres sont annules.
- **Rollback auto** : si le health check prod fail apres deploy, rollback vers l'image precedente.
- **Pas de deploy manuel** : tout passe par la CI. Si la CI est cassee, on la fixe d'abord.
