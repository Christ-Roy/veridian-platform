#!/usr/bin/env bash
# Renomme une stack Dokploy de bout en bout :
#   1. Champ `name` Dokploy (visible UI)
#   2. Nom du service dans le compose YAML : <old>: → <new>:
#   3. Routers/services Traefik dans les labels : <old>-* → <new>-*
#   4. Domains Dokploy attachés (serviceName)
#   5. Stop ancien container + redeploy → recreate avec nouveau nom
#
# Tout via API Dokploy (compose.update + domain.update + compose.redeploy).
# Le préfixe interne `compose-xxx-yyy-` reste (slug Dokploy immutable).
#
# Usage :
#   ./dokploy-rename-stack.sh <composeId> <old-service-name> <new-service-name> [<new-dokploy-name>]

set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <composeId> <old-service-name> <new-service-name> [<new-dokploy-name>]"
  exit 1
fi

COMPOSE_ID="$1"
OLD_NAME="$2"
NEW_NAME="$3"
DOKPLOY_NAME="${4:-$NEW_NAME}"

DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
SSH_TARGET="${PROD_SSH:-prod-pub}"

api() {
  ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' $*"
}

echo "==> 1/5 Fetch current compose state"
COMPOSE_JSON=$(ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' 'http://localhost:3000/api/trpc/compose.one?input=%7B%22json%22%3A%7B%22composeId%22%3A%22$COMPOSE_ID%22%7D%7D'")
APP_NAME=$(echo "$COMPOSE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['appName'])")
echo "    appName: $APP_NAME"

echo "==> 2/5 Rewrite YAML : $OLD_NAME → $NEW_NAME"
export OLD_NAME NEW_NAME COMPOSE_ID DOKPLOY_NAME
echo "$COMPOSE_JSON" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
old, new = os.environ['OLD_NAME'], os.environ['NEW_NAME']
yml = d['composeFile']
new_yml = yml.replace(f'  {old}:', f'  {new}:')
new_yml = new_yml.replace(f'routers.{old}-', f'routers.{new}-')
new_yml = new_yml.replace(f'routers.{old}.', f'routers.{new}.')
new_yml = new_yml.replace(f'services.{old}.', f'services.{new}.')
print(new_yml, end='')
" > /tmp/dk-new-yml.txt

echo "==> 3/5 Push compose.update (name + composeFile)"
python3 -c "
import json, os
with open('/tmp/dk-new-yml.txt') as f:
    yml = f.read()
print(json.dumps({'json': {'composeId': os.environ['COMPOSE_ID'], 'name': os.environ['DOKPLOY_NAME'], 'composeFile': yml}}))
" > /tmp/dk-update.json
scp -q /tmp/dk-update.json "$SSH_TARGET":/tmp/dk-update.json
UPD=$(ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-update.json http://localhost:3000/api/trpc/compose.update")
if echo "$UPD" | grep -q '"error"'; then
  echo "    FAIL: $(echo $UPD | head -c 300)"
  exit 1
fi
echo "    OK"

echo "==> 4/5 Update Dokploy domains pointing to old serviceName"
DOMAINS=$(echo "$COMPOSE_JSON" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
old = os.environ['OLD_NAME']
for dom in d.get('domains', []):
    if dom.get('serviceName') == old:
        print(dom['domainId'])
")
for did in $DOMAINS; do
  ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' 'http://localhost:3000/api/trpc/domain.one?input=%7B%22json%22%3A%7B%22domainId%22%3A%22$did%22%7D%7D'" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
new = os.environ['NEW_NAME']
upd = {k: v for k, v in d.items() if k != 'createdAt'}
upd['serviceName'] = new
print(json.dumps({'json': upd}))
" > /tmp/dk-domain.json
  scp -q /tmp/dk-domain.json "$SSH_TARGET":/tmp/dk-domain.json
  ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-domain.json http://localhost:3000/api/trpc/domain.update > /dev/null"
  echo "    domain $did : serviceName → $NEW_NAME"
done

echo "==> 5/5 Stop old container + redeploy"
ssh "$SSH_TARGET" "docker rm -f ${APP_NAME}-${OLD_NAME}-1 2>/dev/null || true"
ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"$COMPOSE_ID\"}}' http://localhost:3000/api/trpc/compose.redeploy > /dev/null"

echo "    waiting for ${APP_NAME}-${NEW_NAME}-1..."
until ssh "$SSH_TARGET" "docker ps --format '{{.Names}}' | grep -q '^${APP_NAME}-${NEW_NAME}-1$'"; do sleep 3; done
ssh "$SSH_TARGET" "docker ps --format '{{.Names}}\t{{.Status}}' | grep -- '${APP_NAME}-${NEW_NAME}-1'"
echo "==> DONE"
