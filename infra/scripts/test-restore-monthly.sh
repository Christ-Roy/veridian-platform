#!/bin/bash
# Test restore mensuel — rejoue restore-db.sh sur une DB random, alert Telegram si fail.
# Usage : cron utilisateur sur local KDE — 1er du mois 03:00
set -euo pipefail

REPO="/home/brunon5/Bureau/veridian-platform-infra"
LOG="/tmp/test-restore-monthly.log"
TELEGRAM_TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' ~/credentials/.all-creds.env | cut -d= -f2)"
TELEGRAM_CHAT="$(grep '^TELEGRAM_CHAT_ID=' ~/credentials/.all-creds.env | cut -d= -f2)"

alert() {
  [ -z "$TELEGRAM_TOKEN" ] && return
  [ -z "$TELEGRAM_CHAT" ] && return
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT}" \
    -d "text=$1" >/dev/null || true
}

# Pick a random DB to test (rotate small ones — prospection est trop gros pour mensuel)
APPS=(verger-shop veridian-core cms notifuse twenty supabase)
APP="${APPS[$((RANDOM % ${#APPS[@]}))]}"

echo "[$(date)] Testing restore: $APP" > "$LOG"

if "${REPO}/infra/scripts/restore-db.sh" "$APP" >> "$LOG" 2>&1; then
  echo "[$(date)] OK" >> "$LOG"
  alert "✅ Monthly restore test OK : $APP"
else
  echo "[$(date)] FAIL" >> "$LOG"
  alert "❌ Monthly restore test FAIL : $APP — voir /tmp/test-restore-monthly.log"
  exit 1
fi
