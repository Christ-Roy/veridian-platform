# Standard — Tags images Docker en prod Veridian

> **Règle absolue** : aucune image en prod ne référence `:latest`.
>
> Toute stack prod doit pinner un tag **immutable** (sha git court ou semver).
> Le rollback se fait alors via `git revert` du compose Dokploy et redéploiement.

## Pourquoi pas `:latest` en prod

1. **Traçabilité** : impossible de savoir quelle version tourne réellement.
   `docker pull :latest` peut ramener une image différente selon le moment.
2. **Rollback impossible** : si la nouvelle `:latest` casse, on ne sait pas
   sur quoi rollback. Tags `:rollback` créés par la CI sont un patch, pas une
   solution.
3. **Reproductibilité staging → prod** : le staging peut tester une image
   différente de celle qui finit en prod si le `:latest` bouge entre les deux.
4. **Sécurité** : un attaquant qui pousse une image `:latest` sur ghcr peut
   prendre le contrôle. Tag immutable signé empêche ce vecteur.

## Convention de tag

### Format obligatoire en prod

```yaml
# docker-compose.yml côté Dokploy
services:
  hub-prod:
    image: ghcr.io/christ-roy/veridian-dashboard:sha-a3f9b2c
```

- **Préfixe** : `sha-` pour signaler que c'est un commit hash
- **Hash** : 7 caractères du commit git (= sortie `git rev-parse --short HEAD`)
- **Pas de tag mutable** (`latest`, `staging`, `main`) en prod

### Tags additionnels en plus du sha (CI peut les pousser pour le dev)

```yaml
tags: |
  ghcr.io/christ-roy/<app>:sha-${{ github.sha }}    # ← référencé en prod
  ghcr.io/christ-roy/<app>:branch-${{ github.ref_name }}   # ← pour dev/staging
  ghcr.io/christ-roy/<app>:latest                   # ← pour dev local
```

## Flow de déploiement prod

```
1. Push sur main
   ↓
2. CI build + tag sha-a3f9b2c + push ghcr
   ↓
3. CI met à jour le compose Dokploy via API :
   sed -i "s|image: ghcr.io/christ-roy/<app>:sha-.*|image: ghcr.io/christ-roy/<app>:sha-a3f9b2c|"
   ↓
4. CI déclenche redeploy Dokploy (compose.redeploy)
   ↓
5. Dokploy fait docker compose up -d (qui pull le nouveau sha)
   ↓
6. CI vérifie /api/health post-deploy
   ↓
7. Si fail → CI fait git revert du compose + redeploy (= rollback en 1 commit)
```

## Migration des composes existants

État au 2026-05-11 :

| Compose | Image actuelle | Action |
|---|---|---|
| hub-authjs | `:hub-authjs-staging` | À migrer vers `:sha-XXX` |
| prospection-authjs | `:latest` | À migrer vers `:sha-XXX` |
| analytics | `:latest` | À migrer vers `:sha-XXX` |
| asset-bank | `:latest` | À migrer vers `:sha-XXX` |
| cms-prod | `:latest` (local !) | À migrer vers ghcr + `:sha-XXX` |
| verger-shop | `:latest` | À migrer vers `:sha-XXX` |
| notifuse | `:saas-v1.0.0` | ✓ déjà conforme |
| linkedin-dashboard | `:4b21800` | ✓ déjà conforme |

## Exception tolérée : composants tiers

Pour les images tierces (postgres, redis, traefik, supabase, twenty), pinner
le tag stable explicite (ex `postgres:16-alpine`, `redis:7-alpine`,
`traefik:v3.6.7`). Pas besoin de pinner le digest sha256 — la version + alpine
suffit.

Le digest est utile pour `dokploy/dokploy` lui-même (déjà fait par défaut) :
`dokploy/dokploy:v0.28.8@sha256:b90ae17cdcf...`.

## Outils de vérification

```bash
# Détecter les :latest référencés en prod
ssh prod-pub "grep -rH ':latest$' /etc/dokploy/compose/*/code/docker-compose.yml | grep -v '#'"

# Détecter les images sans tag (= :latest implicite)
ssh prod-pub "docker ps --format '{{.Image}}' | grep -v ':'"
```
