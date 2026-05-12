#!/usr/bin/env bash
# Wrapper OpenTofu pour le module grafana/.
# Charge UNIQUEMENT les vars Grafana depuis ~/credentials/.all-creds.env
# (`grep + parse` plutôt que `source`, pour éviter les ennuis avec les
# lignes mal-quotées du reste du fichier).
#
# Usage :
#   ./scripts/tofu-wrap.sh init
#   ./scripts/tofu-wrap.sh plan
#   ./scripts/tofu-wrap.sh apply
#   ./scripts/tofu-wrap.sh refresh

set -euo pipefail

CREDS="$HOME/credentials/.all-creds.env"
if [[ ! -f "$CREDS" ]]; then
  echo "ERREUR : $CREDS introuvable" >&2
  exit 1
fi

read_var() {
  local name="$1"
  # Pas de `source` — on lit la dernière définition de la var dans le fichier.
  # Format attendu : VAR=value (sans quotes, sans espaces autour de =).
  grep -E "^${name}=" "$CREDS" | tail -1 | cut -d'=' -f2- | sed 's/^ *//; s/ *$//; s/^"//; s/"$//'
}

export TF_VAR_grafana_stack_url="$(read_var GRAFANA_CLOUD_STACK_URL)"
export TF_VAR_grafana_stack_sa_token="$(read_var GRAFANA_STACK_SA_TOKEN)"
export TF_VAR_grafana_cloud_org_id="$(read_var GRAFANA_CLOUD_ORG_ID)"
export TF_VAR_grafana_cloud_stack_id="$(read_var GRAFANA_CLOUD_STACK_ID)"
export TF_VAR_grafana_cloud_region="$(read_var GRAFANA_CLOUD_REGION)"

if [[ -z "${TF_VAR_grafana_stack_sa_token}" || "${TF_VAR_grafana_stack_sa_token}" != glsa_* ]]; then
  echo "ERREUR : GRAFANA_STACK_SA_TOKEN absent ou invalide dans $CREDS" >&2
  echo "         (attendu : commence par 'glsa_')" >&2
  exit 1
fi

cd "$(dirname "$0")/../terraform"
exec tofu "$@"
