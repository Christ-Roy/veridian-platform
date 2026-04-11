#!/usr/bin/env bash
# ============================================================================
# sync-to-dev.sh — Watcher rsync local -> dev-server (analytics)
# ============================================================================
# Synchronise le code analytics local vers ~/analytics-src sur dev-pub
# a chaque changement de fichier. Le container analytics-dev tourne Next.js
# en dev mode avec polling → HMR auto.
#
# Prerequis : inotify-tools, rsync, ssh dev-pub fonctionnel
# Port cible : http://100.92.215.42:3100
#
# Usage :
#   ./scripts/sync-to-dev.sh            # watch + sync en continu
#   ./scripts/sync-to-dev.sh --once     # un seul rsync full puis quitte
# ============================================================================

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="dev-pub:/home/ubuntu/analytics-src/"

RSYNC_OPTS=(
  -az
  --delete
  --exclude 'node_modules'
  --exclude '.next'
  --exclude '.pnpm-store'
  --exclude '.git'
  --exclude '.env'
  --exclude '.env.local'
  --exclude 'coverage'
  --exclude 'dist'
  --exclude '.turbo'
  --exclude '*.log'
  # Dossiers qui ne doivent pas provoquer un rebuild Next côté dev-server
  --exclude 'tests/'
  --exclude 'docs/'
  --exclude 'playwright-report/'
  --exclude 'test-results/'
  --exclude '.playwright/'
  --exclude 'vitest.config.ts'
  --exclude 'playwright.config.ts'
)

do_sync() {
  rsync "${RSYNC_OPTS[@]}" "$SRC/" "$DST" 2>&1 | grep -v '^$' || true
}

echo "[sync] src=$SRC"
echo "[sync] dst=$DST"
echo "[sync] initial full sync..."
do_sync
echo "[sync] done."

if [[ "${1:-}" == "--once" ]]; then
  exit 0
fi

if ! command -v inotifywait >/dev/null 2>&1; then
  echo "[sync] ERROR: inotifywait manquant (apt install inotify-tools)" >&2
  exit 1
fi

echo "[sync] watching for changes (Ctrl+C to stop)..."
# Debounce : batch les events dans une fenetre de 300ms pour eviter 50 rsync
# quand Next touche plein de fichiers d'un coup.
inotifywait -mrq \
  -e modify,create,delete,move \
  --exclude '(node_modules|\.next|\.git|coverage|dist|\.turbo)' \
  "$SRC" | while read -r _; do
  # Drain les events en attente (debounce)
  while read -r -t 0.3 _; do :; done
  printf '[sync] %s  change -> rsync... ' "$(date +%H:%M:%S)"
  do_sync
  echo "ok"
done
