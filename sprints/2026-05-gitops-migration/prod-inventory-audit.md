# Audit prod — état au 2026-05-13 13:00

> Inventaire complet pour décider quoi garder / quoi dégager avant migration GitOps.
> Réalisé par agent infra Claude — Robert valide kill/keep ligne par ligne.

## Vue d'ensemble

```
RAM    : 3.6 Go / 11 Go utilisés (32%) — confortable
Swap   : 3.3 Go / 4 Go utilisés (82%) — SUSPECT, à investiguer
Disk   : 44 Go / 96 Go utilisés (46%) — confortable
Docker : 33 containers running, 1 exited, 14 composes Dokploy, 28 volumes, 16 networks, 28 images
```

## 33 containers running — classification

### 🟢 KEEP — services actifs sains (15 containers)

| Container | Image | Uptime | Usage |
|---|---|---|---|
| `dokploy-traefik` | `traefik:v3.6.17` | 38m (bumpé aujourd'hui) | Reverse proxy global |
| `dokploy.1.ntk69bco23j7d4q8x5ov6o40e` | `dokploy/dokploy:v0.29.4` | 20h | Dokploy core (Swarm) |
| `dokploy-postgres.1.*` | `postgres:16` | 10j | Dokploy DB (Swarm) |
| `dokploy-redis.1.*` | `redis:7` | 10j | Dokploy queues (Swarm) |
| `compose-back-up-online-pixel-nl2k9p-hub-prod-1` | `:hub-authjs-staging` | 43h | Hub Auth.js |
| `compose-connect-redundant-firewall-l5fmki-prospection-prod-1` | `prospection:staging` | 43h | Prospection |
| `compose-synthesize-virtual-transmitter-i9bv43-analytics-prod-1` | `analytics:latest` | 24h | Analytics |
| `compose-transmit-open-source-microchip-k9lvap-notifuse-prod-1` | `notifuse-veridian:saas-v1.0.3` | 24h | Notifuse app |
| `compose-transmit-open-source-microchip-k9lvap-notifuse-prod-db-1` | `postgres:17-alpine` | 25h | Notifuse DB |
| `compose-parse-optical-array-lvh5md-twenty-prod-server-1` | `twenty:v1.19.1` | 25h | Twenty server |
| `compose-parse-optical-array-lvh5md-twenty-prod-worker-1` | `twenty:v1.19.1` | 25h | Twenty worker |
| `compose-parse-optical-array-lvh5md-twenty-prod-redis-1` | `redis:7-alpine` | 25h | Twenty Redis |
| `compose-parse-optical-array-lvh5md-twenty-prod-db-1` | `postgres:15-alpine` | 25h | Twenty DB |
| `veridian-cms-prod` | `c1e4cdd...` | 19h | CMS prod |
| `veridian-cms-postgres-prod` | `postgres:16-alpine` | 10j | CMS DB |

### 🟢 KEEP — apps secondaires actives (5 containers)

| Container | Image | Uptime | Usage |
|---|---|---|---|
| `compose-quantify-solid-state-microchip-ft7svu-linkedin-prod-1` | `linkedin-dashboard:4b21800` | 21h | LinkedIn dashboard |
| `compose-index-bluetooth-driver-sm2qyo-asset-bank-prod-1` | `asset-bank:latest` | 43h | Asset bank |
| `verger-shop-ozjjew-verger-prod-shop-1` | `verger-faverolles-shop:latest` | 25h | Verger shop |
| `verger-shop-ozjjew-verger-prod-db-1` | `postgres:16-alpine` | 25h | Verger DB |
| `compose-parse-multi-byte-feed-ywg73b-veridian-core-db-1` | `postgres:16-alpine` | 4w | Core DB Veridian |

### 🟡 KEEP MAIS SUSPECT — CrowdSec orphelin de son compose Dokploy

| Container | Image | Uptime | Note |
|---|---|---|---|
| `code-crowdsec-1` | `crowdsecurity/crowdsec:v1.7.7` | 4j (healthy) | LAPI CrowdSec — **container actif mais compose Dokploy en `.disabled`/`.bak`/`.draft`** dans `/etc/dokploy/compose/compose-program-digital-application-vb1x5n/code/`. Dokploy ne manage plus cette stack. |

**Problème identifié** : `compose-program-digital-application-vb1x5n` a 7 fichiers `.bak`/`.disabled`/`.draft` mais aucun `docker-compose.yml` actif. Le container CrowdSec tourne en mode "libre" — pas piloté par Dokploy. Le bouncer (`code-crowdsec-traefik-bouncer-1`) crashed il y a 3h sans relance auto, confirme que cette stack est en limbo.

➡️ Mon scope d'agent infra : reconstruire le compose proprement dans `infra/services/crowdsec/` + provider Git, OU dégager si on passe au CrowdSec applicatif (cf P2.2 TODO infra). Décision Robert attendue (voir [cleanup-plan.md](cleanup-plan.md) Décision 4).

### 🟡 SUSPECT — Supabase complète (12 containers, ~3 Go RAM, ~7 Go images)

| Container | Image | Uptime | Note |
|---|---|---|---|
| `compose-parse-digital-alarm-974mhw-supabase-db-1` | `supabase/postgres:15.14.1.067` | 4j | DB Supabase (3.79 Go image) |
| `compose-parse-digital-alarm-974mhw-auth-1` | `supabase/gotrue:v2.184.0` | 4j | Auth GoTrue |
| `compose-parse-digital-alarm-974mhw-studio-1` | `supabase/studio:2025.12.29-sha-c223130` | 4j | Studio UI (1.03 Go) |
| `compose-parse-digital-alarm-974mhw-realtime-1` | `supabase/realtime:v2.69.1` | 4j | Realtime websockets |
| `compose-parse-digital-alarm-974mhw-meta-1` | `supabase/postgres-meta:v0.95.1` | 4j | Postgres metadata |
| `compose-parse-digital-alarm-974mhw-rest-1` | `postgrest/postgrest:v14.2` | 4j | PostgREST API |
| `compose-parse-digital-alarm-974mhw-kong-1` | `kong:2.8.5` | 4j | API gateway |
| `compose-parse-digital-alarm-974mhw-functions-1` | `supabase/edge-runtime:v1.69.28` | 4j | Edge functions |
| `compose-parse-digital-alarm-974mhw-imgproxy-1` | `darthsim/imgproxy:v3.8.0` | 4j | Image proxy |
| `compose-parse-digital-alarm-974mhw-storage-1` | `supabase/storage-api:v1.33.4` | 4j (**unhealthy**) | Storage S3 — déjà cassé |

**Analyse usage** :
- Hub migré vers Auth.js le 2026-05-08 → n'utilise plus Supabase Auth
- **0 requêtes vers `api.app.veridian.site` (Kong) en 5 min** — quasi-aucun trafic
- Mais Hub + Prospection ont encore 3-4 env vars Supabase chacun → peut-être tentatives de connexion au boot
- Logs Kong révèlent surtout du **bot scanning** (paths bizarres `/atomlib`, `/ccou`)
- Container `storage-1` est en **état unhealthy**
- Image `darthsim/imgproxy:v3.8.0` = 11 CVE CRITICAL (sortie 2022, jamais mise à jour)

**Coût** : ~3 Go RAM, ~7 Go images, surface d'attaque énorme (11 CRIT imgproxy + 7 CRIT studio + 6 CRIT realtime + 6 CRIT gotrue + 4 CRIT postgres + 4 CRIT edge-runtime = **38 CVE CRITICAL** sur la stack Supabase).

➡️ Mon scope d'agent infra. Décision Robert attendue (voir [cleanup-plan.md](cleanup-plan.md) Décision 1) : **kill** (recommandation forte) ou keep avec patching.

### 🔴 KILL — zombie crashé

| Container | Image | Statut | Note |
|---|---|---|---|
| `code-crowdsec-traefik-bouncer-1` | `fbonalair/traefik-crowdsec-bouncer:latest` | **Exited (2) 3h ago** | Ancien bouncer CrowdSec (avant migration plugin Traefik 2026-05-13). Compose Dokploy orphelin (cf ci-dessus). |

### 🔴 KILL — DB orpheline d'une stack supprimée

| Container | Image | Uptime | Note |
|---|---|---|---|
| `code-prospection-saas-db-1` | `postgres:15-alpine` | 4j | DB de la stack `xelXB17eNlesUlHqHJCtY` (prospection-saas) supprimée 2026-05-11 selon mémoire P0.0 — mais le container DB et son volume `code_prospection-saas-data` ont survécu. **Donnée potentiellement à archiver avant kill**. |

## 14 dossiers `/etc/dokploy/compose/*` — classification

| Dossier | Containers running | Statut |
|---|---|---|
| `compose-back-up-online-pixel-nl2k9p` | 1 (hub) | 🟢 actif |
| `compose-connect-redundant-firewall-l5fmki` | 1 (prospection) | 🟢 actif |
| `compose-index-bluetooth-driver-sm2qyo` | 1 (asset-bank) | 🟢 actif |
| `compose-parse-digital-alarm-974mhw` | 12 (Supabase) | 🟡 suspect (décider kill/keep) |
| `compose-parse-multi-byte-feed-ywg73b` | 1 (veridian-core-db) | 🟢 actif |
| `compose-parse-optical-array-lvh5md` | 4 (Twenty) | 🟢 actif |
| `compose-quantify-solid-state-microchip-ft7svu` | 1 (LinkedIn) | 🟢 actif |
| `compose-synthesize-virtual-transmitter-i9bv43` | 1 (Analytics) | 🟢 actif |
| `compose-transmit-open-source-microchip-k9lvap` | 2 (Notifuse) | 🟢 actif |
| `verger-shop-ozjjew` | 2 (verger) | 🟢 actif |
| `compose-copy-mobile-card-hy9a9f` | **0** | 🔴 zombie Dokploy |
| `compose-generate-bluetooth-alarm-rtemgt` | **0** | 🔴 zombie Dokploy |
| `compose-input-back-end-application-t364gq` | **0** | 🔴 zombie Dokploy |
| `compose-program-digital-application-vb1x5n` | **0** (CrowdSec libre tourne hors compose) | 🟡 limbo |

## 28 volumes — classification

### 🟢 KEEP — utilisés par containers actifs (10 volumes)

| Volume | Container utilisateur |
|---|---|
| `compose-parse-multi-byte-feed-ywg73b_veridian-core-db-data` | veridian-core-db |
| `veridian-cms-prod_cms-media-prod` | veridian-cms-prod |
| `veridian-cms-prod_cms-pgdata-prod` | veridian-cms-postgres-prod |
| `dokploy` | dokploy core |
| `dokploy-postgres` | dokploy-postgres |
| `dokploy-redis` | dokploy-redis |
| `verger-shop-ozjjew_postgres_data` | verger DB |
| `veridian-trivy-cache` | Trivy (notre cache CVE) |
| (volumes des composes actifs — listés implicitement) | |

### 🔴 ORPHELINS — pas de container associé (18 volumes, ~1.6 Go total)

| Volume | Taille | Origine probable |
|---|---|---|
| `00-global-saas_db-config` | 112K | Ancienne stack saas globale |
| `00-global-saas_twenty-db-data` | 104M | Vieille Twenty (avant Dokploy ?) |
| `00-global-saas_twenty-redis-data` | 54M | Vieille Twenty |
| `00-global-saas_twenty-storage` | 8K | Vieille Twenty |
| `infra_crowdsec-config` | 5M | Ancien CrowdSec via `infra/docker-compose.yml` direct |
| `infra_crowdsec-db` | 98M | Idem |
| `infra_db-config` | 128K | Idem |
| `infra_mailpit-data` | 100K | Mailpit jamais utilisé en prod ? |
| `infra_notifuse-data` | 8K | Idem |
| `infra_notifuse-db-data` | **666M** | Idem — **plus gros orphelin** |
| `infra_supabase-db-data` | 70M | Idem |
| `infra_supabase-storage-data` | 12K | Idem |
| `infra_twenty-db-data` | 247M | Idem |
| `infra_twenty-redis-data` | 23M | Idem |
| `infra_twenty-storage` | 8M | Idem |
| `twenty_postgres_data` | 66M | Encore plus vieux |
| `twenty_redis_data` | 48K | Idem |
| `twenty_twenty_storage` | 8K | Idem |
| `code_postgres_data` | (à mesurer) | Stack ProspectionSaaS supprimée |
| `code_prospection-saas-data` | (à mesurer) | Idem |

➡️ Risque : ces volumes contiennent potentiellement des **dumps de données historiques** (Notifuse DB 666M, Twenty DB 247M). **Ne pas dégager sans backup ou confirmation Robert que ces données sont déjà répliquées dans les volumes actifs.**

## 28 images Docker — classification

### 🔴 KILL — images mortes (jamais utilisées par container actif)

| Image | Taille | Raison |
|---|---|---|
| `traefik:v3.6.7` | 186MB | Remplacée par v3.6.17 aujourd'hui |
| `aquasec/trivy:latest` | 182MB | Doublon — on garde la `:0.59.1` pinnée |
| `fbonalair/traefik-crowdsec-bouncer:latest` | 42.6MB | Legacy bouncer remplacé par plugin Traefik |

➡️ ~410 Mo récupérables via `docker image prune`.

### 🟢 KEEP — utilisées par containers actifs (25 autres)

Inventaire complet voir output `docker images`.

## 16 networks — classification

| Network | Type | Statut |
|---|---|---|
| `bridge`, `host`, `none`, `docker_gwbridge`, `ingress` | base Docker | 🟢 toujours là, ne pas toucher |
| `dokploy-network` | overlay swarm | 🟢 backbone Dokploy/Traefik |
| `compose-*_default` (8 networks) | bridge | 🟢 1 par compose actif |
| `compose-parse-digital-alarm-974mhw_supabase-internal` | bridge | 🟡 Supabase — kill avec Supabase |
| `compose-parse-optical-array-lvh5md_twenty-internal` | bridge | 🟢 Twenty |
| `compose-transmit-open-source-microchip-k9lvap_notifuse-internal` | bridge | 🟢 Notifuse |
| `verger-shop-ozjjew_default` | bridge | 🟢 Verger |
| `veridian-cms-prod_default` | bridge | 🟢 CMS |
| `trivy_default` | bridge | 🟢 Trivy compose |

## Total estimé impact cleanup

| Ressource | Gains attendus |
|---|---|
| **RAM** | ~3 Go (si Supabase kill) + ~50 Mo (bouncer + DB orpheline) |
| **Disk** | ~1.6 Go (volumes orphelins) + ~7 Go (images Supabase si kill) + ~410 Mo (images mortes) = **~9 Go** |
| **Containers** | 33 → 21 (si Supabase kill) ou 33 → 30 (si Supabase keep mais bouncer + DB orpheline kill) |
| **Composes Dokploy** | 14 → 10 (zombies suppression) ou 9 (avec Supabase) |
| **Volumes** | 28 → 10 (orphelins suppression) |
| **CVE CRITICAL prod** | 50+ → 12 (si Supabase kill = -38 CRIT) |

## Décisions à valider par Robert avant cleanup execution (Phase 0b)

Voir [cleanup-plan.md](cleanup-plan.md) pour le plan détaillé avec ordre d'exécution
et procédures rollback. Robert doit valider :

1. **Supabase entière → kill ou keep ?** (gros impact RAM + CVE)
2. **Volumes `infra_*` et `00-global-saas_*` → kill direct ou backup d'abord ?**
3. **`code-prospection-saas-db-1` (DB orpheline) → kill avec backup ou kill brut ?**
4. **`compose-program-digital-application-vb1x5n` (CrowdSec limbo) → reconstruire compose proprement (dans `agents/crowdsec.md`) ou kill et passer au WAF applicatif ?**
5. **4 zombies composes Dokploy → kill via API Dokploy ou via UI ?**

Status: en attente review Robert.
