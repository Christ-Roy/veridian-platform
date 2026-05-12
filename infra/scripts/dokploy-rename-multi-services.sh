#!/usr/bin/env bash
# Renomme plusieurs services dans un compose Dokploy en un seul update + redeploy.
# Met aussi à jour les références cross-service dans le YAML (DATABASE_URL etc.)
# et les domains Dokploy attachés.
#
# Usage :
#   ./dokploy-rename-multi-services.sh <composeId> <old1>:<new1> [<old2>:<new2> ...]
#
# Exemple :
#   ./dokploy-rename-multi-services.sh soTgiIG7JMBtshQTbVExY \
#     postgres:verger-prod-db \
#     shop:verger-prod-shop

set -euo pipefail

COMPOSE_ID="${1:?composeId required}"
shift
RENAMES=("$@")

if [ ${#RENAMES[@]} -eq 0 ]; then
  echo "Usage: $0 <composeId> <old1>:<new1> [<old2>:<new2> ...]"
  exit 1
fi

DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
SSH_TARGET="${PROD_SSH:-prod-pub}"

echo "==> 1/5 Fetch current compose"
COMPOSE_JSON=$(ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' 'http://localhost:3000/api/trpc/compose.one?input=%7B%22json%22%3A%7B%22composeId%22%3A%22$COMPOSE_ID%22%7D%7D'")
APP_NAME=$(echo "$COMPOSE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['appName'])")
echo "    appName: $APP_NAME"

echo "==> 2/5 Rewrite YAML (replace service names + cross-refs)"
RENAMES_STR=$(IFS=','; echo "${RENAMES[*]}")
export RENAMES_STR
echo "$COMPOSE_JSON" | python3 -c "
import json, sys, os, re
d = json.load(sys.stdin)['result']['data']['json']
yml = d['composeFile']
renames = [r.split(':') for r in os.environ['RENAMES_STR'].split(',')]
# Sort by old name length DESC to avoid prefix collisions (e.g. postgres before pg)
renames.sort(key=lambda r: -len(r[0]))
for old, new in renames:
    # Replace service definition (line starts with 2 spaces + name + colon)
    yml = re.sub(rf'(^|\n)  {re.escape(old)}:', rf'\1  {new}:', yml)
    # Replace Traefik router/service refs in labels
    yml = yml.replace(f'routers.{old}-', f'routers.{new}-')
    yml = yml.replace(f'routers.{old}.', f'routers.{new}.')
    yml = yml.replace(f'services.{old}.', f'services.{new}.')
    # Replace cross-service refs (DATABASE_URL, depends_on, hostnames)
    yml = re.sub(rf'@{re.escape(old)}:', f'@{new}:', yml)
    yml = re.sub(rf'@{re.escape(old)}/', f'@{new}/', yml)
    yml = re.sub(rf'://{re.escape(old)}:', f'://{new}:', yml)
    yml = re.sub(rf'(\n    - ){re.escape(old)}\b', rf'\1{new}', yml)  # depends_on list
    yml = re.sub(rf'(\n      ){re.escape(old)}:(\s*\n        condition:)', rf'\1{new}:\2', yml)  # depends_on dict
    # Plain env value like DB_HOST: notifuse-postgres or REDIS_HOST: redis
    yml = re.sub(rf'(:[ ]*){re.escape(old)}([ ]*\n)', rf'\1{new}\2', yml)
    yml = re.sub(rf'(:[ ]*){re.escape(old)}(:\d+)', rf'\1{new}\2', yml)  # host:port pair without scheme
print(yml, end='')
" > /tmp/dk-new-yml.txt

echo "    diff preview :"
echo "$COMPOSE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['composeFile'])" > /tmp/dk-old-yml.txt
diff -u /tmp/dk-old-yml.txt /tmp/dk-new-yml.txt | head -30 || true

echo "==> 3/5 Push compose.update"
export COMPOSE_ID
python3 -c "
import json, os
with open('/tmp/dk-new-yml.txt') as f: yml = f.read()
print(json.dumps({'json': {'composeId': os.environ['COMPOSE_ID'], 'composeFile': yml}}))
" > /tmp/dk-update.json
scp -q /tmp/dk-update.json "$SSH_TARGET":/tmp/dk-update.json
UPD=$(ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-update.json http://localhost:3000/api/trpc/compose.update")
if echo "$UPD" | grep -q '"error"'; then
  echo "    FAIL: $(echo $UPD | head -c 300)"
  exit 1
fi
echo "    OK"

echo "==> 4/5 Update Dokploy domains for renamed services"
DOMAINS_JSON=$(echo "$COMPOSE_JSON" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
renames = dict(r.split(':') for r in os.environ['RENAMES_STR'].split(','))
matches = []
for dom in d.get('domains', []):
    sn = dom.get('serviceName')
    if sn in renames:
        matches.append((dom['domainId'], sn, renames[sn]))
print(json.dumps(matches))
")
for line in $(echo "$DOMAINS_JSON" | python3 -c "import json,sys; [print(f'{d[0]}|{d[1]}|{d[2]}') for d in json.load(sys.stdin)]"); do
  IFS='|' read -r did old_sn new_sn <<< "$line"
  export NEW_SN="$new_sn"
  ssh "$SSH_TARGET" "curl -s -H 'x-api-key: $DKEY' 'http://localhost:3000/api/trpc/domain.one?input=%7B%22json%22%3A%7B%22domainId%22%3A%22$did%22%7D%7D'" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)['result']['data']['json']
upd = {k: v for k, v in d.items() if k != 'createdAt'}
upd['serviceName'] = os.environ['NEW_SN']
print(json.dumps({'json': upd}))
" > /tmp/dk-dom.json
  scp -q /tmp/dk-dom.json "$SSH_TARGET":/tmp/dk-dom.json
  ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d @/tmp/dk-dom.json http://localhost:3000/api/trpc/domain.update > /dev/null"
  echo "    domain $did : serviceName $old_sn → $new_sn"
done

echo "==> 5/5 Stop old containers + redeploy"
for r in "${RENAMES[@]}"; do
  IFS=':' read -r old new <<< "$r"
  ssh "$SSH_TARGET" "docker rm -f ${APP_NAME}-${old}-1 2>/dev/null || true"
done
ssh "$SSH_TARGET" "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"$COMPOSE_ID\"}}' http://localhost:3000/api/trpc/compose.redeploy > /dev/null"

# Wait until ALL new services are up
NEW_FIRST=$(echo "${RENAMES[0]}" | cut -d: -f2)
echo "    waiting for ${APP_NAME}-${NEW_FIRST}-1..."
until ssh "$SSH_TARGET" "docker ps --format '{{.Names}}' | grep -q '^${APP_NAME}-${NEW_FIRST}-1$'"; do sleep 3; done
ssh "$SSH_TARGET" "docker ps --format '{{.Names}}\t{{.Status}}' | grep -- '${APP_NAME}-'"
echo "==> DONE"
