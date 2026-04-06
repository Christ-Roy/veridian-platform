#!/bin/bash
# Quick CI status check — run from anywhere in the monorepo
# Usage: bash ci/status.sh

REPO="Christ-Roy/veridian-platform"

echo "=== CI Status — $(date +%H:%M:%S) ==="
echo ""

# Latest runs per branch
for branch in staging main; do
  RUN=$(gh run list -R $REPO --branch $branch --limit 1 --json databaseId,status,conclusion,name,headSha --jq '.[0]' 2>/dev/null)
  if [ -z "$RUN" ]; then continue; fi

  STATUS=$(echo "$RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get('conclusion') or d.get('status'); print(s)")
  NAME=$(echo "$RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name',''))")
  SHA=$(echo "$RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('headSha','')[:7])")
  ID=$(echo "$RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('databaseId',''))")

  ICON="?"
  case $STATUS in
    success) ICON="OK" ;;
    failure) ICON="FAIL" ;;
    in_progress) ICON="..." ;;
    queued) ICON="QUEUE" ;;
    cancelled) ICON="SKIP" ;;
  esac

  echo "[$ICON] $branch — $NAME ($SHA) — run $ID"
done

echo ""

# Prod health
PROD=$(curl -sf https://prospection.app.veridian.site/api/health 2>/dev/null)
if echo "$PROD" | grep -q healthy; then
  COUNT=$(echo "$PROD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('leadCount','?'))" 2>/dev/null)
  echo "[OK] Prod: healthy ($COUNT leads)"
else
  echo "[FAIL] Prod: unhealthy or unreachable"
fi

# Staging health
STAGING=$(curl -sf https://saas-prospection.staging.veridian.site/api/health 2>/dev/null)
if echo "$STAGING" | grep -q healthy; then
  echo "[OK] Staging: healthy"
else
  echo "[FAIL] Staging: unhealthy or unreachable"
fi

echo ""
echo "Runner: $(gh api /repos/$REPO/actions/runners --jq '.runners[0].status' 2>/dev/null || echo 'unknown')"
