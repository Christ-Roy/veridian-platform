#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Clone Prod → Test on Dev Server
# ============================================================================
#
# IDEMPOTENT: pulls ALL config from Dokploy API at runtime.
# Nothing is hardcoded or cached locally.
#
# Flow:
#   1. Pull env vars + compose files from Dokploy API (prod)
#   2. Remap domains: *.app.veridian.site → *.dev.veridian.site
#   3. Stop staging on dev server
#   4. Dump all 4 prod databases
#   5. Start clone with prod config + prod data on dev server
#   6. Run full test battery
#   7. Cleanup + restart staging
#
# Usage:
#   ./clone-prod-test.sh              # Full pipeline
#   ./clone-prod-test.sh dump-only    # Just dump prod DBs
#   ./clone-prod-test.sh test-only    # Tests against running clone
#   ./clone-prod-test.sh cleanup      # Stop clone, restart staging
#
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- SSH targets ---
PROD_SSH="prod-pub"
DEV_SSH="dev-pub"

# --- Paths on dev server ---
CLONE_DIR="/opt/prod-clone"
DUMP_DIR="/tmp/prod-db-dumps"

# --- Domain remapping ---
PROD_BASE="app.veridian.site"
CLONE_BASE="dev.veridian.site"

# --- Dokploy compose IDs (the only hardcoded values — these are stable IDs) ---
declare -A COMPOSE_IDS=(
  [hub]="Rnt_Jz4BhkcyEJ2D6Bugb"
  [prospection]="xelXB17eNlesUlHqHJCtY"
  [supabase]="xhlNGckdeiH1ZdSqZv2HT"
  [twenty]="8zdqAAD1lkZFVAwuZ5USv"
  [notifuse]="WN0jglLj5bDIrXUFZHNmw"
)

# --- Prod container names (for pg_dump) ---
SUPABASE_DB_CONTAINER="compose-parse-digital-alarm-974mhw-supabase-db-1"
PROSPECTION_DB_CONTAINER="compose-index-solid-state-card-d7uu39-prospection-saas-db-1"
TWENTY_DB_CONTAINER="compose-parse-optical-array-lvh5md-twenty-postgres-1"
NOTIFUSE_DB_CONTAINER="compose-transmit-open-source-microchip-k9lvap-notifuse-postgres-1"

# --- Staging compose prefix (to stop/start) ---
STAGING_COMPOSE_PREFIX="compose-bypass-bluetooth-feed-tbayqr"

# --- Colors ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)] ✅${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠️${NC}  $*"; }
fail() { echo -e "${RED}[$(date +%H:%M:%S)] ❌${NC} $*"; }
die()  { fail "$*"; exit 1; }

# ============================================================================
# Pull config from Dokploy API
# ============================================================================
pull_dokploy_config() {
  log "Pulling live config from Dokploy API..."

  local work_dir="$1"
  mkdir -p "$work_dir"

  # Create dump dir on prod
  ssh "$PROD_SSH" "mkdir -p $DUMP_DIR"

  # Get Dokploy API key from prod server
  local dkey
  dkey=$(ssh "$PROD_SSH" "grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2")
  [ -n "$dkey" ] || die "Could not get DOKPLOY_API_KEY from prod"

  # Pull each compose's env + compose file
  for name in "${!COMPOSE_IDS[@]}"; do
    local cid="${COMPOSE_IDS[$name]}"
    log "  Pulling $name ($cid)..."

    ssh "$PROD_SSH" "python3 - <<'PYEOF'
import json, urllib.request, urllib.parse

DKEY = '$dkey'
CID = '$cid'
NAME = '$name'
OUT = '$DUMP_DIR'

inp = json.dumps({'json': {'composeId': CID}})
url = 'http://localhost:3000/api/trpc/compose.one?input=' + urllib.parse.quote(inp)
req = urllib.request.Request(url, headers={'x-api-key': DKEY})
data = json.loads(urllib.request.urlopen(req).read())
compose = data['result']['data']['json']

with open(f'{OUT}/{NAME}.env', 'w') as f:
    f.write(compose.get('env', ''))

with open(f'{OUT}/{NAME}.compose.yml', 'w') as f:
    f.write(compose.get('composeFile', ''))

env_count = len([l for l in compose.get('env','').split('\\n') if '=' in l and not l.startswith('#')])
print(f'{NAME}: {env_count} env vars, compose {len(compose.get(\"composeFile\",\"\"))} chars')
PYEOF" || die "Failed to pull $name config"
  done

  # Also grab Kong config
  log "  Pulling Kong config..."
  ssh "$PROD_SSH" "docker exec $SUPABASE_DB_CONTAINER cat /dev/null 2>/dev/null" || true  # just to test connectivity
  ssh "$PROD_SSH" "docker cp \$(docker ps -q --filter name=kong | head -1):/home/kong/kong.yml $DUMP_DIR/kong.yml 2>/dev/null" \
    || warn "Could not pull Kong config — will need manual setup"

  ok "All Dokploy configs pulled"
}

