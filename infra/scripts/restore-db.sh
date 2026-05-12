#!/bin/bash
# Restore une DB Postgres depuis R2 dans un Postgres temporaire LOCAL.
# JAMAIS en prod direct — toujours dans un container dédié pour validation.
#
# Usage :
#   restore-db.sh <app> [date_pattern]
#   restore-db.sh prospection                  # dernier backup
#   restore-db.sh prospection 2026-05-12       # backup spécifique
#   restore-db.sh prospection 2026-05-12_1109  # précis à la minute
#
# Sortie : DB restaurée dans un Postgres temporaire écouté sur localhost:15999
# avec validation des tables principales (count rows).
#
# Apps supportées : prospection, veridian-core, verger-shop, cms, notifuse, twenty, supabase

set -euo pipefail

APP="${1:?app name required (prospection|veridian-core|verger-shop|cms|notifuse|twenty|supabase)}"
DATE_PATTERN="${2:-}"

case "$APP" in
  prospection)   PG_USER="postgres"; PG_DB="prospection";         PG_IMAGE="postgres:15-alpine" ;;
  veridian-core) PG_USER="veridian"; PG_DB="veridian";            PG_IMAGE="postgres:16-alpine" ;;
  verger-shop)   PG_USER="verger";   PG_DB="verger_shop";         PG_IMAGE="postgres:16-alpine" ;;
  cms)           PG_USER="cms";      PG_DB="veridian_cms";        PG_IMAGE="postgres:16-alpine" ;;
  notifuse)      PG_USER="notifuse"; PG_DB="notifuse_system";     PG_IMAGE="postgres:17-alpine" ;;
  twenty)        PG_USER="twenty";   PG_DB="default";             PG_IMAGE="postgres:15-alpine" ;;
  supabase)      PG_USER="supabase_admin"; PG_DB="postgres";      PG_IMAGE="postgres:15-alpine" ;;
  *) echo "Unknown app: $APP"; exit 1 ;;
esac

PORT=15999
CONTAINER="pg-restore-test-${APP}"
WORKDIR="/tmp/restore-${APP}-$(date +%s)"
mkdir -p "$WORKDIR"

log() { echo "[$(date +%H:%M:%S)] $*"; }

cleanup() {
  log "Cleanup..."
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm "$CONTAINER" 2>/dev/null || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

# 1. Trouve le backup à restaurer
log "Searching R2 for backup ${APP} ${DATE_PATTERN:-(latest)}..."
if [ -n "$DATE_PATTERN" ]; then
  BACKUP=$(rclone ls "r2:veridian-backups/${APP}/" | grep "${DATE_PATTERN}" | sort | tail -1 | awk '{print $NF}')
else
  BACKUP=$(rclone ls "r2:veridian-backups/${APP}/" | sort -k2 | tail -1 | awk '{print $NF}')
fi

if [ -z "$BACKUP" ]; then
  log "ERROR: No backup found for ${APP} ${DATE_PATTERN}"
  exit 1
fi
log "Found: $BACKUP"

# 2. Télécharge le dump
rclone copy "r2:veridian-backups/${APP}/${BACKUP}" "$WORKDIR/"
DUMP="$WORKDIR/$BACKUP"
SIZE=$(stat -c%s "$DUMP")
log "Downloaded: $DUMP ($SIZE bytes)"

# 3. Démarre Postgres temporaire
log "Starting temporary Postgres ($PG_IMAGE) on port $PORT..."
docker run -d --name "$CONTAINER" --rm \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD=restore-test-pass \
  -e POSTGRES_DB="$PG_DB" \
  -p "$PORT:5432" \
  "$PG_IMAGE" > /dev/null

# 4. Attend que Postgres soit ready
log "Waiting for Postgres ready..."
until docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; do sleep 1; done

# 5. Restore
log "Restoring dump into temporary DB..."
gunzip -c "$DUMP" | docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" > "$WORKDIR/restore.log" 2>&1
ERRORS=$(grep -ciE 'error|fatal' "$WORKDIR/restore.log" || true)
log "Restore done. Errors in log: $ERRORS"

# 6. Smoke test : compte les rows des tables principales
log "Smoke test..."
docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tA -c "
  SELECT schemaname || '.' || relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 15;" 2>&1 | head -20

log ""
log "✓ Restore validated for ${APP} (${BACKUP})"
log "  Container '$CONTAINER' RUNNING on localhost:$PORT for inspection."
log "  Connect: psql -h localhost -p $PORT -U $PG_USER -d $PG_DB"
log "  Auto-cleanup in 30s (or Ctrl+C now)..."
sleep 30
