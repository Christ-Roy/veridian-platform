# Notifuse — stack Dokploy (mode GitOps)

> Migration GitOps : 2026-05-13 (sprint SPRINT-GITOPS-VERIDIAN.md, **pilot Étape 0**).
> Avant : provider Raw, compose collé dans Dokploy UI.
> Maintenant : provider Git, ce fichier est la source de vérité.

## Identité

| Champ | Valeur |
|---|---|
| Stack Dokploy | `compose-transmit-open-source-microchip-k9lvap` (composeId `WN0jglLj5bDIrXUFZHNmw`) |
| Container app | `compose-transmit-open-source-microchip-k9lvap-notifuse-prod-1` |
| Container DB | `compose-transmit-open-source-microchip-k9lvap-notifuse-prod-db-1` |
| Image app | `ghcr.io/christ-roy/notifuse-veridian:saas-v1.0.3` (fork Veridian) |
| Image DB | `postgres:17-alpine` |
| Domaine prod | `notifuse.app.veridian.site` |
| Healthcheck | `GET /healthz` (wget interval 10s, timeout 5s, 3 retries, start 10s) |
| DB | `notifuse-prod-db:5432/notifuse_system` (Postgres dédié interne) |
| Volumes externes | `infra_notifuse-data` (app /app/data), `infra_notifuse-db-data` (DB) |
| Networks | `dokploy-network` (external), `notifuse-internal` (bridge créé par le compose) |

## Comment déployer

1. **Bump image (release fork Notifuse)** : modifier `NOTIFUSE_IMAGE_TAG`
   (et idéalement `NOTIFUSE_IMAGE_DIGEST`) dans Dokploy UI → Stack notifuse-prod → Environment → Redeploy.
   La release fork suit la convention `saas-vX.Y.Z` (cf `RELEASE.md` racine, branche `feat/notifuse-saas-versioning`).
2. **Bump compose** (rare) : modifier `infra/services/notifuse/docker-compose.yml`
   → push sur `main` → webhook Dokploy → redeploy zero-downtime.
3. **Rollback** : `git revert -m 1 <merge-sha>` + push → Dokploy redéploie l'état précédent.

⚠️ Pas de manipulation Dokploy UI Raw. Tout passe par Git.

## Secrets

Tous les secrets sont configurés dans **Dokploy UI → Stack notifuse-prod → Environment**.
Le fichier `.env.example` liste les noms attendus.

⚠️ L'env Dokploy de cette stack est l'env partagé `KmNwdMqLi9ye4xZ57WsnC`
(SaaS Veridian / production) — il contient les ENV de toutes les autres apps aussi.
Ne JAMAIS commit de secret dans ce repo.

## Pinning d'image

Format : `ghcr.io/christ-roy/notifuse-veridian:${NOTIFUSE_IMAGE_TAG}@sha256:${NOTIFUSE_IMAGE_DIGEST}`

Le tag par défaut est `saas-v1.0.3` (override possible via ENV Dokploy).
Le digest SHA pinne l'image immutable (sprint GitOps : pas de tag flottant pur).

Pour bumper l'image après un nouveau build du fork :
```bash
ssh prod-pub 'docker inspect ghcr.io/christ-roy/notifuse-veridian:saas-v1.0.4 --format "{{index .RepoDigests 0}}"'
# Puis Dokploy ENV → NOTIFUSE_IMAGE_TAG=saas-v1.0.4 + NOTIFUSE_IMAGE_DIGEST=<new>
```

## Blue-green (préparation)

Le compose supporte le pattern blue-green via `${DEPLOY_ENV}` :
- `DEPLOY_ENV=prod` (stack actuelle) → router `notifuse-prod-*`, host `notifuse.app.veridian.site`
- `DEPLOY_ENV=green` (sur stack `notifuse-green` parallèle, à créer le jour J) →
  router `notifuse-green-*`, host `notifuse.green.app.veridian.site`

Cf [06-blue-green-procedure.md](../../../../cc-saas/prompts/applicatif/06-blue-green-procedure.md).

## Piège Dokploy Domains à connaître (résolu 2026-05-13)

Dokploy a une notion de "Domains" séparée du compose Git (UI → Stack → Domains).
Tant qu'un Domain est configuré, **Dokploy injecte ses propres labels Traefik**
(`compose-<appName>-<uniqueConfigKey>-web`...) **en plus** de ceux du compose Git,
ce qui crée un **dual-router** sur le même host (`notifuse.app.veridian.site`).

Pour Notifuse : le Domain `maQQWxvRFHCH8NM5mezBx` (uniqueConfigKey=4) a été
**supprimé** via `POST /api/domain.delete` lors de la bascule GitOps. Les labels
Traefik viennent maintenant exclusivement du compose Git. Confirmer après chaque
deploy :

```bash
ssh prod-pub 'sudo docker inspect compose-transmit-open-source-microchip-k9lvap-notifuse-prod-1 --format "{{json .Config.Labels}}"' \
  | jq -r 'to_entries[] | select(.key|startswith("traefik")) | "\(.key) = \(.value)"'
# Attendu : 10 lignes commençant par notifuse-prod-* (zéro compose-transmit-...-4-*)
```

Si un jour un router `compose-transmit-...-4-*` réapparaît : c'est qu'un Domain
Dokploy a été recréé via l'UI. Le supprimer immédiatement.

## Forensique pré-migration (snapshot 2026-05-13)

Snapshot du compose live + container inspect AVANT bascule Raw→Git :
- `/tmp/notifuse-pre-gitops-20260513-1327/docker-compose.live.yml`
- `/tmp/notifuse-pre-gitops-20260513-1327/containers-inspect.json`
- `/tmp/notifuse-pre-gitops-20260513-1327/volumes.txt`
- `/tmp/notifuse-pre-gitops-20260513-1327/.env.live` (chmod 600, contient tous les secrets prod — **ne pas commit**)

À conserver tant que la stack tourne en mode Git sans incident (7 jours min).

## Patch Veridian (fork)

Le compose embarque la variable `INTERNAL_API_ENDPOINT=http://localhost:8081` qui n'existe pas dans Notifuse upstream. C'est un patch du fork `christ-roy/notifuse-veridian` (branche `veridian`, commit `57df7c42`) qui évite que le scheduler interne se self-appelle via l'URL publique (`https://notifuse.app.veridian.site`). Avant patch : ~480k requêtes inutiles/jour. Voir `todo/dette-technique/002`.
