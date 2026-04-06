# Infrastructure - Docker & Services Distribués

> **Statut**: POC en développement - Version 1.0.0
> **Date**: Janvier 2026
> **Domaine**: `app.veridian.site`

---

## Vue Globale du Projet

Plateforme SaaS distribuant des logiciels open source interconnectés (Twenty CRM, Notifuse) via une infrastructure Docker unifiée.

**Documentation complète**: `../ARCHITECTURE.md` et `../FEATURES.md`

### Structure du Monorepo

```
app.veridian/
├── infra/                    ← CE RÉPERTOIRE
│   ├── docker-compose.yml        # Base commune (16 services)
│   ├── docker-compose.dev.yml    # Override dev (HTTP, Mailpit)
│   ├── docker-compose.prod.yml   # Override prod (HTTPS, Let's Encrypt)
│   ├── .env                      # Variables centralisées
│   └── volumes/supabase/         # Config Supabase (Kong, DB scripts)
│
├── Web-Dashboard/            ← Application orchestratrice (Next.js)
├── ARCHITECTURE.md           ← Schémas architecture détaillés
└── FEATURES.md               ← Specs features et roadmap
```

### Services & Versions

| Service | Version | Port | URL Production |
|---------|---------|------|----------------|
| **Traefik** | v3.6.6 | 80/443 | - |
| **Web Dashboard** | Next.js 14 | 3000 | https://app.veridian.site |
| **Twenty CRM** | v1.14.0 | 3000 | https://twenty.app.veridian.site |
| **Notifuse** | v22.2 | 8081 | https://notifuse.app.veridian.site |
| **Supabase Kong** | 2.8.5 | 8000 | https://api.app.veridian.site |

### Bases de Données (3 PostgreSQL isolées)

| DB | Container | Port Local | Version |
|----|-----------|------------|---------|
| Supabase | supabase-db | 127.0.0.1:5435 | 15.14.1 |
| Twenty | twenty-postgres | 127.0.0.1:5434 | 15-alpine |
| Notifuse | notifuse-postgres | 127.0.0.1:5433 | 17-alpine |

---

## Commandes Essentielles

### Démarrage

```bash
# Development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production (HTTPS Let's Encrypt)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Arrêt
docker compose down

# Logs
docker compose logs -f [service]
```

### Accès aux Bases de Données

```bash
# Supabase
PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -p 5435 -U postgres -d postgres

# Twenty
docker exec -it twenty-postgres psql -U twenty -d twenty

# Notifuse
docker exec -it notifuse-postgres psql -U postgres -d notifuse_system
```

### Debug

```bash
# Entrer dans un container
docker exec -it [container] sh

# Vérifier le réseau
docker network inspect global-saas-network

# Routes Traefik
curl -s http://localhost:8080/api/http/routers | jq '.[] | {name, rule, tls}'

# Tester SSL
curl -I https://api.app.veridian.site
```

### Backup/Restore

```bash
# Backup
docker exec supabase-db pg_dump -U postgres postgres > supabase-backup.sql
docker exec twenty-postgres pg_dump -U twenty twenty > twenty-backup.sql
docker exec notifuse-postgres pg_dump -U postgres notifuse_system > notifuse-backup.sql

# Restore
docker exec -i [container] psql -U [user] -d [db] < backup.sql
```

---

## Architecture Réseau

```
┌─────────────────────────────────────────────────────────────┐
│              Traefik v3.6.6 (80/443 HTTPS)                  │
│         Let's Encrypt DNS Challenge (Cloudflare)            │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ app.*    │ twenty.* │notifuse.*│  api.*   │ studio (local)  │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│Dashboard││ Twenty  ││Notifuse ││  Kong   ││ Studio  │
│  :3000  ││  :3000  ││  :8081  ││  :8000  ││  :3005  │
└────┬────┘└────┬────┘└────┬────┘└────┬────┘└─────────┘
     │          │          │          │
     └──────────┴──────────┴──────────┘
                     │
        global-saas-network (Bridge)
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│supabase │    │ twenty  │    │notifuse │
│   db    │    │postgres │    │postgres │
│  :5435  │    │  :5434  │    │  :5433  │
└─────────┘    └─────────┘    └─────────┘
```

**Communication interne** : Les services utilisent les noms Docker (ex: `kong:8000`, `supabase-db:5432`), jamais les URLs externes.

---

## Services Docker (16 containers)