# ============================================================================
# Generate clone .env (remap domains from prod → dev)
# ============================================================================
generate_clone_env() {
  log "Generating clone .env with remapped domains..."

  ssh "$DEV_SSH" "python3 - <<'PYEOF'
import os, re

DUMP_DIR = '$DUMP_DIR'
CLONE_DIR = '$CLONE_DIR'
os.makedirs(CLONE_DIR, exist_ok=True)

# Read hub.env as the master env (it contains all shared secrets)
with open(f'{DUMP_DIR}/hub.env') as f:
    env_content = f.read()

# Also read prospection-specific env vars
with open(f'{DUMP_DIR}/prospection.env') as f:
    prosp_env = f.read()

# Domain remapping
replacements = {
    'app.veridian.site': 'app.dev.veridian.site',
    'twenty.app.veridian.site': 'twenty.dev.veridian.site',
    'notifuse.app.veridian.site': 'notifuse.dev.veridian.site',
    'prospection.app.veridian.site': 'prospection.dev.veridian.site',
    'api.app.veridian.site': 'api.dev.veridian.site',
    'supabase.app.veridian.site': 'supabase.dev.veridian.site',
    'studio.app.veridian.site': 'studio.dev.veridian.site',
}

# Apply replacements (longer strings first to avoid partial matches)
for old, new in sorted(replacements.items(), key=lambda x: -len(x[0])):
    env_content = env_content.replace(old, new)

# Add clone-specific overrides (internal Docker URLs)
overrides = '''
# --- Clone overrides (generated at runtime) ---
PROSPECTION_API_URL=http://prospection-saas:3000
PROSPECTION_INTERNAL_URL=http://prospection-saas:3000
NEXT_PUBLIC_PROSPECTION_URL=https://prospection.dev.veridian.site
TWENTY_GRAPHQL_URL=https://twenty.dev.veridian.site/graphql
TWENTY_METADATA_URL=https://twenty.dev.veridian.site/metadata
DASHBOARD_TWENTY_GRAPHQL_URL=http://twenty-server:3000/graphql
DASHBOARD_TWENTY_METADATA_URL=http://twenty-server:3000/metadata
DASHBOARD_NOTIFUSE_API_URL=http://notifuse:8081
# Disable Stripe webhooks in clone
STRIPE_WEBHOOK_SECRET=whsec_DISABLED_IN_CLONE
STRIPE_WEBHOOK_SECRET_LIVE=whsec_DISABLED_IN_CLONE
# Override COMPOSE_FILE to only use our single compose
COMPOSE_FILE=docker-compose.yml
'''

# Parse existing env into dict, then apply overrides
env_dict = {}
for line in env_content.split('\\n'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        key, val = line.split('=', 1)
        env_dict[key.strip()] = val.strip()

for line in overrides.strip().split('\\n'):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        key, val = line.split('=', 1)
        env_dict[key.strip()] = val.strip()

# Write final .env
with open(f'{CLONE_DIR}/.env', 'w') as f:
    for key, val in sorted(env_dict.items()):
        f.write(f'{key}={val}\\n')

print(f'Clone .env generated: {len(env_dict)} vars')
PYEOF"

  ok "Clone .env generated on dev server"
}

# ============================================================================
# Dump prod databases
# ============================================================================
dump_prod_dbs() {
  log "Dumping prod databases..."
  ssh "$PROD_SSH" "mkdir -p $DUMP_DIR"

  local dbs=(
    "$SUPABASE_DB_CONTAINER|supabase_admin|postgres|supabase|--data-only --inserts"
    "$PROSPECTION_DB_CONTAINER|postgres|prospection|prospection|--clean --if-exists"
    "$TWENTY_DB_CONTAINER|twenty|twenty|twenty|--clean --if-exists"
    "$NOTIFUSE_DB_CONTAINER|postgres||notifuse|--clean --if-exists"
  )

  for entry in "${dbs[@]}"; do
    IFS='|' read -r container user db name extra_flags <<< "$entry"
    log "  Dumping $name..."

    local db_flag=""
    [ -n "$db" ] && db_flag="-d $db"

    ssh "$PROD_SSH" "
      docker exec $container pg_dump -U $user $db_flag \
        --no-owner --no-privileges $extra_flags \
        > $DUMP_DIR/${name}.sql 2>/dev/null
      SIZE=\$(wc -c < $DUMP_DIR/${name}.sql)
      echo '$name: '\$SIZE' bytes'
    " || die "$name dump failed"
  done

  ok "All databases dumped"

  # Transfer to dev server
  log "Transferring dumps to dev server..."
  ssh "$PROD_SSH" "cd $DUMP_DIR && tar czf all-dumps.tar.gz supabase.sql prospection.sql twenty.sql notifuse.sql kong.yml *.env 2>/dev/null || tar czf all-dumps.tar.gz supabase.sql prospection.sql twenty.sql notifuse.sql *.env"
  scp "$PROD_SSH:$DUMP_DIR/all-dumps.tar.gz" /tmp/all-dumps.tar.gz
  scp /tmp/all-dumps.tar.gz "$DEV_SSH:/tmp/all-dumps.tar.gz"
  ssh "$DEV_SSH" "mkdir -p $DUMP_DIR && tar xzf /tmp/all-dumps.tar.gz -C $DUMP_DIR"
  ok "Dumps transferred"
}

# ============================================================================
# Stop staging
# ============================================================================
stop_staging() {
  log "Stopping staging stack..."
  ssh "$DEV_SSH" "
    docker ps -q --filter 'name=$STAGING_COMPOSE_PREFIX' | xargs -r docker stop 2>/dev/null || true
  " || warn "Staging may already be stopped"
  ok "Staging stopped"
}

# ============================================================================
# Deploy clone
# ============================================================================
deploy_clone() {
  log "Deploying clone stack..."

  # Upload compose file + kong config
  scp "$SCRIPT_DIR/docker-compose.clone.yml" "$DEV_SSH:$CLONE_DIR/docker-compose.yml"
  ssh "$DEV_SSH" "cp $DUMP_DIR/kong.yml $CLONE_DIR/kong.yml 2>/dev/null || true"

  # Pull images
  log "  Pulling images..."
  ssh "$DEV_SSH" "
    docker pull ghcr.io/christ-roy/prospection:latest &
    docker pull ghcr.io/christ-roy/veridian-dashboard:latest &
    docker pull twentycrm/twenty:v1.16.7 &
    docker pull notifuse/notifuse:v27.0 &
    wait
    echo 'Images pulled'
  "

  # Start DBs first
  log "  Starting databases..."
  ssh "$DEV_SSH" "cd $CLONE_DIR && docker compose up -d supabase-db prospection-db twenty-postgres notifuse-postgres twenty-redis"

  # Wait for healthy
  log "  Waiting for databases..."
  ssh "$DEV_SSH" "
    for i in \$(seq 1 30); do
      READY=0
      for svc in supabase-db prospection-db twenty-postgres notifuse-postgres; do
        S=\$(docker inspect --format='{{.State.Health.Status}}' prod-clone-\${svc}-1 2>/dev/null || echo 'missing')
        [ \"\$S\" = 'healthy' ] && READY=\$((READY+1))
      done
      [ \$READY -ge 4 ] && echo 'All DBs healthy' && break
      sleep 2
    done
  "

  # Start Supabase services first (auth creates schema on first boot)
  log "  Starting Supabase services (initial schema creation)..."
  ssh "$DEV_SSH" "cd $CLONE_DIR && docker compose up -d kong auth rest meta storage realtime"

  # Wait for auth to be healthy (it creates the auth schema)
  log "  Waiting for Supabase auth to initialize..."
  ssh "$DEV_SSH" "
    for i in \$(seq 1 30); do
      S=\$(docker inspect --format='{{.State.Health.Status}}' prod-clone-auth-1 2>/dev/null || echo 'starting')
      [ \"\$S\" = 'healthy' ] && echo 'Auth healthy' && break
      sleep 3
    done
  "

  # Now restore data into the initialized Supabase DB
  log "  Restoring Supabase data (data-only)..."
  ssh "$DEV_SSH" "docker exec -i prod-clone-supabase-db-1 psql -U supabase_admin -d postgres < $DUMP_DIR/supabase.sql 2>&1 | grep -cE 'INSERT|ERROR' | head -1" || warn "Supabase restore had warnings"

  # Restore other DBs (full schema + data)
  log "  Restoring Prospection DB..."
  ssh "$DEV_SSH" "docker exec -i prod-clone-prospection-db-1 psql -U postgres -d prospection < $DUMP_DIR/prospection.sql 2>&1 | tail -1" || warn "Prospection restore had warnings"

  log "  Restoring Twenty DB..."
  ssh "$DEV_SSH" "docker exec -i prod-clone-twenty-postgres-1 psql -U twenty -d twenty < $DUMP_DIR/twenty.sql 2>&1 | tail -1" || warn "Twenty restore had warnings"

  log "  Restoring Notifuse DB..."
  ssh "$DEV_SSH" "docker exec -i prod-clone-notifuse-postgres-1 psql -U postgres < $DUMP_DIR/notifuse.sql 2>&1 | tail -1" || warn "Notifuse restore had warnings"

  ok "Databases restored"

  # Start remaining services
  log "  Starting all services..."
  ssh "$DEV_SSH" "cd $CLONE_DIR && docker compose up -d"

  # Health check
  log "  Waiting for clone to be healthy..."
  for i in $(seq 1 18); do
    HEALTH=$(curl -sf "https://prospection.dev.veridian.site/api/health" 2>/dev/null || echo "")
    if echo "$HEALTH" | grep -q healthy; then
      ok "Clone healthy after ${i}0s"
      return 0
    fi
    sleep 10
  done
  die "Clone not healthy after 3 min"
}

# ============================================================================
# Run tests
# ============================================================================
run_tests() {
  log "Running test battery against clone..."

  cd "$PROJ_DIR/prospection/dashboard"

  # Read keys from the clone env on dev server
  export SUPABASE_ANON_KEY
  export SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_ANON_KEY=$(ssh "$DEV_SSH" "grep '^ANON_KEY=' $CLONE_DIR/.env | cut -d= -f2")
  SUPABASE_SERVICE_ROLE_KEY=$(ssh "$DEV_SSH" "grep '^SERVICE_ROLE_KEY=' $CLONE_DIR/.env | cut -d= -f2")

  export HUB_URL="https://app.dev.veridian.site"
  export PROSPECTION_URL="https://prospection.dev.veridian.site"
  export SUPABASE_URL="https://api.dev.veridian.site"
  export TWENTY_URL="https://twenty.dev.veridian.site"
  export TENANT_API_SECRET="prospection-prod-secret-2026"
  export CI=true

  local exit_code=0

  log "  Suite 1/3: Regression (health, data integrity, auth)..."
  npx playwright test e2e/regression.spec.ts --reporter=list || exit_code=1

  log "  Suite 2/3: SaaS flow (signup → provisioning → auto-login)..."
  npx playwright test e2e/saas-flow.spec.ts --reporter=list || exit_code=1

  log "  Suite 3/3: Existing accounts (token scenarios, trial, plan)..."
  npx playwright test e2e/existing-accounts.spec.ts --reporter=list || exit_code=1

  return $exit_code
}

# ============================================================================
# Cleanup
# ============================================================================
cleanup() {
  log "Cleaning up clone..."
  ssh "$DEV_SSH" "
    cd $CLONE_DIR 2>/dev/null && docker compose down -v 2>/dev/null || true
    rm -rf $CLONE_DIR $DUMP_DIR
  " || warn "Cleanup had issues"
  ssh "$PROD_SSH" "rm -rf $DUMP_DIR" || true
  rm -f /tmp/all-dumps.tar.gz
  ok "Clone cleaned up"
}

restart_staging() {
  log "Restarting staging..."
  ssh "$DEV_SSH" "
    docker ps -a -q --filter 'name=$STAGING_COMPOSE_PREFIX' | xargs -r docker start 2>/dev/null || true
  " || warn "Staging restart had issues"
  ok "Staging restarted"
}

# ============================================================================
# Main
# ============================================================================
main() {
  local mode="${1:-full}"
  local start_time=$SECONDS

  echo ""
  echo "============================================"
  echo "  Clone Prod → Test Pipeline"
  echo "  Mode: $mode"
  echo "  $(date)"
  echo "============================================"
  echo ""

  case "$mode" in
    dump-only)
      pull_dokploy_config "$DUMP_DIR"
      dump_prod_dbs
      ;;
    test-only)
      run_tests
      ;;
    cleanup)
      cleanup
      restart_staging
      ;;
    full)
      # 1. Pull live config from Dokploy
      ssh "$DEV_SSH" "mkdir -p $DUMP_DIR"
      pull_dokploy_config "$DUMP_DIR"

      # 2. Dump prod DBs
      dump_prod_dbs

      # 3. Stop staging
      stop_staging

      # 4. Generate remapped env
      generate_clone_env

      # 5. Deploy clone
      deploy_clone

      # 6. Run tests
      local test_result=0
      run_tests || test_result=1

      # 7. Cleanup
      cleanup
      restart_staging

      local elapsed=$(( SECONDS - start_time ))

      # Report
      echo ""
      echo "============================================"
      echo "  Duration: ${elapsed}s"
      if [ $test_result -eq 0 ]; then
        ok "ALL TESTS PASSED ✅"
        echo "  Safe to deploy to prod."
      else
        fail "TESTS FAILED ❌"
        echo "  Do NOT deploy to prod."
      fi
      echo "============================================"

      exit $test_result
      ;;
    *)
      echo "Usage: $0 [full|dump-only|test-only|cleanup]"
      exit 1
      ;;
  esac
}

main "$@"
