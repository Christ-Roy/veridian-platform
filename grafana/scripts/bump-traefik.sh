#!/usr/bin/env bash
# Bump idempotent du container Traefik d'une install Dokploy standalone.
#
# Pourquoi ce script existe :
#   Dokploy ne met PAS a jour Traefik automatiquement (cf doc upstream + issue
#   GH #289 ouverte depuis 2024). Il faut le faire a la main quand des CVE
#   sortent. La procedure officielle (docker rm + docker run) n'est pas
#   idempotente et ne preserve pas explicitement les bind-mounts / network
#   attachments. Ce script automatise et securise l'operation.
#
# Usage :
#   ./bump-traefik.sh <ssh-target> <target-version>
#
# Exemples :
#   ./bump-traefik.sh prod-pub v3.6.17           # bump reel
#   ./bump-traefik.sh prod-pub v3.6.17 --check   # dry-run, ne touche a rien
#   ./bump-traefik.sh dev-pub  v3.7.1            # bump dev en major
#
# Garanties :
#   1. Idempotent : si deja en target-version, exit 0 sans rien faire.
#   2. Pull AVANT stop : minimise le downtime (image deja dispo localement).
#   3. Bind-mounts/ports/network preserves : extraits via docker inspect, pas
#      hardcodes. Si Dokploy change ses bind-mounts un jour, on s'adapte.
#   4. Backup de l'inspect avant swap (dans /etc/dokploy/traefik/upgrade-backups/).
#   5. Healthcheck post-swap : curl https://app.veridian.site avec retries.
#   6. Rollback automatique si healthcheck fail : restore version precedente.
#
# Pre-requis :
#   - SSH config avec target accessible et sudo sans password
#   - jq installe sur le host distant (verifie au demarrage)
#   - Container "dokploy-traefik" existe (sinon on est pas dans une install
#     Dokploy standalone, exit 1)

set -euo pipefail

SSH_TARGET="${1:-}"
TARGET_VERSION="${2:-}"
MODE="apply"
HEALTH_URL="${HEALTH_URL:-}"

# Parse args restants (--check, --health-url=...)
shift $(( $# > 2 ? 2 : $# ))
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --health-url=*) HEALTH_URL="${arg#--health-url=}" ;;
    *) echo "Arg inconnu: $arg" >&2; exit 1 ;;
  esac
done

# Default URL : app.veridian.site pour prod, none pour dev (skip healthcheck)
if [[ -z "$HEALTH_URL" ]]; then
  case "$SSH_TARGET" in
    prod*) HEALTH_URL="https://app.veridian.site" ;;
    dev*)  HEALTH_URL="" ;;  # skip healthcheck par defaut pour dev
    *)     HEALTH_URL="" ;;
  esac
fi

if [[ -z "$SSH_TARGET" || -z "$TARGET_VERSION" ]]; then
  cat >&2 <<EOF
Usage: $0 <ssh-target> <target-version> [--check] [--health-url=URL]

  <ssh-target>     : alias SSH (prod-pub, dev-pub, ...)
  <target-version> : tag Traefik souhaite (v3.6.17, v3.7.1, ...)
  --check          : dry-run, n'execute aucune modification
  --health-url=URL : URL a curl post-swap (default: app.veridian.site pour prod, none pour dev)

Exemples :
  $0 prod-pub v3.6.17
  $0 prod-pub v3.6.17 --check
  $0 dev-pub  v3.6.17 --health-url=https://dokploy.dev.veridian.site
EOF
  exit 1
fi

# Couleurs (best effort, pas-tty safe)
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YEL=$'\033[33m'
  C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YEL=""; C_BLUE=""; C_DIM=""; C_RST=""
fi

log()   { printf "%s[bump-traefik]%s %s\n" "$C_BLUE" "$C_RST" "$*"; }
ok()    { printf "%s[bump-traefik]%s %s%s%s\n" "$C_BLUE" "$C_RST" "$C_GREEN" "$*" "$C_RST"; }
warn()  { printf "%s[bump-traefik]%s %s%s%s\n" "$C_BLUE" "$C_RST" "$C_YEL"   "$*" "$C_RST"; }
err()   { printf "%s[bump-traefik]%s %s%s%s\n" "$C_BLUE" "$C_RST" "$C_RED"   "$*" "$C_RST" >&2; }

# ---------------------------------------------------------------------------
# Helper SSH : execute une commande sudo sur la cible distante.
# ---------------------------------------------------------------------------
remote() {
  # Le user distant (ubuntu) est dans le groupe docker => pas besoin de sudo
  # pour docker. Pour les commandes qui ont besoin de sudo (ex: tee dans
  # /etc/dokploy/), on prefixe explicitement "sudo" dans la commande.
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" "$@"
}

