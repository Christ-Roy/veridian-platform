#!/bin/bash
# Generic Postgres backup → R2 via rclone.
# Conçu pour tourner sur prod-pub (le VPS OVH) en tant que ubuntu via cron.
# Pattern repris de backup-cms-postgres.sh (validé prod 2026-04 → 05).
#
# Usage :
#   backup-postgres.sh <app-name> <container-name> <db-user> <db-name>
#
# Exemple :
#   backup-postgres.sh prospection code-prospection-saas-db-1 postgres prospection
#
# Variables d'env attendues (depuis /home/ubuntu/.backup-env) :
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_CHAT_ID
#
# Rétention : garde les 30 derniers backups par app sur R2.

set -euo pipefail

APP="${1:?app name required}"
CONTAINER="${2:?container name required}"
PG_USER="${3:?postgres user required}"
PG_DB="${4:?database name required}"

DATE="$(date +%Y-%m-%d_%H%M)"
DUMP_FILE="/tmp/${APP}_${DATE}.sql.gz"
TELEGRAM_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID:-}"

log() { echo "[$(date +%Y-%m-%dT%H:%M:%S)] [$APP] $*"; }

alert_telegram() {
  if [[ -n "${TELEGRAM_TOKEN}" && -n "${TELEGRAM_CHAT}" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT}" \
      -d "text=$1" >/dev/null || true
  fi
}

trap 'alert_telegram "❌ Backup ${APP} FAIL on prod ($(hostname))"; rm -f "${DUMP_FILE}"; exit 1' ERR

log "=== Backup start ==="

# Dump
docker exec "${CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DB}" --no-owner --no-acl \
  | gzip > "${DUMP_FILE}"

SIZE=$(stat -c%s "${DUMP_FILE}")
log "Dump created: ${DUMP_FILE} (${SIZE} bytes)"

if [[ "${SIZE}" -lt 1024 ]]; then
  log "ERROR: Dump too small (${SIZE} bytes), abort"
  alert_telegram "❌ Backup ${APP} dump suspiciously small: ${SIZE}b"
  exit 1
fi

# Upload R2
rclone copy "${DUMP_FILE}" "r2:veridian-backups/${APP}/" --quiet
log "Uploaded to r2:veridian-backups/${APP}/${APP}_${DATE}.sql.gz"

# Rotation : 30 backups max
TO_DELETE=$(rclone ls "r2:veridian-backups/${APP}/" | sort -k2 | head -n -30 | awk '{print $NF}')
if [[ -n "${TO_DELETE}" ]]; then
  echo "${TO_DELETE}" | while read -r f; do
    [ -z "$f" ] && continue
    rclone delete "r2:veridian-backups/${APP}/${f}" --quiet || true
    log "Pruned old backup: ${f}"
  done
fi

rm -f "${DUMP_FILE}"
log "=== Backup done ==="
