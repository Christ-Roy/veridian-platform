#!/usr/bin/env bash
# Cleanup stacks Dokploy "zombies" — compose en .disabled-* sans .yml actif.
#
# Détection : utilise `obs check security` (check security_dokploy_zombies)
# qui scan /etc/dokploy/compose/*/code/. Process :
# 1. List les composeIds zombies
# 2. Pour chacun : print état + demander confirmation
# 3. Si validé : Dokploy compose.delete trpc API
#
# Usage :
#   ./dokploy-cleanup-zombies.sh             # interactif, ask par stack
#   ./dokploy-cleanup-zombies.sh --dry-run   # liste seulement
#   ./dokploy-cleanup-zombies.sh --force     # YOLO, delete sans demander (DANGEREUX)
#
# Pré-requis : DOKPLOY_API_KEY dans ~/credentials/.all-creds.env, prod-pub SSH.
set -euo pipefail

MODE="${1:-interactive}"

CREDS_FILE="$HOME/credentials/.all-creds.env"
DKEY=$(grep '^DOKPLOY_API_KEY=' "$CREDS_FILE" | cut -d= -f2)
if [[ -z "$DKEY" ]]; then
  echo "ERROR: DOKPLOY_API_KEY non trouvée dans $CREDS_FILE" >&2
  exit 1
fi

SSH_TARGET="${PROD_SSH:-prod-pub}"
API="http://localhost:3000/api/trpc"

# --- 1. Lister les composes zombies via SSH ---
echo "==> Scan /etc/dokploy/compose/ pour composes zombies..."
ZOMBIES_RAW=$(ssh "$SSH_TARGET" \
  "sudo ls -d /etc/dokploy/compose/*/code/docker-compose.yml.disabled-* 2>/dev/null" \
  | sort -u || true)

if [[ -z "$ZOMBIES_RAW" ]]; then
  echo "==> Aucun compose zombie. OK"
  exit 0
fi

# Extract uniques compose IDs (5e segment du path)
declare -A SEEN
COMPOSE_IDS=()
while IFS= read -r path; do
  cid=$(echo "$path" | cut -d/ -f5)
  if [[ -z "${SEEN[$cid]:-}" ]]; then
    SEEN[$cid]=1
    COMPOSE_IDS+=("$cid")
  fi
done <<<"$ZOMBIES_RAW"

echo "==> ${#COMPOSE_IDS[@]} compose IDs zombies :"
for cid in "${COMPOSE_IDS[@]}"; do
  echo "    - $cid"
done

if [[ "$MODE" == "--dry-run" ]]; then
  echo "==> --dry-run terminé. Aucune action."
  exit 0
fi

# --- 2. Pour chaque, vérifier état Dokploy + delete si validé ---
for cid in "${COMPOSE_IDS[@]}"; do
  echo
  echo "==> Stack : $cid"

  COMPOSE_INFO=$(ssh "$SSH_TARGET" \
    "curl -s -H 'x-api-key: $DKEY' \
     '$API/compose.one?input=%7B%22json%22%3A%7B%22composeId%22%3A%22$cid%22%7D%7D'" \
    || echo '{"error":"not_found"}')

  APP_NAME=$(echo "$COMPOSE_INFO" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)['result']['data']['json']
    print(d.get('appName', '?'))
except Exception:
    print('?')
" 2>/dev/null || echo "?")

  if [[ "$APP_NAME" == "?" ]]; then
    echo "    Pas trouvée côté API Dokploy (déjà supprimée DB-side ?)"
    echo "    -> cleanup filesystem orphelin via SSH :"
    echo "       ssh $SSH_TARGET 'sudo rm -rf /etc/dokploy/compose/$cid/'"
    if [[ "$MODE" == "--force" ]]; then
      ssh "$SSH_TARGET" "sudo rm -rf /etc/dokploy/compose/$cid/"
      echo "    OK Filesystem cleané (--force)"
    elif [[ "$MODE" == "interactive" ]]; then
      read -r -p "    Supprimer le dossier filesystem ? [y/N] " ans
      if [[ "${ans,,}" == "y" ]]; then
        ssh "$SSH_TARGET" "sudo rm -rf /etc/dokploy/compose/$cid/"
        echo "    OK Filesystem cleané"
      else
        echo "    Skip"
      fi
    fi
    continue
  fi

  echo "    appName: $APP_NAME"
  echo "    -> API delete : compose.delete composeId=$cid deleteVolumes=false"

  DO_DELETE=false
  if [[ "$MODE" == "--force" ]]; then
    DO_DELETE=true
  elif [[ "$MODE" == "interactive" ]]; then
    read -r -p "    Confirmer delete (deleteVolumes=false) ? [y/N] " ans
    [[ "${ans,,}" == "y" ]] && DO_DELETE=true
  fi

  if [[ "$DO_DELETE" == "true" ]]; then
    PAYLOAD=$(printf '{"json":{"composeId":"%s","deleteVolumes":false}}' "$cid")
    RESULT=$(ssh "$SSH_TARGET" \
      "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' \
       '$API/compose.delete' -d '$PAYLOAD'")
    if echo "$RESULT" | grep -q '"error"'; then
      echo "    ERROR Dokploy : $RESULT"
    else
      echo "    OK Stack supprimée via API"
      ssh "$SSH_TARGET" "sudo rm -rf /etc/dokploy/compose/$cid/" 2>/dev/null || true
    fi
  else
    echo "    Skip"
  fi
done

echo
echo "==> Cleanup terminé. Re-check :"
echo "    obs check security 2>&1 | grep -i zombie"
