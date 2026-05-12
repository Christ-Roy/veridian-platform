# Dashboards Veridian — provisionnés via Tofu, source de vérité dans /dashboards/*.json
#
# Workflow pour éditer :
#   1. Édite le .json directement (templates Grafana)
#   2. `./scripts/tofu-wrap.sh apply` — push la nouvelle version
#
# Workflow pour récupérer un dashboard fait dans l'UI :
#   1. Dans Grafana UI → Settings → JSON Model → copier
#   2. Coller dans dashboards/<name>.json
#   3. apply

resource "grafana_dashboard" "infra_overview" {
  folder       = grafana_folder.infra.uid
  config_json  = file("${path.module}/dashboards/infra-overview.json")
  overwrite    = true
}

resource "grafana_dashboard" "errors_explorer" {
  folder       = grafana_folder.infra.uid
  config_json  = file("${path.module}/dashboards/errors-explorer.json")
  overwrite    = true
}

resource "grafana_dashboard" "traefik_overview" {
  folder       = grafana_folder.infra.uid
  config_json  = file("${path.module}/dashboards/traefik-overview.json")
  overwrite    = true
}

output "dashboard_urls" {
  description = "URLs cliquables des dashboards provisionnés"
  value = {
    infra_overview   = grafana_dashboard.infra_overview.url
    errors_explorer  = grafana_dashboard.errors_explorer.url
    traefik_overview = grafana_dashboard.traefik_overview.url
  }
}
