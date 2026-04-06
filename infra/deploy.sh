#!/bin/bash
# ==============================================================================
# Script de déploiement simplifié - Veridian Production
# ==============================================================================
# Usage:
#   ./deploy.sh         # Up avec tous les fichiers (prod + resources)
#   ./deploy.sh down    # Down
#   ./deploy.sh logs    # Logs
#   ./deploy.sh ps      # Status
# ==============================================================================

set -e

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.resources.yml"

case "${1:-up}" in
    up)
        echo "🚀 Déploiement production avec limites de ressources..."
        docker compose $COMPOSE_FILES up -d --remove-orphans
        echo "✅ Déploiement terminé"
        ;;
    down)
        echo "🛑 Arrêt des services..."
        docker compose $COMPOSE_FILES down
        ;;
    restart)
        echo "🔄 Redémarrage des services..."
        docker compose $COMPOSE_FILES restart
        ;;
    logs)
        docker compose $COMPOSE_FILES logs -f "${@:2}"
        ;;
    ps)
        docker compose $COMPOSE_FILES ps
        ;;
    *)
        docker compose $COMPOSE_FILES "$@"
        ;;
esac
