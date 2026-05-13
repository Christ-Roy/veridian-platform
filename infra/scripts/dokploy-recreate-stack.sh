#!/usr/bin/env bash
# Recreate une stack Dokploy avec un appName propre (au lieu du slug auto-généré).
# Forensique avant, création nouvelle stack, copie YAML/ENV/domains, bascule, delete ancienne.
#
# Usage :
#   ./dokploy-recreate-stack.sh <old-composeId> <new-appName> [<new-name>]
#
# Pré-requis :
# - La stack ne doit pas avoir de volume préfixé par le slug (sinon migration manuelle)
# - L'utilisateur a confirmé qu'un downtime ~30s est acceptable
# - Smoke endpoint disponible pour vérification (curl)
#
# Le script :
# 1. Snapshot forensique (compose JSON complet)
# 2. Create new compose avec appName custom
# 3. Update YAML + ENV + command + sourceType
# 4. Recreate les domains Dokploy
# 5. Stop ancien container
# 6. Deploy nouvelle stack
# 7. Wait container ready + smoke (si endpoint fourni en arg 4)
# 8. Si OK : delete ancienne. Si KO : rollback (redeploy ancienne, delete nouvelle).

set -euo pipefail

OLD_ID="${1:?old composeId required}"
NEW_APP_NAME="${2:?new appName required (e.g. linkedin-prod)}"
NEW_NAME="${3:-$NEW_APP_NAME}"
SMOKE_URL="${4:-}"

DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
SSH_TARGET="${PROD_SSH:-prod-pub}"
API="http://localhost:3000/api/trpc"
TS=$(date +%Y%m%d-%H%M%S)
FORENSIC_DIR="$HOME/Bureau/veridian-platform-infra/runbooks/forensics/$TS-recreate-$NEW_APP_NAME"
mkdir -p "$FORENSIC_DIR"