### Supabase Stack (12 services)
- **supabase-db** : PostgreSQL 15 avec extensions
- **supabase-kong** : API Gateway
- **supabase-auth** : GoTrue v2.184.0 (Auth JWT/OAuth)
- **supabase-rest** : PostgREST (API REST auto-générée)
- **supabase-realtime** : WebSockets temps réel
- **supabase-storage** : Stockage fichiers S3-like
- **supabase-meta** : API métadonnées
- **supabase-studio** : Interface admin (localhost:3005)
- **supabase-analytics**, **supabase-vector**, **supabase-imgproxy**, **supabase-edge-functions**

### Twenty Stack (4 services) - Production-Ready SaaS
- **twenty-postgres** : PostgreSQL 15
- **twenty-redis** : Redis 7 (cache + queues)
- **twenty-server** : App + API GraphQL
- **twenty-worker** : Jobs asynchrones (incluant cleanup workspaces)

**Caractéristiques Twenty**:
- ✅ Paywall natif via Stripe (suspension automatique)
- ✅ Cleanup automatique des workspaces (7j warn → 14j soft → 21j hard delete)
- ✅ Multi-tenant schema-per-workspace (`workspace_{id}`)
- GraphQL mutations: `deleteCurrentWorkspace`

### Notifuse Stack (2 services) - Self-Hosted (Adaptations Requises)
- **notifuse-postgres** : PostgreSQL 17 (database-per-tenant)
- **notifuse-api** : Go API + React frontend

**Caractéristiques Notifuse**:
- ❌ Pas de paywall natif → Middleware Web-Dashboard requis
- ❌ Pas de cleanup automatique → Orchestration Web-Dashboard requise
- ✅ Multi-tenant database-per-workspace (`app_ws_{id}`)
- REST API: `POST /api/workspaces.delete`
- Auth admin: HMAC signature (`email:timestamp` + `NOTIFUSE_SECRET_KEY`)

📄 **Documentation cleanup**: `../doc/workspace-cleanup.md`

---

## Variables d'Environnement

Fichier `.env` centralisé. **NE JAMAIS COMMITER**.

### Variables Clés

```bash
# Domain
DOMAIN=app.veridian.site

# Secrets (générés, 32+ chars)
POSTGRES_PASSWORD=...
JWT_SECRET=...
TWENTY_APP_SECRET=...
NOTIFUSE_SECRET_KEY=...

# Supabase JWT Keys (générés avec JWT_SECRET)
ANON_KEY=eyJ...
SERVICE_ROLE_KEY=eyJ...

# SSL (Cloudflare DNS Challenge)
CLOUDFLARE_API_TOKEN=...
ACME_EMAIL=...
```

---

## Migrations Supabase

Les migrations sont dans `../Web-Dashboard/supabase/migrations/`.

**Application manuelle** (DB existante) :
```bash
psql -h 127.0.0.1 -p 5435 -U postgres -d postgres -f migration.sql
```

**Tables créées** : `profiles`, `customers`, `products`, `prices`, `subscriptions`, `tenants`, `provisioning_logs`, `usage_metrics`

---

## Troubleshooting

### SSL ne fonctionne pas
```bash
# Vérifier DNS
dig +short api.app.veridian.site

# Vérifier logs Traefik
docker compose logs traefik | grep -i "acme\|certificate"

# Restart Traefik
docker compose restart traefik
```

### Service inaccessible
```bash
# Vérifier healthcheck
docker compose ps

# Vérifier labels Traefik
docker inspect [container] --format '{{json .Config.Labels}}' | jq '.'
```

### DB connexion refused
```bash
# Vérifier que le container tourne
docker compose ps | grep postgres

# Vérifier les logs
docker compose logs [db-container]
```

---

## Sécurité

**Implémenté** :
- Ports DB sur 127.0.0.1 uniquement
- HTTPS Let's Encrypt (DNS Challenge)
- JWT tokens sécurisés
- Firewall (22, 80, 443)
- Rate limiting Auth

**TODO** :
- Fail2ban
- Backups automatiques
- Monitoring (Prometheus/Grafana)

---

## Ports Exposés

| Port | Service | Accès |
|------|---------|-------|
| 80 | Traefik HTTP | Public (redirect HTTPS) |
| 443 | Traefik HTTPS | Public |
| 8080 | Traefik Dashboard | localhost |
| 3005 | Supabase Studio | localhost |
| 5433-5435 | PostgreSQL (x3) | localhost |

---

**Version** : 1.0.0-POC | **Date** : Janvier 2026
**Docs complètes** : `../ARCHITECTURE.md` et `../FEATURES.md`
