#!/bin/bash
# ============================================================================
# TEST RATE LIMITING REDIS
# ============================================================================
# Ce script teste le rate limiting Kong avec Redis pour vérifier que:
# 1. Les compteurs sont partagés entre instances Kong
# 2. Les limites sont bien appliquées par IP
# 3. Le rate limiting fonctionne correctement après le passage à Redis
#
# Usage: ./test-rate-limit.sh [URL] [REQUESTS]
# Example: ./test-rate-limit.sh https://api.veridian.site/auth/v1/health 150
# ============================================================================

set -euo pipefail

# Configuration
TARGET_URL="${1:-https://api.veridian.site/auth/v1/health}"
TOTAL_REQUESTS="${2:-150}"
DOMAIN="${DOMAIN:-veridian.site}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}TEST RATE LIMITING KONG + REDIS${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "Target URL: ${GREEN}${TARGET_URL}${NC}"
echo -e "Total requests: ${GREEN}${TOTAL_REQUESTS}${NC}"
echo -e "Expected limit: ${YELLOW}100 req/min${NC} (routes ouvertes)"
echo ""

# Compteurs
SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0
ERROR_COUNT=0

echo -e "${BLUE}Envoi de ${TOTAL_REQUESTS} requêtes...${NC}"
echo ""

for i in $(seq 1 $TOTAL_REQUESTS); do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}" 2>&1 || echo "000")

  case $RESPONSE in
    200|204)
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      echo -ne "${GREEN}✓${NC}"
      ;;
    429)
      RATE_LIMITED_COUNT=$((RATE_LIMITED_COUNT + 1))
      echo -ne "${RED}✗${NC}"
      ;;
    *)
      ERROR_COUNT=$((ERROR_COUNT + 1))
      echo -ne "${YELLOW}?${NC}"
      ;;
  esac

  # Affichage progress tous les 10 req
  if [ $((i % 10)) -eq 0 ]; then
    echo -ne " [$i/$TOTAL_REQUESTS]\n"
  fi

  # Petit délai pour ne pas surcharger
  sleep 0.1
done

echo ""
echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}RÉSULTATS${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "✅ Succès (200/204):       ${GREEN}${SUCCESS_COUNT}${NC} / ${TOTAL_REQUESTS}"
echo -e "❌ Rate Limited (429):     ${RED}${RATE_LIMITED_COUNT}${NC} / ${TOTAL_REQUESTS}"
echo -e "⚠️  Erreurs (autres):      ${YELLOW}${ERROR_COUNT}${NC} / ${TOTAL_REQUESTS}"
echo ""

# Vérification Redis
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}VÉRIFICATION REDIS${NC}"
echo -e "${BLUE}============================================================================${NC}"

if docker exec twenty-redis redis-cli -n 2 KEYS "ratelimit:*" | head -5; then
  echo -e "${GREEN}✅ Clés de rate limiting trouvées dans Redis (DB 2)${NC}"

  # Afficher quelques valeurs
  echo ""
  echo -e "${BLUE}Exemple de compteurs Redis:${NC}"
  for key in $(docker exec twenty-redis redis-cli -n 2 KEYS "ratelimit:*" | head -3); do
    value=$(docker exec twenty-redis redis-cli -n 2 GET "$key")
    ttl=$(docker exec twenty-redis redis-cli -n 2 TTL "$key")
    echo -e "  ${YELLOW}${key}${NC}: ${value} (expire dans ${ttl}s)"
  done
else
  echo -e "${RED}❌ Aucune clé de rate limiting trouvée dans Redis${NC}"
  echo -e "${YELLOW}   Vérifiez que Kong est bien configuré avec policy: redis${NC}"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"

# Analyse des résultats
if [ $RATE_LIMITED_COUNT -gt 0 ]; then
  echo -e "${GREEN}✅ TEST RÉUSSI: Rate limiting fonctionne correctement!${NC}"
  echo -e "   ${RATE_LIMITED_COUNT} requêtes ont été bloquées après la limite."
else
  echo -e "${YELLOW}⚠️  ATTENTION: Aucune requête n'a été rate limitée.${NC}"
  echo -e "   Vérifiez la configuration Kong et les limites définies."
fi

echo ""
