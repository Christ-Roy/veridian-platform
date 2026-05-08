#!/usr/bin/env bash
# Usage: ./e2e/run-headed.sh [spec]
#
# Lance les e2e en mode head-full (navigateur visible, browser ralenti)
# pour debug visuel — utile quand un spec passe en CI mais qu'on veut
# voir ce qu'il se passe à l'écran.
#
# Exemples:
#   ./e2e/run-headed.sh                                    # smoke prod
#   ./e2e/run-headed.sh e2e/core/global-full-flow.spec.ts # full flow
#   PROSPECTION_URL=http://localhost:3000 ./e2e/run-headed.sh

set -euo pipefail

SPEC="${1:-e2e/core/prod-smoke.spec.ts}"
URL="${PROSPECTION_URL:-https://prospection.app.veridian.site}"

echo "Lance $SPEC contre $URL en mode head-full"
echo

PROSPECTION_URL="$URL" \
  npx playwright test "$SPEC" \
    --project=chromium \
    --headed \
    --reporter=list \
    --workers=1
