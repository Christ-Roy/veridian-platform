#!/usr/bin/env bash
# Mirror la doc Grafana (markdown raw) + Traefik observability (HTML fallback)
# vers docs/grafana/ en respectant l'arborescence des URLs.
#
# Idempotent : relance OK, écrase les fichiers existants.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URLS_FILE="$ROOT/.meta/urls.txt"
LOG="$ROOT/.meta/mirror.log"

: > "$LOG"

ok=0
fail=0

while IFS= read -r url; do
  [[ -z "$url" || "$url" =~ ^# ]] && continue

  # Détecte le suffixe : grafana.com → .md raw, doc.traefik.io → HTML
  if [[ "$url" =~ ^https://grafana\.com/ ]]; then
    fetch_url="${url}.md"
    out_ext=".md"
  elif [[ "$url" =~ ^https://doc\.traefik\.io/ ]]; then
    fetch_url="${url}/"
    out_ext=".html"
  else
    echo "SKIP (host inconnu) : $url" | tee -a "$LOG"
    continue
  fi

  # Path local = on garde l'arbo après le domaine
  rel="${url#https://}"
  out="$ROOT/${rel}${out_ext}"
  mkdir -p "$(dirname "$out")"

  if curl -sfL --max-time 20 "$fetch_url" -o "$out"; then
    size=$(stat -c%s "$out")
    if [[ "$size" -lt 200 ]]; then
      echo "WARN petit fichier ($size B) : $fetch_url" | tee -a "$LOG"
      fail=$((fail+1))
    else
      echo "OK  $size B  $rel${out_ext}" | tee -a "$LOG"
      ok=$((ok+1))
    fi
  else
    echo "FAIL $fetch_url" | tee -a "$LOG"
    rm -f "$out"
    fail=$((fail+1))
  fi
done < "$URLS_FILE"

echo "----" | tee -a "$LOG"
echo "OK: $ok  FAIL/WARN: $fail" | tee -a "$LOG"
