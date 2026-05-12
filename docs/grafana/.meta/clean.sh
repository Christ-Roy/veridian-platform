#!/usr/bin/env bash
# Nettoie les artefacts de rendu dans les .md mirrorés depuis grafana.com
# Idempotent : applique les sed sur tous les *.md du dossier grafana.com/.
#
# Artefacts visés :
# - "![Copy code to clipboard](...)" → supprimé
# - " Copy " résiduel après le icon                → supprimé
# - "Expand table" tout seul sur sa ligne          → supprimé
# - "There's supposed to be a video here..." Vimeo → ligne entière supprimée

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT/grafana.com"

count=0
while IFS= read -r -d '' f; do
  sed -i \
    -e 's/!\[Copy code to clipboard\]([^)]*)//g' \
    -e 's/[[:space:]]Copy[[:space:]]*$//' \
    -e '/^Expand table[[:space:]]*$/d' \
    -e '/There.s supposed to be a video here/d' \
    "$f"
  count=$((count+1))
done < <(find "$TARGET_DIR" -type f -name '*.md' -print0)

echo "Cleaned $count files."
