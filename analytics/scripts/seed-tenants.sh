#!/usr/bin/env bash
# ============================================================================
# seed-tenants.sh — Bootstrap demo : cree les tenants Veridian + Tramtech
# ============================================================================
#
# Usage :
#   export ADMIN_API_KEY="xxx"
#   export ANALYTICS_BASE="http://100.92.215.42:3100"
#   ./scripts/seed-tenants.sh
#
# Idempotent : si un tenant existe deja, on skip.
# ============================================================================

set -euo pipefail

BASE="${ANALYTICS_BASE:-http://100.92.215.42:3100}"
KEY="${ADMIN_API_KEY:-}"

if [[ -z "$KEY" ]]; then
  echo "ADMIN_API_KEY manquant"
  exit 1
fi

echo "[seed] base=$BASE"

# --- helper : creer un tenant (idempotent) --------------------------------
create_tenant() {
  local slug="$1" name="$2" ownerEmail="$3"
  # Check existence
  local list
  list=$(curl -sS -H "x-admin-key: $KEY" "$BASE/api/admin/tenants")
  local existing
  existing=$(echo "$list" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d.get('tenants', []):
    if t['slug'] == '$slug':
        print(t['id']); break
")
  if [[ -n "$existing" ]]; then
    echo "[seed] tenant $slug existe deja: $existing"
    echo "$existing"
    return
  fi
  local resp
  resp=$(curl -sS -X POST "$BASE/api/admin/tenants" \
    -H "x-admin-key: $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"slug\":\"$slug\",\"name\":\"$name\",\"ownerEmail\":\"$ownerEmail\"}")
  local id
  id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenant']['id'])")
  echo "[seed] tenant $slug cree: $id"
  echo "$id"
}

# --- helper : creer un site pour un tenant ---------------------------------
create_site() {
  local tenantId="$1" domain="$2" name="$3"
  # Check
  local list
  list=$(curl -sS -H "x-admin-key: $KEY" "$BASE/api/admin/tenants/$tenantId/sites")
  local existing
  existing=$(echo "$list" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('sites', []):
    if s['domain'] == '$domain':
        print(s['id'], s['siteKey']); break
")
  if [[ -n "$existing" ]]; then
    echo "[seed] site $domain existe deja: $existing"
    echo "$existing"
    return
  fi
  local resp
  resp=$(curl -sS -X POST "$BASE/api/admin/tenants/$tenantId/sites" \
    -H "x-admin-key: $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"domain\":\"$domain\",\"name\":\"$name\"}")
  echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['site']; i = d['integration']
print(f\"[seed] site {s['domain']} cree: {s['id']}\", file=sys.stderr)
print(f\"[seed]   siteKey: {i['siteKey']}\", file=sys.stderr)
print(f\"[seed]   script:  {i['trackerScript']}\", file=sys.stderr)
print(s['id'], i['siteKey'])
"
}

# --- helper : attacher une GSC property --------------------------------
attach_gsc() {
  local siteId="$1" propertyUrl="$2"
  curl -sS -X PUT "$BASE/api/admin/sites/$siteId/gsc" \
    -H "x-admin-key: $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"propertyUrl\":\"$propertyUrl\"}" | python3 -m json.tool
}

# ============================================================================
# 1. Tenant Veridian (test) + site veridian.site
# ============================================================================
V_ID=$(create_tenant "veridian" "Veridian" "robert@veridian.site" | tail -1)
read V_SITE_ID V_SITE_KEY < <(create_site "$V_ID" "veridian.site" "Veridian — site principal")
echo "[seed] veridian site_id=$V_SITE_ID key=$V_SITE_KEY"
attach_gsc "$V_SITE_ID" "sc-domain:veridian.site"

# ============================================================================
# 2. Tenant Tramtech + site tramtech.fr
# ============================================================================
T_ID=$(create_tenant "tramtech" "Tramtech" "contact@tramtech.fr" | tail -1)
read T_SITE_ID T_SITE_KEY < <(create_site "$T_ID" "tramtech.fr" "Tramtech — site vitrine")
echo "[seed] tramtech site_id=$T_SITE_ID key=$T_SITE_KEY"
# attach_gsc "$T_SITE_ID" "sc-domain:tramtech.fr"   # decommenter quand on aura la GSC

echo ""
echo "==================== SNIPPETS A COLLER ===================="
echo ""
echo "# veridian.site"
echo "<script async src=\"$BASE/tracker.js\" data-site-key=\"$V_SITE_KEY\" data-veridian-track=\"auto\"></script>"
echo ""
echo "# tramtech.fr"
echo "<script async src=\"$BASE/tracker.js\" data-site-key=\"$T_SITE_KEY\" data-veridian-track=\"auto\"></script>"
echo ""
echo "==================== TESTER UN SYNC GSC ===================="
echo ""
echo "curl -X POST '$BASE/api/admin/gsc/sync' \\"
echo "  -H 'x-admin-key: \$ADMIN_API_KEY' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"days\": 7}'"
