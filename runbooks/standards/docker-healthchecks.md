# Standard — Healthchecks Docker en prod Veridian

> Tout container exposé via Traefik ou critique pour le business doit avoir un
> `HEALTHCHECK`. Sinon Dokploy considère le container "running" tant que le
> process tourne, même si l'app est figée.

## Format obligatoire

### Pour une app Next.js / Node.js

```yaml
services:
  hub-prod:
    image: ghcr.io/christ-roy/veridian-dashboard:sha-XXX
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
```

L'endpoint `/api/health` doit :
- répondre `200` quand l'app est opérationnelle
- répondre `503` si la DB est suspecte (cf. blue-green règle 6)
- répondre rapidement (< 1s)

### Pour Postgres

```yaml
services:
  prospection-prod-db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

### Pour Redis

```yaml
services:
  twenty-prod-redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
```

## Containers prod actuellement sans healthcheck (audit 2026-05-11)

À ajouter au prochain redeploy :

| Container | Compose | Type | Priorité |
|---|---|---|---|
| `veridian-cms-prod` | cms-prod | App | 🔥 critique |
| `*-twenty-server-1` | twenty | App | 🔥 critique |
| `*-twenty-worker-1` | twenty | Worker | 🔥 critique |
| `*-prospection-authjs-1` | prospection-authjs | App | 🔥 critique |
| `code-prospection-saas-db-1` | (orphelin code/) | DB | 🔥 critique |
| `*-asset-bank-1` | asset-bank | App | ⚠️ |
| `*-linkedin-dashboard-1` | linkedin-dashboard | App | ⚠️ |
| `*-functions-1` (Supabase) | supabase | Edge Runtime | ⚠️ |
| `*-rest-1` (Supabase) | supabase | PostgREST | ⚠️ |
| `dokploy-postgres.1.*` | (Dokploy lui-même) | DB | À voir avec Dokploy |
| `dokploy-redis.1.*` | (Dokploy lui-même) | Redis | À voir avec Dokploy |
| `dokploy-traefik` | infra | Reverse proxy | À voir avec Dokploy |

## Outils de vérification

```bash
# Lister les containers sans healthcheck
ssh prod-pub "for c in \$(docker ps --format '{{.Names}}'); do
  hc=\$(docker inspect \$c --format '{{if .Config.Healthcheck}}OK{{else}}MISSING{{end}}')
  [ \"\$hc\" = \"MISSING\" ] && echo \$c
done"
```
