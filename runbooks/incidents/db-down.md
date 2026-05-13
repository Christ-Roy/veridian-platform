# Incident — DB down

> Basé sur l'incident 2026-05-08 : `docker compose up` sans `-f` a recreated
> le service `prospection-saas-db`, container reset, sauvé par chance par le
> volume historique. Plus jamais ça.

## Symptômes

- App répond 500 / "database connection error"
- `obs check apps` → CRIT sur le container app, error rate explose
- `docker ps --filter name=db` → container `Up X seconds` (recreated) OU absent

## Triage en < 5 min

### Étape 1 — Identifier quelle DB

```bash
# Inventaire des DB Veridian prod
ssh prod-pub "docker ps --filter name=postgres --filter name=db --format '{{.Names}}\t{{.Status}}'"
```

DBs actuelles (au 2026-05-13) :
- `dokploy-postgres` (Dokploy interne, ne pas toucher)
- `supabase-db` (auth + tables legacy)
- `veridian-core-db` (Hub, Analytics — nouveau)
- `compose-*-prospection-saas-db-1` (Prospection)
- `compose-*-cms-db-1` (CMS)
- `compose-*-notifuse-db-1` (Notifuse)
- `compose-*-twenty-postgres-1` (Twenty)
- `compose-*-verger-faverolles-shop-db-1` (Verger)

### Étape 2 — Diagnostique

```bash
# La DB tourne ?
docker ps --filter name=$DB_CONTAINER

# Si oui, logs récents :
docker logs --tail 100 $DB_CONTAINER 2>&1 | tail -30

# Erreurs typiques :
# - "PANIC: could not write to file ... No space left on device" → disque plein
# - "FATAL: database files are incompatible with server" → version Postgres
# - "FATAL: role X does not exist" → user supprimé / mauvais .env
# - "could not connect to server: Connection refused" → container down, à restart
```

### Étape 3 — Restauration

#### A. Container Postgres crashe mais volume intact

```bash
docker restart $DB_CONTAINER
# Attendre 10s, retester
```

#### B. Volume Postgres perdu / corrompu

```bash
# Localiser le dernier backup R2 (cf infra/scripts/restore-db.sh)
infra/scripts/restore-db.sh <app> [date]

# Le script restore dans Postgres temp sur localhost:15999 pour validation.
# Si OK → swap volume :
docker stop $DB_CONTAINER
docker run --rm -v /var/lib/docker/volumes/<vol_name>/_data:/old \
  -v <backup_path>:/new alpine cp -a /new/. /old/
docker start $DB_CONTAINER
```

#### C. App utilise mauvaise URL (post-migration, post-rename)

```bash
# Vérifier l'env de l'app
docker exec $APP_CONTAINER printenv | grep -E "DATABASE_URL|POSTGRES_URL"

# Vérifier l'hostname réseau Docker
docker network inspect dokploy-network | grep -A2 db
```

### Étape 4 — Post-mortem

1. **Snapshot logs avant cleanup** : `docker logs $DB_CONTAINER > /tmp/db-incident-$(date +%s).log`
2. **Identifier root cause** : disque ? OOM ? mauvais compose ? action humaine ?
3. **Update `runbooks/incidents/` avec nouvelle entrée** si pattern récurrent
4. **Tests restore mensuel** : `infra/scripts/test-restore-monthly.sh` (déjà cron)

## Anti-récidive

- **JAMAIS** `docker compose up` direct via SSH sur le VPS — ça court-circuite
  Dokploy et peut recreate des services (cf incident 2026-05-08 prospection)
- Toujours passer par **Dokploy UI** ou API pour redeploy
- Backups R2 vérifiés mensuellement via `test-restore-monthly.sh` (cron Dokploy)
- RPO/RTO documentés dans `runbooks/disaster-recovery.md`

## Liens

- `runbooks/disaster-recovery.md` — scénarios A/B/C/D complets
- `infra/scripts/backup-postgres.sh` — script backup générique
- `infra/scripts/restore-db.sh` — script restore + validation
- TODO P0.1 (résolu 2026-05-12) — backups testés
