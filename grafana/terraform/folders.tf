# Folders pour ranger les dashboards par périmètre.
# Création idempotente : si le folder existe déjà, OpenTofu fait juste un refresh.

resource "grafana_folder" "infra" {
  title = "Veridian — Infra"
}

resource "grafana_folder" "saas" {
  title = "Veridian — SaaS"
}

resource "grafana_folder" "incidents" {
  title = "Veridian — Incidents & alertes"
}
