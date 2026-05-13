# Agent Notifuse — fiche de mission sprint GitOps

> **Cas spécial** : Notifuse est le **pilot** du sprint. Tu travailles en binôme avec
> l'agent infra (Claude principal) qui exécute la migration. Tu valides côté app que
> rien ne casse pendant et après.

## Scope

| Champ | Valeur |
|---|---|
| App | **Notifuse** (email transactionnel self-hosted) |
| Worktree | `~/Bureau/veridian-platform-notifuse/` |
| Branche cible | `feat/notifuse-gitops-migration` |
| Repo GitHub | (à confirmer — repo séparé ou monorepo ?) |
| Stack Dokploy slug | `compose-transmit-open-source-microchip-k9lvap` |
| Compose path cible repo | `infra/services/notifuse/docker-compose.yml` |
| Domaine prod | `notifuse.app.veridian.site` |
| Containers | `compose-transmit-open-source-microchip-k9lvap-notifuse-prod-1` + `-notifuse-prod-db-1` |
| Image app | `ghcr.io/christ-roy/notifuse-veridian:saas-v1.0.3` |
| Image DB | `postgres:17-alpine` |
| Network interne | `compose-transmit-open-source-microchip-k9lvap_notifuse-internal` |
| Volume DB | (à snapshot d'abord) |

## Endpoints à smoke test

```bash
curl -sI https://notifuse.app.veridian.site                # attendu : 307 (redirect login)
curl -sI https://notifuse.app.veridian.site/api/health     # si endpoint existe
```

## Pré-requis (faits par l'agent infra)

L'agent infra (Claude principal) a déjà :
- ✅ Audité Notifuse en prod (cf [prod-inventory-audit.md](../prod-inventory-audit.md))
- ✅ Bumpé Traefik (ton app passe par Traefik post-bump sans souci)
- Va rédiger [gitops-pattern.md](../gitops-pattern.md) en utilisant Notifuse comme pilot

## Ton rôle pendant la migration

**Phase A — Validation passive (l'agent infra exécute, tu observes)**

L'agent infra va :
1. Snapshot Notifuse actuel dans `tmp/dokploy-snapshot-notifuse-<date>/` (worktree infra)
2. Créer/améliorer `infra/services/notifuse/docker-compose.yml` Git-clean
3. Bascule Dokploy provider Raw → Git
4. Premier deploy test
5. Test rollback

Toi tu :
- Monitor `https://notifuse.app.veridian.site` pendant la bascule
- Smoke test l'envoi d'un email via Notifuse après bascule
- Vérifier que tes apps consommatrices (qui que ce soit qui envoie via Notifuse) ne sont
  pas impactées
- Reporter tout problème observé dans ce fichier section "Findings"

**Phase B — CI security (tu exécutes, agent infra fournit le template)**

Une fois la bascule infra validée (Phase A complète + 24h propre) :

1. Récupérer les templates dans `runbooks/templates/ci/` (fournis par agent infra)
2. Adapter à Notifuse :
   - `.github/workflows/security-cve.yml` → build l'image Notifuse + Trivy scan
   - `.github/dependabot.yml` → npm + docker pour `infra/services/notifuse/`
   - `renovate.json` → auto-merge patches Trivy-clean
3. PR avec ces 3 fichiers
4. Vérifier CI verte sur main

**Phase C — Loop validation 7 jours**

À répéter quotidiennement les 7 jours suivants :

1. `obs check security` → 0 CRIT/HIGH sur image Notifuse deployed ?
2. `gh run list --workflow=security-cve.yml --limit 5` → toutes vertes ?
3. `gh pr list --label dependencies` → Dependabot a-t-il ouvert des PRs ?
4. Test push no-op → webhook Dokploy déclenche ?
5. Smoke endpoint Notifuse

## Findings (rempli par l'agent au fur et à mesure)

> Pendant et après la migration, tout ce qui surprend, casse ou marche bien à noter ici.
> Sert à enrichir [gitops-pattern.md](../gitops-pattern.md) écrit par l'agent infra.

| Date | Étape | Observation | Impact |
|---|---|---|---|

## Définition de done

- [ ] Notifuse en mode Git Dokploy (validé par agent infra)
- [ ] Workflow `security-cve.yml` actif, vert sur main
- [ ] Dependabot configuré (npm + docker)
- [ ] Renovate auto-merge sur patches Trivy-clean
- [ ] 7 jours sans incident, 0 CRIT/HIGH sur image Notifuse deployed
- [ ] Findings rapportés dans ce fichier
- [ ] Documentation à jour : `runbooks/services/notifuse/deploy.md` (optionnel)

## Règles non négociables

- **NE JAMAIS** modifier la stack Dokploy en mode Raw une fois en Git → tout passe par PR
- **NE JAMAIS** delete le volume DB Notifuse pendant la migration
- **TOUJOURS** snapshot AVANT toute action irréversible
- **Si l'envoi d'email casse** → restore Raw immédiatement, investigate
- **Lire `project_infra_pieges.md`** avant tout

## Status

Status: en attente go agent infra (chantier 1 du sprint)
