# Agent Twenty — fiche de mission sprint GitOps

## Scope

| Champ | Valeur |
|---|---|
| App | **Twenty** |
| Worktree | `~/Bureau/veridian-platform-twenty/` |
| Branche cible | `feat/twenty-gitops-migration` |
| Stack Dokploy slug | `compose-parse-optical-array-lvh5md` |
| Compose path cible repo | `infra/services/twenty/docker-compose.yml` |
| Domaine prod | `twenty.app.veridian.site` |
| Image app | `twentycrm/twenty:v1.19.1` |
| Image DB | `postgres:15-alpine` |
| Network Docker | `compose-parse-optical-array-lvh5md_twenty-internal` |

## Pièges / notes spécifiques

**Cas spécial** : 4 containers (server + worker + redis + db). Image upstream (pas notre code), donc CI ne build pas mais doit scanner l'image deployed. **Chain de migration upstream Twenty v1.16 → v2.2 doit être incrémentale** (cf mémoire `session_2026-05-08_twenty_v22_migration_chain.md`).

## Endpoints à smoke test

```bash
curl -sI https://twenty.app.veridian.site
# Adapter selon les endpoints de l'app (health, login, etc.)
```

## Pré-requis (faits par l'agent infra)

- ✅ Pilot Notifuse validé → runbook `gitops-pattern.md` dispo
- ✅ Templates CI security dans `runbooks/templates/ci/`
- ✅ Cleanup prod fait (zombies + volumes orphelins dégagés)

Si l'un de ces 3 points n'est pas validé : **attendre** (lire [README.md](../README.md) section
"Phases" pour suivre l'avancement de l'agent infra).

## Phase A — Migration GitOps

Suis [gitops-pattern.md](../gitops-pattern.md) en remplaçant `<APP>` par `twenty`.

Procédure résumée :

1. **Snapshot** : `tmp/dokploy-snapshot-twenty-$(date +%Y%m%d-%H%M)/` dans ton worktree
   ```bash
   mkdir -p tmp/dokploy-snapshot-twenty-$(date +%Y%m%d-%H%M)
   ssh prod-pub 'sudo cat /etc/dokploy/compose/compose-parse-optical-array-lvh5md/code/docker-compose.yml' \
     > tmp/dokploy-snapshot-twenty-*/docker-compose-live.yml
   ssh prod-pub 'docker inspect $(docker ps -q -f name=twenty-prod)' \
     > tmp/dokploy-snapshot-twenty-*/containers-inspect.json
   ssh prod-pub 'docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers 2>/dev/null' | \
     jq '.[] | select(.service | contains("twenty"))' \
     > tmp/dokploy-snapshot-twenty-*/traefik-routers.json
   ```

2. **Créer `infra/services/twenty/`** :
   - `docker-compose.yml` Git-clean avec images SHA-pinned
   - `.env.example` (sans secrets)
   - `README.md` : healthcheck, secrets location, rollback procédure

3. **Pinning SHA** :
   ```bash
   ssh prod-pub 'docker images --digests | grep -E "twentycrm/twenty"'
   ```

4. **PR sur main**, tests CI verts

5. **Bascule Dokploy UI** : provider Raw → Git (cf runbook)

6. **Test deploy + monitor**

7. **Test rollback** : `git revert` → push → vérifier que Dokploy redeploy l'état précédent

## Phase B — CI security

Copier depuis `runbooks/templates/ci/` :

- `.github/workflows/security-cve.yml`
- `.github/dependabot.yml`
- `renovate.json`

Adapter à twenty (nom image, paths).

## Phase C — Loop validation 7 jours

Quotidien :

1. `obs check security` → 0 CRIT/HIGH sur image twenty deployed
2. `gh run list --workflow=security-cve.yml --limit 5` → toutes vertes
3. PRs Dependabot ouvertes ? Trivy bloque les mauvaises ?
4. Push no-op → webhook Dokploy déclenche

## Findings (rempli par l'agent au fur et à mesure)

| Date | Étape | Observation | Impact |
|---|---|---|---|

## Définition de done

- [ ] Twenty en mode Git Dokploy avec auto-deploy webhook
- [ ] Compose `infra/services/twenty/docker-compose.yml` images SHA-pinned
- [ ] Workflow `security-cve.yml` actif, vert sur main
- [ ] Dependabot configuré (npm + docker)
- [ ] (Optionnel) Renovate auto-merge patches Trivy-clean
- [ ] 7 jours sans incident, 0 CRIT/HIGH sur image deployed
- [ ] Findings rapportés dans ce fichier

## Règles non négociables

- **NE JAMAIS** modifier la stack Dokploy en mode Raw une fois en Git → tout passe par PR
- **NE JAMAIS** delete les volumes Docker existants pendant la migration
- **TOUJOURS** snapshot AVANT toute action irréversible
- **TOUJOURS** tester sur dev (si l'app a un env dev) avant prod
- **Si twenty.app.veridian.site casse** → restore Raw immédiatement
- **Lire** `project_infra_pieges.md` (CrowdSec/Traefik traps) avant tout

## Status

Status: en attente pilot Notifuse + cleanup prod (chantiers 1-2 agent infra)