echo "==> 1/8 Snapshot forensique"
OLD_JSON=$(ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' '$API/compose.one?input=%7B%22json%22%3A%7B%22composeId%22%3A%22$OLD_ID%22%7D%7D'")
echo "$OLD_JSON" > "$FORENSIC_DIR/old-compose.json"
OLD_APP_NAME=$(echo "$OLD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['appName'])")
OLD_NAME=$(echo "$OLD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['name'])")
ENV_ID=$(echo "$OLD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['environmentId'])")
COMPOSE_TYPE=$(echo "$OLD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json'].get('composeType','docker-compose'))")
SOURCE_TYPE=$(echo "$OLD_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json'].get('sourceType','raw'))")
echo "    old appName: $OLD_APP_NAME"
echo "    old name   : $OLD_NAME"
echo "    new appName: $NEW_APP_NAME"
echo "    new name   : $NEW_NAME"
echo "    envId      : $ENV_ID"
echo "    forensic   : $FORENSIC_DIR/"

echo "==> 2/8 Create new compose with custom appName"
export NEW_NAME ENV_ID COMPOSE_TYPE NEW_APP_NAME OLD_ID
python3 -c "
import json, os
print(json.dumps({'json': {
  'name': os.environ['NEW_NAME'],
  'description': f'Recreated from ' + os.environ['OLD_ID'] + ' to fix appName slug',
  'environmentId': os.environ['ENV_ID'],
  'composeType': os.environ['COMPOSE_TYPE'],
  'appName': os.environ['NEW_APP_NAME']
}}))
" > /tmp/dk-create.json
scp -q /tmp/dk-create.json "$SSH_TARGET":/tmp/dk-create.json
CREATE_RESP=$(ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-create.json $API/compose.create")
if echo "$CREATE_RESP" | grep -q '"error"'; then
  echo "    FAIL create: $(echo $CREATE_RESP | head -c 400)"
  exit 1
fi
NEW_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['composeId'])")
ACTUAL_APP_NAME=$(echo "$CREATE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['appName'])")
echo "    new composeId: $NEW_ID"
echo "    actual appName written: $ACTUAL_APP_NAME"
echo "$CREATE_RESP" > "$FORENSIC_DIR/new-compose-created.json"

if [ "$ACTUAL_APP_NAME" != "$NEW_APP_NAME" ]; then
  echo "    ⚠ Dokploy ignored custom appName, wrote: $ACTUAL_APP_NAME"
  echo "    aborting to investigate. Manual cleanup of new stack required."
  exit 1
fi

echo "==> 3/8 Update YAML + ENV + command + sourceType on new stack"
export NEW_ID
echo "$OLD_JSON" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
upd = {
    'composeId': os.environ['NEW_ID'],
    'composeFile': d.get('composeFile', ''),
    'env': d.get('env', ''),
    'sourceType': d.get('sourceType', 'raw'),
}
for k in ('composePath', 'branch', 'repository', 'owner', 'customGitUrl', 'customGitBranch', 'autoDeploy', 'triggerType', 'enableSubmodules', 'watchPaths'):
    if d.get(k) is not None:
        upd[k] = d[k]
print(json.dumps({'json': upd}))
" > /tmp/dk-upd.json
scp -q /tmp/dk-upd.json "$SSH_TARGET":/tmp/dk-upd.json
UPD_RESP=$(ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-upd.json $API/compose.update")
if echo "$UPD_RESP" | grep -q '"error"'; then
  echo "    FAIL update: $(echo $UPD_RESP | head -c 400)"
  exit 1
fi
echo "    OK"

echo "==> 4/8 Recreate domains on new stack"
DOMAINS=$(echo "$OLD_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)['result']['data']['json']
print(json.dumps(d.get('domains', [])))
")
echo "$DOMAINS" | python3 -c "
import json, sys, os
doms = json.load(sys.stdin)
new_id = os.environ['NEW_ID']
for dom in doms:
    payload = {
        'host': dom['host'],
        'port': dom.get('port', 3000),
        'https': dom.get('https', True),
        'path': dom.get('path', '/'),
        'serviceName': dom['serviceName'],
        'composeId': new_id,
        'certificateType': dom.get('certificateType', 'letsencrypt'),
        'domainType': dom.get('domainType', 'application'),
    }
    print(json.dumps({'json': payload}))
" > /tmp/dk-domains-batch.txt
DOM_COUNT=0
while IFS= read -r dom_payload; do
  [ -z "$dom_payload" ] && continue
  echo "$dom_payload" > /tmp/dk-dom.json
  scp -q /tmp/dk-dom.json "$SSH_TARGET":/tmp/dk-dom.json
  DOM_RESP=$(ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-dom.json $API/domain.create")
  if echo "$DOM_RESP" | grep -q '"error"'; then
    echo "    FAIL domain: $(echo $DOM_RESP | head -c 300)"
  else
    DOM_COUNT=$((DOM_COUNT + 1))
  fi
done < /tmp/dk-domains-batch.txt
echo "    $DOM_COUNT domains created on new stack"

echo "==> 5/8 Stop ancien container (libère labels Traefik)"
# Find all containers of old stack
OLD_CONTAINERS=$(ssh "$SSH_TARGET" "docker ps --format '{{.Names}}' | grep '^${OLD_APP_NAME}-'")
echo "    containers to stop : $OLD_CONTAINERS"
for c in $OLD_CONTAINERS; do
  ssh "$SSH_TARGET" "docker stop $c >/dev/null 2>&1 || true"
done

echo "==> 6/8 Deploy new stack"
ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"$NEW_ID\"}}' $API/compose.deploy > /dev/null"

echo "==> 7/8 Wait for new container + smoke"
SECONDS=0
until ssh "$SSH_TARGET" "docker ps --format '{{.Names}}' | grep -q '^${NEW_APP_NAME}-'"; do
  if [ $SECONDS -gt 120 ]; then
    echo "    TIMEOUT after 120s waiting for ${NEW_APP_NAME}-*"
    echo "    ROLLBACK : restarting old container"
    for c in $OLD_CONTAINERS; do
      ssh "$SSH_TARGET" "docker start $c >/dev/null 2>&1 || true"
    done
    exit 1
  fi
  sleep 3
done
ssh "$SSH_TARGET" "docker ps --format '{{.Names}}\t{{.Status}}' | grep '^${NEW_APP_NAME}-'"

if [ -n "$SMOKE_URL" ]; then
  echo "    smoke testing $SMOKE_URL ..."
  SECONDS=0
  until curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$SMOKE_URL" | grep -qE '^(200|301|302|307|401)$'; do
    if [ $SECONDS -gt 60 ]; then
      echo "    SMOKE FAIL : $SMOKE_URL not responding 2xx/3xx after 60s"
      echo "    ROLLBACK : stop new, restart old"
      ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"$NEW_ID\"}}' $API/compose.stop > /dev/null"
      for c in $OLD_CONTAINERS; do
        ssh "$SSH_TARGET" "docker start $c >/dev/null 2>&1 || true"
      done
      exit 1
    fi
    sleep 3
  done
  echo "    smoke OK ($(curl -sk -o /dev/null -w '%{http_code}' $SMOKE_URL))"
fi

echo "==> 8/8 Delete ancienne stack (volumes preserved)"
ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"$OLD_ID\",\"deleteVolumes\":false}}' $API/compose.delete > /dev/null"
echo "    OLD stack ${OLD_ID} (${OLD_APP_NAME}) deleted"

echo ""
echo "==> DONE : $OLD_APP_NAME → $NEW_APP_NAME"
echo "    new composeId: $NEW_ID"
echo "    forensic kept: $FORENSIC_DIR"
