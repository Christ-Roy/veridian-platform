#!/usr/bin/env bash
# Bascule blue-green : retire le label Traefik du blue (ancien), ajoute au green (nouveau).
# Usage : ./swap.sh                  → bascule blue → green (production sur green)
#         ./swap.sh rollback         → bascule green → blue (rollback)
#
# Préalables :
#   - blue (compose-connect-redundant-firewall-l5fmki-prospection-authjs-1) tourne avec :staging
#   - green (code-prospection-authjs-green-1) tourne avec :latest et le label vers prospection-green.app
#   - les deux containers répondent OK sur /api/health en interne
#
# Le swap consiste à éditer les labels Traefik des 2 containers et à les redémarrer.
# Traefik détecte les nouveaux labels en quelques secondes.

set -euo pipefail

MODE=${1:-forward}
BLUE_PROJECT="compose-connect-redundant-firewall-l5fmki"
BLUE_FILE="/etc/dokploy/compose/${BLUE_PROJECT}/code/docker-compose.yml"
GREEN_FILE="/etc/dokploy/compose/${BLUE_PROJECT}/code/docker-compose.green.yml"

case "$MODE" in
  forward)
    echo "[swap] Bascule blue (staging) → green (latest) sur prospection.app.veridian.site"
    # Le green doit prendre le router 'prospection-authjs' (production)
    sudo sed -i 's|prospection-green.rule=Host(`prospection-green|prospection-authjs.rule=Host(`prospection|' "$GREEN_FILE"
    sudo sed -i 's|prospection-green.entrypoints|prospection-authjs.entrypoints|; s|prospection-green.tls|prospection-authjs.tls|; s|services.prospection-green|services.prospection-authjs|' "$GREEN_FILE"
    # Le blue prend un router intermédiaire pour rester accessible en cas de rollback
    sudo sed -i 's|prospection-authjs.rule=Host(`prospection.app|prospection-blue.rule=Host(`prospection-blue.app|' "$BLUE_FILE"
    sudo sed -i 's|prospection-authjs.entrypoints|prospection-blue.entrypoints|; s|prospection-authjs.tls|prospection-blue.tls|; s|services.prospection-authjs|services.prospection-blue|' "$BLUE_FILE"
    sudo docker compose -p "$BLUE_PROJECT" up -d
    sudo docker compose -p "${BLUE_PROJECT}-green" -f "$GREEN_FILE" up -d
    echo "[swap] Done. Le green répond sur prospection.app.veridian.site"
    ;;
  rollback)
    echo "[swap] Rollback green → blue"
    sudo sed -i 's|prospection-blue.rule=Host(`prospection-blue|prospection-authjs.rule=Host(`prospection|' "$BLUE_FILE"
    sudo sed -i 's|prospection-blue.entrypoints|prospection-authjs.entrypoints|; s|prospection-blue.tls|prospection-authjs.tls|; s|services.prospection-blue|services.prospection-authjs|' "$BLUE_FILE"
    sudo sed -i 's|prospection-authjs.rule=Host(`prospection.app|prospection-green.rule=Host(`prospection-green.app|' "$GREEN_FILE"
    sudo sed -i 's|prospection-authjs.entrypoints|prospection-green.entrypoints|; s|prospection-authjs.tls|prospection-green.tls|; s|services.prospection-authjs|services.prospection-green|' "$GREEN_FILE"
    sudo docker compose -p "$BLUE_PROJECT" up -d
    sudo docker compose -p "${BLUE_PROJECT}-green" -f "$GREEN_FILE" up -d
    echo "[swap] Rollback done. Le blue (staging) répond sur prospection.app.veridian.site"
    ;;
  *)
    echo "Usage: $0 [forward|rollback]"
    exit 1
    ;;
esac
