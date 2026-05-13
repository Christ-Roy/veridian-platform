#!/usr/bin/env bash
# Trivy scan de toutes les images prod + alerte Telegram si critical/high.
# Exécuté via cron Dokploy Schedule Jobs (nightly).
#
# Usage : ./trivy-scan-prod.sh
# Cron Dokploy : ssh prod-pub /opt/veridian/trivy-scan-prod.sh
# Cible Dokploy : Schedule Jobs > Add > nightly 03:00 UTC.
#
# Sortie :
# - Stdout : tableau récap des findings (Telegram-friendly)
# - Telegram : alerte si critical/high
# - Fichier : /var/log/veridian-trivy/<date>.json (archive)
set -euo pipefail

OUTPUT_DIR="/var/log/veridian-trivy"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUTPUT_DIR"

# Trivy en docker run (pas d'install host requise)
TRIVY="docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/trivy-cache:/root/.cache/trivy \
  aquasec/trivy:latest"

# Liste des images uniques actuellement deployed (un container par image suffit)
IMAGES=$(docker ps --format '{{.Image}}' | sort -u)

CRIT_TOTAL=0
HIGH_TOTAL=0
REPORT="/tmp/trivy-summary-$STAMP.txt"
echo "Trivy scan @ $(date -u +%FT%TZ)" >"$REPORT"
echo "================================" >>"$REPORT"

for img in $IMAGES; do
  echo "==> Scanning $img"
  json_out="$OUTPUT_DIR/$STAMP-$(echo "$img" | tr '/' '_' | tr ':' '_').json"

  # --severity CRITICAL,HIGH : on ne génère pas de bruit medium/low
  # --quiet : pas de progress bar
  # --ignore-unfixed : on skip les CVE sans patch (rien à faire)
  if $TRIVY image \
       --severity CRITICAL,HIGH \
       --format json \
       --quiet \
       --ignore-unfixed \
       --output "$json_out" \
       "$img" 2>/dev/null; then
    n_crit=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$json_out" 2>/dev/null || echo 0)
    n_high=$(jq '[.Results[].Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$json_out" 2>/dev/null || echo 0)
    CRIT_TOTAL=$((CRIT_TOTAL + n_crit))
    HIGH_TOTAL=$((HIGH_TOTAL + n_high))
    printf "  %-60s C:%3d H:%3d\n" "$img" "$n_crit" "$n_high" >>"$REPORT"
  else
    printf "  %-60s ERROR scan failed\n" "$img" >>"$REPORT"
  fi
done

echo "" >>"$REPORT"
echo "TOTAL critical=$CRIT_TOTAL high=$HIGH_TOTAL" >>"$REPORT"
cat "$REPORT"

# Telegram alert si critical/high
if [[ "$CRIT_TOTAL" -gt 0 || "$HIGH_TOTAL" -gt 10 ]]; then
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    MSG=$(printf "[Veridian Trivy] %s\nCRITICAL=%d HIGH=%d\nDetails: %s" \
      "$STAMP" "$CRIT_TOTAL" "$HIGH_TOTAL" "/var/log/veridian-trivy/$STAMP-*.json")
    curl -sf -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID" \
      -d "text=$MSG" >/dev/null || true
  fi
fi

# Cleanup vieux JSON > 30 jours
find "$OUTPUT_DIR" -name '*.json' -mtime +30 -delete 2>/dev/null || true