# ---------------------------------------------------------------------------
# 1. Sanity checks
# ---------------------------------------------------------------------------
log "Target SSH: $SSH_TARGET"
log "Target version: traefik:$TARGET_VERSION"
log "Mode: $MODE"

# SSH joignable ?
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" 'echo ok' >/dev/null 2>&1; then
  err "SSH '$SSH_TARGET' injoignable. Verifie ton ~/.ssh/config."
  exit 1
fi

# jq dispo distant ?
if ! remote 'command -v jq >/dev/null 2>&1'; then
  err "jq absent sur $SSH_TARGET. Install: sudo apt install -y jq"
  exit 1
fi

# Container dokploy-traefik existe ?
if ! remote 'docker inspect dokploy-traefik >/dev/null 2>&1'; then
  err "Container 'dokploy-traefik' introuvable sur $SSH_TARGET."
  err "Ce script ne fonctionne que sur une install Dokploy standalone."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Recuperation de la version actuelle + comparaison
# ---------------------------------------------------------------------------
CURRENT_VERSION="$(remote "docker inspect dokploy-traefik --format '{{.Config.Image}}'" | sed 's/^traefik://')"
log "Version actuelle : traefik:$CURRENT_VERSION"

if [[ "$CURRENT_VERSION" == "$TARGET_VERSION" ]]; then
  ok "Deja en traefik:$TARGET_VERSION, rien a faire (idempotent)."
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Extraction de la config du container actuel (mounts, ports, networks)
# ---------------------------------------------------------------------------
log "Extraction de la config actuelle via docker inspect..."

INSPECT_JSON="$(remote 'docker inspect dokploy-traefik')"

# Binds (volumes bind-mounts) sous forme "-v src:dst[:opts]"
BIND_FLAGS="$(echo "$INSPECT_JSON" | jq -r '.[0].HostConfig.Binds // [] | map("-v " + .) | join(" ")')"
if [[ -z "$BIND_FLAGS" ]]; then
  err "Aucun bind-mount detecte sur le container actuel. Suspect, on s'arrete."
  exit 1
fi

