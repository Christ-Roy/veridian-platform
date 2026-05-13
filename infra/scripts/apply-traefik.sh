#!/usr/bin/env bash
# Sync infra/traefik/ → prod /etc/dokploy/traefik/{traefik.yml,dynamic/*}.
#
# IaC pattern : la source de vérité est dans infra/traefik/. Ce script :
#   1. Substitue les ${VAR} par les valeurs de ~/credentials/.all-creds.env
#   2. Dry-run Traefik dans un container temp pour valider la config
#   3. Backup les fichiers prod actuels dans /home/ubuntu/forensics/<date>/
#   4. scp les nouveaux fichiers en place
#   5. `docker restart dokploy-traefik` (avec confirmation)
#
# Usage :
#   ./apply-traefik.sh --dry-run     # n'applique rien, juste check
#   ./apply-traefik.sh               # demande confirmation avant restart
#   ./apply-traefik.sh --no-restart  # applique mais ne restart pas (live reload via watch=true)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../traefik"
CREDS_FILE="${CREDS_FILE:-$HOME/credentials/.all-creds.env}"
SSH_TARGET="${SSH_TARGET:-prod-pub}"
CONTAINER="${CONTAINER:-dokploy-traefik}"
STAMP=$(date +%Y%m%d-%H%M%S)
STAGING="/tmp/apply-traefik-$STAMP"

MODE="${1:-apply}"  # apply | --dry-run | --no-restart

if [[ ! -d "$INFRA_DIR" ]]; then
  echo "ERROR: $INFRA_DIR not found" >&2
  exit 1
fi

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "ERROR: $CREDS_FILE not found — required for envsubst" >&2
  exit 1
fi

# --- 1. Charger les creds dans l'env (parse strict KEY=VAL uniquement) ---
while IFS='=' read -r key val; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # Ne garde que les lignes qui ressemblent à KEY=VAL valides
  if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [[ -n "$val" ]]; then
    # Strip quotes si présentes
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  fi
done <"$CREDS_FILE"

# Vérifier les vars critiques utilisées dans les YAML
REQUIRED_VARS=(CROWDSEC_BOUNCER_API_KEY_PROD)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "ERROR: env var $v non définie (cherchée dans $CREDS_FILE)" >&2
    exit 1
  fi
done

# --- 2. Préparer staging local ---
mkdir -p "$STAGING/dynamic"
echo "==> Staging : $STAGING"

# Substituer les ${VAR} dans les YAML via envsubst
for f in "$INFRA_DIR"/*.yml "$INFRA_DIR"/*.yaml; do
  [[ -f "$f" ]] || continue
  envsubst <"$f" >"$STAGING/$(basename "$f")"
done

for f in "$INFRA_DIR/dynamic"/*.yml "$INFRA_DIR/dynamic"/*.yaml; do
  [[ -f "$f" ]] || continue
  envsubst <"$f" >"$STAGING/dynamic/$(basename "$f")"
done

echo "==> Files staged :"
find "$STAGING" -type f | sed 's/^/    /'

# --- 3. Dry-run Traefik dans container temp ---
echo "==> Dry-run Traefik startup..."
if ! docker run --rm \
  -v "$STAGING/traefik.yml:/etc/traefik/traefik.yml:ro" \
  -v "$STAGING/dynamic:/etc/dokploy/traefik/dynamic:ro" \
  --entrypoint /usr/local/bin/traefik \
  traefik:v3.6.7 \
  --configFile=/etc/traefik/traefik.yml --help >/dev/null 2>&1; then
  echo "ERROR: Traefik refuse la config — voir détails ci-dessous" >&2
  docker run --rm \
    -v "$STAGING/traefik.yml:/etc/traefik/traefik.yml:ro" \
    -v "$STAGING/dynamic:/etc/dokploy/traefik/dynamic:ro" \
    --entrypoint /usr/local/bin/traefik \
    traefik:v3.6.7 \
    --configFile=/etc/traefik/traefik.yml --help 2>&1 | head -20 >&2
  exit 1
fi
echo "    OK"

if [[ "$MODE" == "--dry-run" ]]; then
  echo "==> --dry-run terminé. Rien n'a été appliqué sur $SSH_TARGET."
  exit 0
fi

# --- 4. Backup forensique côté prod ---
echo "==> Backup config prod actuelle vers /home/ubuntu/forensics/$STAMP/"
ssh "$SSH_TARGET" "sudo mkdir -p /home/ubuntu/forensics/$STAMP-traefik && \
  sudo cp /etc/dokploy/traefik/traefik.yml /home/ubuntu/forensics/$STAMP-traefik/ && \
  sudo cp -r /etc/dokploy/traefik/dynamic /home/ubuntu/forensics/$STAMP-traefik/dynamic"

# --- 5. SCP vers prod ---
echo "==> Transfert vers $SSH_TARGET:/etc/dokploy/traefik/..."
scp "$STAGING/traefik.yml" "$SSH_TARGET:/tmp/traefik.yml.new"
ssh "$SSH_TARGET" "sudo mv /tmp/traefik.yml.new /etc/dokploy/traefik/traefik.yml"

# Sync chaque fichier dynamic (préserve acme.json + certificates/)
for f in "$STAGING/dynamic"/*; do
  base=$(basename "$f")
  scp "$f" "$SSH_TARGET:/tmp/dyn-$base"
  ssh "$SSH_TARGET" "sudo mv /tmp/dyn-$base /etc/dokploy/traefik/dynamic/$base"
done

# --- 6. Restart Traefik (sauf --no-restart) ---
if [[ "$MODE" == "--no-restart" ]]; then
  echo "==> Files en place. Pas de restart (provider file=watch reloadera dynamic/)"
  echo "    ⚠ traefik.yml statique nécessite restart pour prendre effet"
  exit 0
fi

read -r -p "==> Restart dokploy-traefik ? (downtime ~10s) [y/N] " ans
if [[ "${ans,,}" != "y" ]]; then
  echo "Skip restart. Les changements dynamic/ sont déjà appliqués via watch."
  exit 0
fi

ssh "$SSH_TARGET" "docker restart $CONTAINER"
sleep 5
echo "==> Smoke test prod..."
for host in app.veridian.site twenty.app.veridian.site notifuse.app.veridian.site; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "https://$host/" || echo "FAIL")
  echo "    $host: $code"
done
echo "==> Backup forensique : $SSH_TARGET:/home/ubuntu/forensics/$STAMP-traefik/"
