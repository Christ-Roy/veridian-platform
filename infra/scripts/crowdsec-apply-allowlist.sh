#!/usr/bin/env bash
# Sync infra/crowdsec/whitelists.yaml → CrowdSec prod container.
#
# Mécanisme CrowdSec : la collection `crowdsecurity/whitelist-good-actors` doit
# être installée (déjà fait via COLLECTIONS env du compose). Le fichier
# `/etc/crowdsec/parsers/s02-enrich/whitelists.yaml` est lu au démarrage et à
# chaque SIGHUP — il définit IP/CIDR à toujours laisser passer (ne créera jamais
# de décision ban, captcha, etc.).
#
# Pourquoi pas `cscli decisions add` : ne supporte que types ban|captcha|throttle.
# Une "allowlist" via décisions n'existe pas — c'est ce parser qui fait le job.
#
# Usage : ./crowdsec-apply-allowlist.sh [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_FILE="$SCRIPT_DIR/../crowdsec/whitelists.yaml"
SSH_TARGET="${SSH_TARGET:-prod-pub}"
CONTAINER="${CONTAINER:-code-crowdsec-1}"
DEST="/etc/crowdsec/parsers/s02-enrich/whitelists.yaml"
DRY_RUN="${1:-}"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "ERROR: source file not found: $SOURCE_FILE" >&2
  exit 1
fi

echo "==> Source : $SOURCE_FILE"
echo "==> Cible  : $SSH_TARGET:$CONTAINER:$DEST"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "[dry-run] scp $SOURCE_FILE $SSH_TARGET:/tmp/whitelists.yaml"
  echo "[dry-run] ssh $SSH_TARGET sudo docker cp /tmp/whitelists.yaml $CONTAINER:$DEST"
  echo "[dry-run] ssh $SSH_TARGET sudo docker kill --signal=HUP $CONTAINER"
  exit 0
fi

scp "$SOURCE_FILE" "$SSH_TARGET:/tmp/whitelists.yaml"
ssh "$SSH_TARGET" "sudo docker cp /tmp/whitelists.yaml $CONTAINER:$DEST && sudo docker kill --signal=HUP $CONTAINER"

echo "==> Reload effectué. Vérification :"
ssh "$SSH_TARGET" "sudo docker exec $CONTAINER head -3 $DEST"
ssh "$SSH_TARGET" "sudo docker logs --since 10s $CONTAINER 2>&1 | grep -iE 'whitelist|reload|parser' | tail -5 || true"
