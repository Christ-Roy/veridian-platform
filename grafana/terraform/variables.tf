variable "grafana_stack_url" {
  type        = string
  description = "URL du stack Grafana Cloud (ex https://brunon5robert.grafana.net)"
}

variable "grafana_stack_sa_token" {
  type        = string
  description = "Token Service Account 'claude-admin' (glsa_...). Sourced depuis ~/credentials/.all-creds.env"
  sensitive   = true
}

# Identifiants stack (utilisés pour les labels Alloy et les datasources)
variable "grafana_cloud_org_id" {
  type    = string
  default = "1764375"
}

variable "grafana_cloud_stack_id" {
  type    = string
  default = "1634921"
}

variable "grafana_cloud_region" {
  type    = string
  default = "prod-eu-central-0"
}
