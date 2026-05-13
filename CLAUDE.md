# Veridian Infra

> Repo ex-monorepo, désormais **infra-only** depuis la migration polyrepo de 2026-05-13.
> Renommage GitHub `veridian-platform` → `veridian-infra` planifié à la fin du sprint
> Standard CI Veridian.

## Ce que c'est

Ce repo contient **tout sauf le code des apps** :

- `infra/` — composes Docker Dokploy (prod, staging, dev, supabase, traefik, etc.), scripts deploy, fail2ban, volumes
- `runbooks/` — procédures opérationnelles (Dokploy GitOps, blue-green, recovery)
- `docs/` — architecture, saas-standards, roadmap
- `sites/` — démos test pour CMS et Analytics (templates restaurant/artisan, demo-cms, demo-analytics) — **pas les sites de clients réels** qui sont sur Cloudflare Pages
- `ci/` — workflows partagés et scripts CI
- `todo/` — TODO globale `TODO-LIVE.md`, vision cross-app
- `.github/workflows/` — workflows transverses (`_audit-cve`, `_trivy-image`, `sites-deploy`, `extend-staging-trial`)

## Apps Veridian — où elles vivent maintenant

Le code applicatif a été extrait en polyrepo le 2026-05-13. Chaque app est un repo
GitHub séparé avec son propre CI, son Dependabot, sa branche `main`.

| App | Repo GitHub | Dossier local |
|---|---|---|
| Hub | `Christ-Roy/veridian-hub` | `~/Bureau/veridian-hub/` |
| Prospection | `Christ-Roy/veridian-prospection` | `~/Bureau/veridian-prospection/` |
| CMS | `Christ-Roy/veridian-cms` | `~/Bureau/veridian-cms/` |
| Analytics | `Christ-Roy/veridian-analytics` | `~/Bureau/veridian-analytics/` |
| Notifuse | `Christ-Roy/notifuse-veridian` | `~/Bureau/notifuse-veridian/` |
| Twenty | (pas encore extrait) | `~/Bureau/veridian-platform-twenty/` (worktree de ce repo) |

Twenty doit dégager au prochain sprint Hub (pas de code custom Veridian).

## Worktrees actifs sur ce repo

| Working dir | Branche | Rôle |
|---|---|---|
| `~/Bureau/veridian-platform/` | `ci-prod-smoke` | Espace Robert pour merges/arbitrages |
| `~/Bureau/veridian-platform-main/` | `main` | Référence read-only `origin/main` |
| `~/Bureau/veridian-platform-infra/` | `work/infra` | Chantier infra/CI/deploy actif |
| `~/Bureau/veridian-platform-twenty/` | `work/twenty` | Twenty (à dégager) |

Les worktrees `-hub`, `-prospection`, `-cms`, `-analytics`, `-notifuse`, `-cve`, `-prodsnap`,
`-sites` ont été supprimés lors de la migration polyrepo.

## Règles d'utilisation

1. **Pas de code applicatif ici.** Tout PR qui rajoute du code d'app → repo polyrepo
   correspondant, pas ici.
2. **Modif infra transverse** (compose Dokploy, runbook, doc, TODO globale, scripts CI
   partagés) → ce repo, sur `main` direct si commit simple, sinon PR.
3. **Worktrees** : chaque agent travaille dans un worktree dédié (pas dans
   `~/Bureau/veridian-platform/` qui est l'espace Robert).
4. **`-main` est read-only** pour les agents. Sync auto `origin/main`. Pour voir l'état
   prod actuel : `cd ~/Bureau/veridian-platform-main && git log --oneline -10`.

## Standard CI Veridian

Tous les repos polyrepo doivent respecter le **Standard CI Veridian** documenté dans
`runbooks/standards/ci-veridian.md` (à rédiger, sprint P0 en cours — voir
`~/Bureau/SPRINT-GITOPS-VERIDIAN.md`).

Règles clés :

1. **1 route = 1 fichier de test au même chemin.** Pre-push hook bloquant + check CI.
2. **Path-based skip** docs-only, **path-based staging gate** pour changements structurels.
3. **Deploy via API Dokploy** (`POST /api/compose.deploy`) + Bearer token, runner self-hosted ou route Traefik scopée.
4. **Dependabot actif** hebdomadaire (npm/gomod + docker + github-actions).
5. **GitHub Environments `staging` + `production`** par repo, secrets séparés, manual approval prod si structurel.

## Sécurité — règles non négociables

Voir `~/.claude/CLAUDE.md` section "Sécurité" (post-breach verger-shop 2026-05-07).
Notamment :

- **JAMAIS deploy avec CVE critical/high non patchée**
- **JAMAIS de version beta Next.js/Next-auth en prod**
- **JAMAIS de secret dans le repo**
- **TOUJOURS** `npm audit` avant push, `trivy image` post-build

## CI/CD

Flow : push polyrepo → CI cloud quick checks → CI self-hosted dev server build/e2e →
deploy via API Dokploy → smoke test → rollback auto si fail.

Workflows transverses dans `.github/workflows/` de ce repo :
- `_audit-cve.yml` — audit npm reutilisable
- `_trivy-image.yml` — scan Trivy reutilisable
- `sites-deploy.yml` — deploy des sites demo
- `extend-staging-trial.yml` — extension trial staging tenants

## Branches

| Branche | Rôle |
|---|---|
| `main` | Source de vérité infra. Push direct OK pour modifs simples. |
| `work/infra` | Worktree de chantier infra continu |
| `work/twenty` | Twenty (à dégager prochain sprint) |
| `ci-prod-smoke` | Tests smoke prod, branche dédiée Robert |

## Règles absolues

- **JAMAIS modifier la prod** sans accord Robert
- **JAMAIS `git push --force`** sur branche partagée
- **JAMAIS `git stash -u`** — déplacer vers `/tmp/`
- **La CI est sacrée** — fix le code ou le test, pas de skip
- **Sites clients réels = Cloudflare Pages** (pas ici). Seuls les sites démo CMS/Analytics
  vivent dans `sites/`.

## TODO

- `todo/TODO-LIVE.md` — backlog priorisé global (cross-app + infra)
- `todo/VISION-CROSS-APP.md` — vision plateforme à 12 mois
- Sprint actif : `~/Bureau/SPRINT-GITOPS-VERIDIAN.md` (P0 Standard CI, P1 GitOps Dokploy)

## Credentials

Tout dans `~/credentials/.all-creds.env` (local, jamais commit). Voir `~/.claude/CLAUDE.md`
section "Credentials centralisés".
