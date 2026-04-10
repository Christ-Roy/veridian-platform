# Infrastructure Veridian

> Docker Compose + Dokploy + OVH VPS.
> Voir le CLAUDE.md racine (`../CLAUDE.md`) pour la vision globale.

## Ce que c'est

L'infra qui fait tourner le SaaS : Traefik (reverse proxy), Supabase (auth+DB),
Twenty CRM, Notifuse, Hub, Prospection. Tout en Docker Compose.

## Fichiers

| Fichier | Role |
|---------|------|
| `docker-compose.yml` | Base commune (16 services) |
| `docker-compose.prod.yml` | Override prod (HTTPS Let's Encrypt, Stripe LIVE) |
| `docker-compose.dev.yml` | Override dev (HTTP, Mailpit) |
| `docker-compose.staging.yml` | Stack staging complete (dev server) |
| `docker-compose.prospection-prod.yml` | Prospection standalone prod |
| `docker-compose.prospection-dev.yml` | Prospection DB dev locale |
| `volumes/supabase/api/kong.yml` | Config Kong (API gateway, rate-limiting) |

## Services (prod)

| Service | Image | URL |
|---------|-------|-----|
| Traefik | v3.6.6 | (reverse proxy 80/443) |
| Hub | `ghcr.io/christ-roy/veridian-dashboard:latest` | app.veridian.site |
| Prospection | `ghcr.io/christ-roy/prospection:latest` | prospection.app.veridian.site |
| Supabase | self-hosted (12 containers) | api.app.veridian.site |
| Twenty | twentycrm/twenty:v1.16.7 | twenty.app.veridian.site |
| Notifuse | notifuse/notifuse:v27.0 | notifuse.app.veridian.site |
| veridian-core-db | postgres:16-alpine | (interne Docker, pas exposé) |

### veridian-core-db

Postgres 16 dédié Veridian, brique de base du **futur post-Supabase**. Toutes les
nouvelles apps (Analytics P1.2) et les nouvelles tables Hub (P1.4 + P1.5) vivent
dessus via Prisma. Supabase reste en parallèle **uniquement pour les tables legacy
déjà présentes**.

- Image : `postgres:16-alpine`
- User : `veridian`, DB : `veridian`, password via `${VERIDIAN_CORE_DB_PASSWORD}` (voir `~/credentials/.all-creds.env`)
- Volume : `veridian-core-db-data` (base) / `staging-veridian-core-db` (staging)
- Réseau : `global-saas-network` (base) / `supabase-internal` (staging)
- **Port non exposé à l'hôte** : accès uniquement via le réseau Docker interne
- Health check : `pg_isready -U veridian -d veridian` (interval 10s, retries 5)
- Schemas prévus :
  - `hub_app` → tables Hub Prisma (OAuth/2FA P1.4, membres workspace P1.5, ...)
  - `analytics` → tables Analytics (P1.2)

**Règle opposable** : toute nouvelle app ou feature écrit sur `veridian-core-db`.
Plus jamais sur Supabase Postgres, sauf pour les tables legacy déjà présentes.
Point à valider lors des reviews.

> **Prod override** : le service n'est PAS encore ajouté à `docker-compose.prod.yml`.
> Mini-tâche séparée à traiter avec validation explicite de Robert.

## Commandes

```bash
# Prod
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Logs
docker compose logs -f [service]

# DB access
PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -p 5435 -U postgres
```

## Env vars

Fichier `.env` centralise (JAMAIS commite). Voir `~/credentials/.all-creds.env`.

## Issue critique : Kong rate-limit

Voir `docs/KONG-RATELIMIT-FIX.md` — rate-limit par consumer au lieu de par IP client.
