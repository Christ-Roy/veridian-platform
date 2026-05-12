#!/usr/bin/env bash
# Install / met à jour Grafana Alloy sur un VPS distant en idempotent.
#
# Usage :
#   ./deploy-alloy.sh <ssh-target> <env-label>
#
# Exemples :
#   ./deploy-alloy.sh prod-pub prod
#   ./deploy-alloy.sh dev-pub  dev
#
# Le script :
#   1. Vérifie qu'on a les credentials Grafana Cloud (~/credentials/.all-creds.env)
#   2. Render la config Alloy (config.alloy.tmpl → config.alloy)
#   3. SCP la config + gcloud.env (mode 0600) sur le VPS
#   4. Install Alloy via apt si pas déjà fait (repo Grafana + signed key)
#   5. systemctl enable + restart alloy
#   6. Vérifie /api/health Alloy local sur le VPS
#   7. Vérifie qu'un log apparaît côté Grafana Cloud (best effort)
#
# Idempotent : relance OK, écrase la config existante avec celle du repo.

set -euo pipefail

SSH_TARGET="${1:-}"
ENV_LABEL="${2:-}"

if [[ -z "$SSH_TARGET" || -z "$ENV_LABEL" ]]; then
  echo "Usage: $0 <ssh-target> <env-label>" >&2
  echo "  ex:  $0 prod-pub prod" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GRAFANA_DIR="$REPO_ROOT/grafana"
CREDS="$HOME/credentials/.all-creds.env"

read_var() {
  local name="$1"
  grep -E "^${name}=" "$CREDS" | tail -1 | cut -d'=' -f2- | sed 's/^ *//; s/ *$//; s/^"//; s/"$//'
}

GCLOUD_TOKEN=$(read_var GRAFANA_CLOUD_TOKEN)
GCLOUD_LOKI_URL=$(read_var GRAFANA_CLOUD_LOKI_URL)
GCLOUD_LOKI_USER=$(read_var GRAFANA_CLOUD_LOKI_USER)
GCLOUD_MIMIR_URL=$(read_var GRAFANA_CLOUD_MIMIR_URL)
GCLOUD_MIMIR_USER=$(read_var GRAFANA_CLOUD_MIMIR_USER)
GCLOUD_TEMPO_URL=$(read_var GRAFANA_CLOUD_TEMPO_URL)
GCLOUD_TEMPO_USER=$(read_var GRAFANA_CLOUD_TEMPO_USER)
GCLOUD_OTLP_URL=$(read_var GRAFANA_CLOUD_OTLP_URL)
# L'OTLP gateway utilise le stack ID comme username (pas le tenant Tempo)
GCLOUD_OTLP_USER=$(read_var GRAFANA_CLOUD_USERNAME)

for var in GCLOUD_TOKEN GCLOUD_LOKI_URL GCLOUD_LOKI_USER GCLOUD_MIMIR_URL GCLOUD_MIMIR_USER GCLOUD_TEMPO_URL GCLOUD_TEMPO_USER GCLOUD_OTLP_URL GCLOUD_OTLP_USER; do
  if [[ -z "${!var}" ]]; then
    echo "ERREUR : $var manquant dans $CREDS" >&2
    exit 1
  fi
done

echo "==> Target SSH      : $SSH_TARGET"
echo "==> Env label       : $ENV_LABEL"
echo "==> Loki  $GCLOUD_LOKI_USER  → $GCLOUD_LOKI_URL"
echo "==> Mimir $GCLOUD_MIMIR_USER → $GCLOUD_MIMIR_URL"
echo "==> Tempo $GCLOUD_TEMPO_USER → $GCLOUD_TEMPO_URL"
echo "==> OTLP  → $GCLOUD_OTLP_URL"
echo

# 1. Récupère le hostname distant + IP du bridge Docker dokploy-network
echo "==> [1/6] Récupère hostname distant + bind IP..."
REMOTE_HOSTNAME=$(ssh -o BatchMode=yes "$SSH_TARGET" "hostname")
echo "    Hostname distant : $REMOTE_HOSTNAME"

