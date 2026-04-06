#!/bin/bash
# ==============================================================================
# Backup des Secrets (.env) - Veridian
# ==============================================================================
# Sauvegarde le fichier .env (en clair)
# À exécuter quotidiennement AVANT le backup principal
#
# Usage: ./backup-secrets.sh
# ==============================================================================

set -e

# Configuration
BACKUP_DIR="./backups/secrets"
ENV_FILE="./.env"
RETENTION_DAYS=90  # Garder 3 mois de backups
LOG_FILE="./logs/backup-secrets.log"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# ==============================================================================
# Vérifications
# ==============================================================================

if [ ! -f "$ENV_FILE" ]; then
    log_error "Fichier .env introuvable: $ENV_FILE"
    exit 1
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# ==============================================================================
# Backup du .env
# ==============================================================================

log "Starting .env backup..."

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="$BACKUP_DIR/env-backup-$TIMESTAMP.env"

# Copier le fichier .env
cp "$ENV_FILE" "$OUTPUT_FILE"
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
log_success "Backup créé: $OUTPUT_FILE ($FILE_SIZE)"

# ==============================================================================
# Upload SFTP (optionnel)
# ==============================================================================

# Décommenter si configuré
# if [ -n "${BACKUP_SSH_HOST:-}" ]; then
#     log "Uploading to remote server..."
#     scp "$OUTPUT_FILE" "${BACKUP_SSH_USER}@${BACKUP_SSH_HOST}:${BACKUP_SSH_PATH}/secrets/" 2>>"$LOG_FILE"
#     log_success "Uploaded to remote server"
# fi

# ==============================================================================
# Nettoyage des anciens backups
# ==============================================================================

log "Cleaning up old backups (older than $RETENTION_DAYS days)..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "env-backup-*.env" -mtime +$RETENTION_DAYS -delete -print | wc -l)

if [ "$DELETED_COUNT" -gt 0 ]; then
    log_success "Deleted $DELETED_COUNT old backup(s)"
fi

# ==============================================================================
# Statistiques
# ==============================================================================

TOTAL_BACKUPS=$(ls -1 "$BACKUP_DIR"/env-backup-*.env 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

log "========================================"
log_success "BACKUP COMPLETED"
log "Total backups: $TOTAL_BACKUPS"
log "Total size: $TOTAL_SIZE"
log "========================================"

exit 0
