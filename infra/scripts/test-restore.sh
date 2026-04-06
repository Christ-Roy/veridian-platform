#!/bin/bash
# ==============================================================================
# Script de Test de Restauration - Veridian Backups
# ==============================================================================
# Teste la restauration du dernier backup pour vérifier son intégrité
# À exécuter manuellement ou via cron (hebdomadaire recommandé)
#
# Usage: ./test-restore.sh [backup-file]
#        Si aucun fichier n'est spécifié, utilise le dernier backup
# ==============================================================================

set -e  # Exit on error

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
RESTORE_TEST_DIR="/tmp/veridian-restore-test"
WEBHOOK_URL="${BACKUP_WEBHOOK_URL:-}"  # URL de notification (optionnel)

# ==============================================================================
# Fonctions utilitaires
# ==============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

send_notification() {
    local status=$1
    local message=$2

    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"status\": \"$status\", \"message\": \"$message\", \"timestamp\": \"$(date -Iseconds)\"}" \
            2>/dev/null || log_warn "Failed to send notification"
    fi
}

cleanup() {
    log_info "Cleaning up test environment..."
    rm -rf "$RESTORE_TEST_DIR"
    docker rm -f restore-test-postgres 2>/dev/null || true
}

# Cleanup on exit
trap cleanup EXIT

# ==============================================================================
# Sélection du backup à tester
# ==============================================================================

if [ -n "$1" ]; then
    BACKUP_FILE="$1"
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
else
    # Trouver le dernier backup
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/veridian-prod-*.tar.gz 2>/dev/null | head -1)

    if [ -z "$BACKUP_FILE" ]; then
        log_error "No backup files found in $BACKUP_DIR"
        exit 1
    fi
fi

log_info "Testing backup: $BACKUP_FILE"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Backup size: $BACKUP_SIZE"

# ==============================================================================
# Étape 1 : Extraction du backup
# ==============================================================================

log_info "Step 1/5: Extracting backup archive..."
mkdir -p "$RESTORE_TEST_DIR"

if tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
    log_info "Archive integrity check: OK"
else
    log_error "Archive is corrupted!"
    send_notification "error" "Backup restore test FAILED: Archive corrupted ($BACKUP_FILE)"
    exit 1
fi

tar -xzf "$BACKUP_FILE" -C "$RESTORE_TEST_DIR" 2>&1 | head -20
log_info "Extraction completed"

# Vérifier la présence des dumps SQL
DUMPS_FOUND=0
[ -f "$RESTORE_TEST_DIR/backup/supabase-db/supabase_dump.sql" ] && ((DUMPS_FOUND++))
[ -f "$RESTORE_TEST_DIR/backup/twenty-db/twenty_dump.sql" ] && ((DUMPS_FOUND++))
[ -f "$RESTORE_TEST_DIR/backup/notifuse-db/notifuse_dump.sql" ] && ((DUMPS_FOUND++))

log_info "SQL dumps found: $DUMPS_FOUND/3"

if [ $DUMPS_FOUND -eq 0 ]; then
    log_error "No SQL dumps found in backup!"
    send_notification "error" "Backup restore test FAILED: No SQL dumps found"
    exit 1
fi

# ==============================================================================
# Étape 2 : Test restauration Supabase
# ==============================================================================