# Bind IP pour le receiver OTLP : gateway du réseau dokploy-network
# Fallback sur 127.0.0.1 si pas de réseau dokploy-network (cas dev sans Traefik)
REMOTE_OTLP_BIND=$(ssh -o BatchMode=yes "$SSH_TARGET" \
  "sudo docker network inspect dokploy-network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true")
if [[ -z "$REMOTE_OTLP_BIND" ]]; then
  REMOTE_OTLP_BIND="127.0.0.1"
  echo "    Pas de dokploy-network sur $SSH_TARGET → bind OTLP sur 127.0.0.1"
else
  echo "    Bind OTLP receiver sur : $REMOTE_OTLP_BIND (gateway dokploy-network)"
fi

# 2. Render la config localement (template + filters env-specific)
echo "==> [2/6] Render config.alloy depuis le template..."
TMP_CONFIG=$(mktemp)
trap 'rm -f "$TMP_CONFIG"' EXIT

FILTERS_FILE="$GRAFANA_DIR/alloy/filters.${ENV_LABEL}.alloy"
if [[ ! -f "$FILTERS_FILE" ]]; then
  echo "    ATTENTION : $FILTERS_FILE introuvable, fallback dev (pas de filtres)"
  FILTERS_FILE="$GRAFANA_DIR/alloy/filters.dev.alloy"
fi
FILTERS_CONTENT=$(cat "$FILTERS_FILE")

# awk pour gérer le {{PROD_FILTERS}} multi-ligne (sed est tricky avec ça)
awk -v hostname="$REMOTE_HOSTNAME" -v env_label="$ENV_LABEL" -v filters="$FILTERS_CONTENT" '
{
  gsub(/\{\{HOSTNAME\}\}/, hostname);
  gsub(/\{\{ENV\}\}/, env_label);
  if (/\{\{PROD_FILTERS\}\}/) {
    print filters;
    next;
  }
  print;
}
' "$GRAFANA_DIR/alloy/config.alloy.tmpl" > "$TMP_CONFIG"
echo "    Config rendue : $(wc -l < "$TMP_CONFIG") lignes (filtres : $(basename $FILTERS_FILE))"

# 3. Crée le fichier d'env pour Alloy (secrets, chmod 0600)
TMP_ENV=$(mktemp)
cat > "$TMP_ENV" <<EOF
# /etc/alloy/gcloud.env — sourced via systemd EnvironmentFile= drop-in
# Généré par grafana/scripts/deploy-alloy.sh — NE PAS éditer manuellement.
GCLOUD_TOKEN=${GCLOUD_TOKEN}
GCLOUD_LOKI_URL=${GCLOUD_LOKI_URL}
GCLOUD_LOKI_USER=${GCLOUD_LOKI_USER}
GCLOUD_MIMIR_URL=${GCLOUD_MIMIR_URL}
GCLOUD_MIMIR_USER=${GCLOUD_MIMIR_USER}
GCLOUD_TEMPO_URL=${GCLOUD_TEMPO_URL}
GCLOUD_TEMPO_USER=${GCLOUD_TEMPO_USER}
GCLOUD_OTLP_URL=${GCLOUD_OTLP_URL}
GCLOUD_OTLP_USER=${GCLOUD_OTLP_USER}
# Bind IP pour OTLP receiver — gateway dokploy-network = atteignable par
# containers Veridian mais pas par Internet. Override avec OTLP_RECEIVER_BIND=0.0.0.0
# si débogage temporaire (et seulement pendant un debug actif).
OTLP_RECEIVER_BIND=${REMOTE_OTLP_BIND}
EOF
chmod 0600 "$TMP_ENV"

# 4. SCP des fichiers vers le VPS dans /tmp (l'install les déplacera avec sudo)
echo "==> [3/6] SCP config + env vers $SSH_TARGET..."
scp -q "$TMP_CONFIG" "$SSH_TARGET:/tmp/alloy-config.alloy.new"
scp -q "$TMP_ENV"    "$SSH_TARGET:/tmp/alloy-gcloud.env.new"
rm -f "$TMP_ENV"

