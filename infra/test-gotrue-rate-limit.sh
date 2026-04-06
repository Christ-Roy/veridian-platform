#!/bin/bash
# ============================================================================
# TEST: GoTrue Rate Limiting - Reproduire le problème des vieux tokens
# ============================================================================
# Simule le scénario où des clients gardent leurs vieux tokens après restart
# et spamment GoTrue, causant un rate limiting qui bloque toute l'app.
# ============================================================================

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Config
DOMAIN="${DOMAIN:-dev.veridian.site}"
API_URL="https://api.${DOMAIN}"
ANON_KEY=$(grep ANON_KEY /home/ubuntu/app.veridian/infra/.env | cut -d= -f2)
TEST_REQUESTS="${1:-50}"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}TEST: GoTrue Rate Limiting - Vieux Tokens${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "📍 API URL: ${GREEN}${API_URL}${NC}"
echo -e "🔑 ANON_KEY: ${YELLOW}${ANON_KEY:0:20}...${NC}"
echo -e "📊 Test requests: ${GREEN}${TEST_REQUESTS}${NC}"
echo ""

# Compteurs
SUCCESS=0
RATE_LIMITED=0
INVALID_TOKEN=0
OTHER=0

echo -e "${YELLOW}🧪 Scénario 1: Requêtes avec token INVALIDE (simule vieux tokens)${NC}"
echo "=================================================="

FAKE_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNTE2MjM5MDIyfQ.INVALID"

for i in $(seq 1 $TEST_REQUESTS); do
  # Requête vers /auth/v1/user (nécessite un token valide)
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${API_URL}/auth/v1/user" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${FAKE_TOKEN}" 2>&1)

  STATUS=$(echo "$RESPONSE" | tail -1)

  case $STATUS in
    200)
      SUCCESS=$((SUCCESS + 1))
      echo -ne "${GREEN}✓${NC}"
      ;;
    401|403)
      # Token invalide (attendu)
      INVALID_TOKEN=$((INVALID_TOKEN + 1))
      echo -ne "${YELLOW}◯${NC}"
      ;;
    429)
      # RATE LIMITED - C'est ça le problème !
      RATE_LIMITED=$((RATE_LIMITED + 1))
      echo -ne "${RED}✗${NC}"
      ;;
    *)
      OTHER=$((OTHER + 1))
      echo -ne "${BLUE}?${NC}"
      ;;
  esac

  # Progress tous les 10
  if [ $((i % 10)) -eq 0 ]; then
    echo -ne " [$i/$TEST_REQUESTS]\n"
  fi

  sleep 0.1
done

echo ""
echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}RÉSULTATS - Scénario Vieux Tokens${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo -e "✅ Succès (200):           ${GREEN}${SUCCESS}${NC}"
echo -e "◯  Token invalide (401):    ${YELLOW}${INVALID_TOKEN}${NC} ${GREEN}(attendu)${NC}"
echo -e "❌ Rate Limited (429):     ${RED}${RATE_LIMITED}${NC} ${RED}(PROBLÈME!)${NC}"
echo -e "?  Autres erreurs:         ${BLUE}${OTHER}${NC}"
echo ""

if [ $RATE_LIMITED -gt 0 ]; then
  echo -e "${RED}⚠️  PROBLÈME DÉTECTÉ !${NC}"
  echo -e "GoTrue a rate limité après ${INVALID_TOKEN} requêtes avec token invalide"
  echo ""
  echo -e "${YELLOW}Diagnostic:${NC}"
  echo "  1. Vérifier quelle IP GoTrue voit (client ou serveur?)"
  echo "  2. Vérifier les limites GoTrue pour /auth/v1/user"
  echo "  3. Vérifier si GoTrue utilise Redis ou mémoire locale"
  echo ""
else
  echo -e "${GREEN}✅ Aucun rate limiting détecté${NC}"
  echo "GoTrue accepte les requêtes avec tokens invalides (retourne 401)"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${YELLOW}🧪 Scénario 2: Test depuis IP différentes${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Test si GoTrue voit vraiment les IPs différentes
echo "Test 1: Depuis ce serveur (IP serveur)"
RESPONSE1=$(curl -s -w "\n%{http_code}" \
  "${API_URL}/auth/v1/user" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${FAKE_TOKEN}" 2>&1)
STATUS1=$(echo "$RESPONSE1" | tail -1)

echo -e "  Status: ${STATUS1} ${YELLOW}(IP serveur: $(curl -s ifconfig.me))${NC}"

echo ""
echo "Test 2: Avec X-Forwarded-For simulé (IP client)"
RESPONSE2=$(curl -s -w "\n%{http_code}" \
  "${API_URL}/auth/v1/user" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${FAKE_TOKEN}" \
  -H "X-Forwarded-For: 8.8.8.8" 2>&1)
STATUS2=$(echo "$RESPONSE2" | tail -1)

echo -e "  Status: ${STATUS2} ${YELLOW}(IP simulée: 8.8.8.8)${NC}"

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${YELLOW}📊 Analyse des Logs Kong${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

echo "Dernières requêtes rate limitées par Kong:"
docker logs supabase-kong 2>&1 | grep -i "429\|rate" | tail -10 || echo "Aucune requête rate limitée par Kong"

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${YELLOW}📊 Vérification Redis${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

echo "Clés de rate limiting dans Redis:"
docker exec twenty-redis redis-cli -n 2 KEYS "ratelimit:*" 2>/dev/null || echo "Aucune clé trouvée"

echo ""
echo -e "${GREEN}✅ Test terminé !${NC}"
echo ""
echo -e "${YELLOW}Prochaines étapes:${NC}"
echo "  1. Si rate limiting détecté → GoTrue a des limites internes"
echo "  2. Vérifier les logs GoTrue pour voir quelle IP il voit"
echo "  3. Configurer GoTrue pour utiliser Redis (si possible)"
echo ""