if [ -f "$RESTORE_TEST_DIR/backup/supabase-db/supabase_dump.sql" ]; then
    log_info "Step 2/5: Testing Supabase PostgreSQL restore..."

    DUMP_SIZE=$(wc -l < "$RESTORE_TEST_DIR/backup/supabase-db/supabase_dump.sql")
    log_info "Supabase dump: $DUMP_SIZE lines"

    # Démarrer un PostgreSQL temporaire
    docker run -d --name restore-test-postgres \
        -e POSTGRES_PASSWORD=test \
        postgres:15 >/dev/null

    # Attendre que PostgreSQL soit prêt
    sleep 5

    # Tester la restauration
    if docker exec -i restore-test-postgres psql -U postgres -d postgres \
        < "$RESTORE_TEST_DIR/backup/supabase-db/supabase_dump.sql" >/dev/null 2>&1; then
        log_info "✅ Supabase restore: SUCCESS"
    else
        log_error "❌ Supabase restore: FAILED"
        send_notification "error" "Backup restore test FAILED: Supabase dump corrupted"
        exit 1
    fi

    # Vérifier quelques tables
    TABLE_COUNT=$(docker exec restore-test-postgres psql -U postgres -d postgres -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
    log_info "Tables restored: $TABLE_COUNT"

    docker rm -f restore-test-postgres >/dev/null
else
    log_warn "Supabase dump not found, skipping"
fi

# ==============================================================================
# Étape 3 : Test restauration Twenty
# ==============================================================================

if [ -f "$RESTORE_TEST_DIR/backup/twenty-db/twenty_dump.sql" ]; then
    log_info "Step 3/5: Testing Twenty PostgreSQL restore..."

    DUMP_SIZE=$(wc -l < "$RESTORE_TEST_DIR/backup/twenty-db/twenty_dump.sql")
    log_info "Twenty dump: $DUMP_SIZE lines"

    docker run -d --name restore-test-postgres \
        -e POSTGRES_PASSWORD=test \
        -e POSTGRES_DB=twenty \
        postgres:15 >/dev/null

    sleep 5

    if docker exec -i restore-test-postgres psql -U postgres -d twenty \
        < "$RESTORE_TEST_DIR/backup/twenty-db/twenty_dump.sql" >/dev/null 2>&1; then
        log_info "✅ Twenty restore: SUCCESS"
    else
        log_error "❌ Twenty restore: FAILED"
        send_notification "error" "Backup restore test FAILED: Twenty dump corrupted"
        exit 1
    fi

    docker rm -f restore-test-postgres >/dev/null
else
    log_warn "Twenty dump not found, skipping"
fi

# ==============================================================================
# Étape 4 : Test restauration Notifuse
# ==============================================================================

if [ -f "$RESTORE_TEST_DIR/backup/notifuse-db/notifuse_dump.sql" ]; then
    log_info "Step 4/5: Testing Notifuse PostgreSQL restore..."

    DUMP_SIZE=$(wc -l < "$RESTORE_TEST_DIR/backup/notifuse-db/notifuse_dump.sql")
    log_info "Notifuse dump: $DUMP_SIZE lines"

    docker run -d --name restore-test-postgres \
        -e POSTGRES_PASSWORD=test \
        -e POSTGRES_DB=notifuse_system \
        postgres:17 >/dev/null

    sleep 5

    if docker exec -i restore-test-postgres psql -U postgres -d notifuse_system \
        < "$RESTORE_TEST_DIR/backup/notifuse-db/notifuse_dump.sql" >/dev/null 2>&1; then
        log_info "✅ Notifuse restore: SUCCESS"
    else
        log_error "❌ Notifuse restore: FAILED"
        send_notification "error" "Backup restore test FAILED: Notifuse dump corrupted"
        exit 1
    fi

    docker rm -f restore-test-postgres >/dev/null
else
    log_warn "Notifuse dump not found, skipping"
fi

# ==============================================================================
# Étape 5 : Vérification des volumes
# ==============================================================================

log_info "Step 5/5: Checking Docker volumes integrity..."

VOLUMES_FOUND=0
for vol in supabase-db supabase-storage twenty-db twenty-files twenty-redis notifuse-db notifuse-files crowdsec-db crowdsec-config letsencrypt; do
    if [ -d "$RESTORE_TEST_DIR/backup/$vol" ]; then
        SIZE=$(du -sh "$RESTORE_TEST_DIR/backup/$vol" | cut -f1)
        log_info "  - $vol: $SIZE"
        ((VOLUMES_FOUND++))
    fi
done

log_info "Volumes found: $VOLUMES_FOUND/10"

# ==============================================================================
# Rapport final
# ==============================================================================

echo ""
echo "=========================================="
echo -e "${GREEN}✅ BACKUP RESTORE TEST PASSED${NC}"
echo "=========================================="
echo "Backup file: $BACKUP_FILE"
echo "Backup size: $BACKUP_SIZE"
echo "SQL dumps tested: $DUMPS_FOUND/3"
echo "Volumes found: $VOLUMES_FOUND/10"
echo "Test date: $(date)"
echo "=========================================="

send_notification "success" "Backup restore test PASSED for $BACKUP_FILE (Size: $BACKUP_SIZE)"

exit 0