# 5. Install Alloy + déploie la config + restart
echo "==> [4/6] Install/update Alloy + déploie config..."
ssh "$SSH_TARGET" 'bash -s' <<'REMOTE'
set -euo pipefail

# Install repo Grafana si pas déjà
if ! command -v alloy >/dev/null 2>&1; then
  echo "    Alloy absent, install via apt..."
  sudo mkdir -p /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/grafana.asc ]; then
    sudo wget -qO /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
    sudo chmod 0644 /etc/apt/keyrings/grafana.asc
  fi
  if [ ! -f /etc/apt/sources.list.d/grafana.list ]; then
    echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" \
      | sudo tee /etc/apt/sources.list.d/grafana.list >/dev/null
  fi
  sudo apt-get update -qq
  sudo apt-get install -y alloy
else
  echo "    Alloy déjà installé : $(alloy --version | head -1)"
fi

# Ajoute user alloy au groupe docker pour lire /var/run/docker.sock
if ! id alloy | grep -q docker; then
  echo "    Ajoute user alloy au groupe docker..."
  sudo usermod -aG docker alloy
fi

# Déploie config + env
sudo mkdir -p /etc/alloy
sudo install -m 0644 -o root -g root /tmp/alloy-config.alloy.new /etc/alloy/config.alloy
sudo install -m 0600 -o alloy -g alloy /tmp/alloy-gcloud.env.new   /etc/alloy/gcloud.env
rm -f /tmp/alloy-config.alloy.new /tmp/alloy-gcloud.env.new

# Drop-in systemd pour charger gcloud.env
sudo mkdir -p /etc/systemd/system/alloy.service.d
cat <<DROPIN | sudo tee /etc/systemd/system/alloy.service.d/gcloud-env.conf >/dev/null
[Service]
EnvironmentFile=/etc/alloy/gcloud.env
DROPIN

sudo systemctl daemon-reload
sudo systemctl enable alloy
sudo systemctl restart alloy
sleep 2
sudo systemctl is-active alloy
REMOTE

# 6. Health check Alloy local
echo "==> [5/6] Health check Alloy local sur $SSH_TARGET..."
ssh "$SSH_TARGET" "curl -sf http://127.0.0.1:12345/-/ready" \
  && echo "    Alloy ready ✓" \
  || (echo "    Alloy /ready KO" && exit 1)

# 7. Vérifie qu'un log remonte côté Grafana Cloud (best effort, 30s d'attente)
echo "==> [6/6] Attente premier log dans Grafana Cloud (jusqu'à 30s)..."
sleep 10
SA_TOKEN=$(read_var GRAFANA_STACK_SA_TOKEN)
STACK_URL=$(read_var GRAFANA_CLOUD_STACK_URL)
QUERY="{host=\"${REMOTE_HOSTNAME}\"}"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")
NOW=$(date +%s)
START=$((NOW - 60))

RESULT=$(curl -sS -H "Authorization: Bearer $SA_TOKEN" \
  "${STACK_URL}/api/datasources/uid/grafanacloud-logs/resources/loki/api/v1/query_range?query=${ENCODED}&start=${START}000000000&end=${NOW}000000000&limit=1" \
  2>/dev/null || true)

if echo "$RESULT" | grep -q '"resultType"'; then
  COUNT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(len(s['values']) for s in d.get('data',{}).get('result',[])))" 2>/dev/null || echo 0)
  echo "    Premiers logs reçus côté Grafana Cloud : $COUNT entrées"
else
  echo "    Pas encore de logs visibles côté Grafana Cloud — peut prendre 1-2 min."
  echo "    Vérifier manuellement : $STACK_URL/explore avec query {host=\"${REMOTE_HOSTNAME}\"}"
fi

echo
echo "==> ✓ Déploiement Alloy terminé sur $SSH_TARGET (env=$ENV_LABEL, host=$REMOTE_HOSTNAME)"