# Ports : -p HostPort:ContainerPort/proto
PORT_FLAGS="$(echo "$INSPECT_JSON" | jq -r '
  .[0].HostConfig.PortBindings // {} | to_entries
  | map(
      .key as $ctn
      | .value[] as $b
      | "-p " + ($b.HostPort // "") + ":" + $ctn
    )
  | join(" ")
')"
if [[ -z "$PORT_FLAGS" ]]; then
  err "Aucun port binding detecte. Suspect, on s'arrete."
  exit 1
fi

RESTART_POLICY="$(echo "$INSPECT_JSON" | jq -r '.[0].HostConfig.RestartPolicy.Name // "always"')"

# Networks attaches (hors le default "bridge" qui est implicite via docker run)
NETWORKS="$(echo "$INSPECT_JSON" | jq -r '.[0].NetworkSettings.Networks // {} | keys[] | select(. != "bridge")')"

log "Bind-mounts detectes: $BIND_FLAGS"
log "Ports detectes      : $PORT_FLAGS"
log "Restart policy      : $RESTART_POLICY"
log "Networks supplem.   : ${NETWORKS:-aucun}"

# ---------------------------------------------------------------------------
# 4. Dry-run : on s'arrete la si --check
# ---------------------------------------------------------------------------
if [[ "$MODE" == "check" ]]; then
  echo
  ok "=== DRY-RUN (--check) ==="
  echo "Si tu lances sans --check, le script va :"
  echo "  1. backup inspect dans /etc/dokploy/traefik/upgrade-backups/"
  echo "  2. docker pull traefik:$TARGET_VERSION"
  echo "  3. docker stop dokploy-traefik && docker rm dokploy-traefik"
  echo "  4. docker run -d --name dokploy-traefik --restart $RESTART_POLICY \\"
  echo "       $BIND_FLAGS \\"
  echo "       $PORT_FLAGS \\"
  echo "       traefik:$TARGET_VERSION"
  for net in $NETWORKS; do
    echo "  5.$net) docker network connect $net dokploy-traefik"
  done
  echo "  6. healthcheck https://app.veridian.site x10 retries"
  echo "  7. si fail -> rollback automatique vers traefik:$CURRENT_VERSION"
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Backup inspect AVANT toute modification
# ---------------------------------------------------------------------------
BACKUP_DIR="/etc/dokploy/traefik/upgrade-backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/inspect-${CURRENT_VERSION}-pre-${TARGET_VERSION}-${TIMESTAMP}.json"

log "Backup inspect actuel -> $BACKUP_FILE"
remote "sudo mkdir -p $BACKUP_DIR"
# Pipe le JSON via stdin pour eviter tout pb d'echappement (le JSON contient
# des single et double quotes).
printf '%s' "$INSPECT_JSON" | ssh -o BatchMode=yes "$SSH_TARGET" -- "sudo tee $BACKUP_FILE > /dev/null && sudo chmod 600 $BACKUP_FILE"

# ---------------------------------------------------------------------------
# 6. Pull la nouvelle image AVANT de tuer l'ancien container (minimise downtime)
# ---------------------------------------------------------------------------
log "Pull traefik:$TARGET_VERSION (avant swap, pour minimiser downtime)..."
if ! remote "docker pull traefik:$TARGET_VERSION"; then
  err "docker pull traefik:$TARGET_VERSION a echoue."
  err "Soit le tag n'existe pas, soit pb reseau. Rien n'a ete modifie."
  exit 1
fi
ok "Image traefik:$TARGET_VERSION dispo localement."

# ---------------------------------------------------------------------------
# 7. Swap : stop + rm + run + reconnect networks
# ---------------------------------------------------------------------------
swap_to_version() {
  local version="$1"
  log "  -> docker stop dokploy-traefik (timeout 30s)..."
  remote 'docker stop --time 30 dokploy-traefik' >/dev/null || true
  log "  -> docker rm dokploy-traefik..."
  remote 'docker rm dokploy-traefik' >/dev/null || true

  # Attache le 1er network non-bridge directement au docker run pour eviter
  # une fenetre de ~1s ou Traefik demarre sans DNS Docker (vu en prod
  # 2026-05-13 : 2 erreurs CrowdSec au boot resolues par network connect).
  local primary_net=""
  local extra_nets=""
  if [[ -n "$NETWORKS" ]]; then
    primary_net="$(echo "$NETWORKS" | head -1)"
    extra_nets="$(echo "$NETWORKS" | tail -n +2)"
  fi

  local net_flag=""
  if [[ -n "$primary_net" ]]; then
    net_flag="--network $primary_net"
  fi

  log "  -> docker run nouveau container en traefik:$version (network: ${primary_net:-default bridge})..."
  remote "docker run -d \
    --name dokploy-traefik \
    --restart $RESTART_POLICY \
    $net_flag \
    $BIND_FLAGS \
    $PORT_FLAGS \
    traefik:$version" >/dev/null

  for net in $extra_nets; do
    log "  -> docker network connect $net dokploy-traefik (additionnel)..."
    remote "docker network connect $net dokploy-traefik" >/dev/null
  done
}

log "=== SWAP traefik:$CURRENT_VERSION -> traefik:$TARGET_VERSION ==="
swap_to_version "$TARGET_VERSION"
ok "Swap effectue. Attente stabilisation Traefik (5s)..."
sleep 5

# ---------------------------------------------------------------------------
# 8. Healthcheck
# ---------------------------------------------------------------------------
if [[ -z "$HEALTH_URL" ]]; then
  warn "Pas d'URL healthcheck configuree (HEALTH_URL vide) — skip."
  warn "  -> Verifier manuellement que Traefik route correctement post-bump."
else
  log "Healthcheck $HEALTH_URL (10 retries, 3s entre)..."

  healthcheck_ok=false
  for i in 1 2 3 4 5 6 7 8 9 10; do
    status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [[ "$status" =~ ^(200|301|302|307|308)$ ]]; then
      ok "Healthcheck $HEALTH_URL = $status (try $i)"
      healthcheck_ok=true
      break
    fi
    warn "Healthcheck try $i : status=$status, retry dans 3s..."
    sleep 3
  done

  if [[ "$healthcheck_ok" != "true" ]]; then
    err "=== ROLLBACK AUTOMATIQUE : healthcheck KO apres 10 retries ==="
    swap_to_version "$CURRENT_VERSION"
    err "Container restaure en traefik:$CURRENT_VERSION."
    err "Investigation requise. Inspect backup: $BACKUP_FILE"
    exit 2
  fi
fi

# ---------------------------------------------------------------------------
# 9. Verifications finales
# ---------------------------------------------------------------------------
NEW_VERSION_RUNNING="$(remote "docker inspect dokploy-traefik --format '{{.Config.Image}}'" | sed 's/^traefik://')"
if [[ "$NEW_VERSION_RUNNING" != "$TARGET_VERSION" ]]; then
  err "Version finale incoherente: attendu $TARGET_VERSION, observe $NEW_VERSION_RUNNING"
  exit 3
fi

echo
ok "=== BUMP TERMINE ==="
ok "traefik:$CURRENT_VERSION -> traefik:$TARGET_VERSION"
ok "Healthcheck $HEALTH_URL : pass"
ok "Backup inspect: $BACKUP_FILE"
echo
log "Pour verifier les CVE post-bump : "
log "  obs check security  (ou direct trivy sur le host)"
