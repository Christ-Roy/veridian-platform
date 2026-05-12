terraform {
  required_version = ">= 1.8"

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.18"
    }
  }
}

# Provider Grafana stack (datasources, dashboards, folders, alerts, service accounts)
# Token: Service Account "claude-admin" (role Admin)
provider "grafana" {
  url  = var.grafana_stack_url
  auth = var.grafana_stack_sa_token
}
