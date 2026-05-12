# Grafana Cloud + Alloy + Traefik OTLP — cheatsheet Veridian

> Brief synthétique généré le 2026-05-12 à partir de la doc officielle Grafana 2026 (sources mirrorées dans ce dossier).
> Source du brief : agent de recherche `general-purpose` lancé depuis le worktree `veridian-platform-infra`.

## 1. Free tier — limites 2026

Hard-cap (au-delà = données droppées, pas de facturation surprise) :

| Ressource | Limite |
|---|---|
| Metrics (Mimir, séries actives) | 10 000 |
| Logs (Loki) | 50 GB / mois |
| Traces (Tempo) | 50 GB / mois |
| Profiles (Pyroscope) | 50 GB / mois |
| k6 load testing | 500 VUh |
| Utilisateurs org | 3 |
| Rétention toutes datasources | **14 jours** (non négociable en free) |
| Carte bancaire | Pas requise |

**Point d'attention Veridian** : les 10 000 séries metrics sont **tendues** dès qu'on active cadvisor (1 série par container × par metric × par label). Stratégie : whitelist explicite via `metric_relabel_configs` (keep ~30 metrics utiles : `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `container_network_*`).

## 2. Création compte — étapes Robert

1. **https://grafana.com/auth/sign-up/create-user/** — Email + mdp (ou OAuth Google/GitHub), pas de CB.
2. À la création du stack, choisir :
   - Nom du sous-domaine (`xxx.grafana.net`)
   - **Région : "EU (Frankfurt)" ou "EU (Belgium)"** (Paris n'existe pas chez eux, RGPD-friendly = obligatoire pour Veridian)
3. Une fois le stack créé :
   - Soit via wizard : **Home → Connections → Add new connection → "Hosted Prometheus / Loki / Tempo"** → "Generate now" → copier les 3 paires (URL + username numérique + token)
   - Soit access policy unique (recommandé) : **Home → Administration → Users and access → Cloud access policies → Create access policy** avec scopes `metrics:write`, `logs:write`, `traces:write` → générer un seul token réutilisable

⚠️ **Les URLs des endpoints dépendent du stack et de la région assignée** — toujours copier depuis le portail, pas deviner.

Format moderne post-2026 : `<service>-prod-<region>-<n>.grafana.net`, ex `logs-prod-eu-west-1.grafana.net`, `prometheus-prod-24-prod-eu-west-2.grafana.net`, `tempo-prod-10-prod-eu-west-2.grafana.net`.

→ Voir `grafana.com/docs/grafana-cloud/security-and-account-management/region-url-formats.md`.

### Clé API admin pour Claude (provisioning dashboards)

Les access policies servent à push data, pas à administrer les dashboards Grafana eux-mêmes. Pour ça il faut un **Service Account** dans le Grafana stack :

**Grafana stack → Administration → Service accounts → Add service account** → role `Admin` → **Add service account token** → copier le token.

→ Voir `grafana.com/docs/grafana-cloud/account-management/authentication-and-permissions/access-policies.md` (note sur les Service Accounts pour la Grafana HTTP API).

### Secrets à coller dans `~/credentials/.all-creds.env`

```bash
# Grafana Cloud — push data (Alloy)
GRAFANA_CLOUD_LOKI_URL=https://logs-prod-eu-west-X.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOKI_USER=
GRAFANA_CLOUD_LOKI_TOKEN=

GRAFANA_CLOUD_MIMIR_URL=https://prometheus-prod-XX-prod-eu-west-X.grafana.net/api/prom/push
GRAFANA_CLOUD_MIMIR_USER=
GRAFANA_CLOUD_MIMIR_TOKEN=

GRAFANA_CLOUD_TEMPO_URL=https://tempo-prod-XX-prod-eu-west-X.grafana.net/otlp
GRAFANA_CLOUD_TEMPO_USER=
GRAFANA_CLOUD_TEMPO_TOKEN=

# Grafana stack — administration (dashboards via API)
GRAFANA_CLOUD_STACK_URL=https://<xxx>.grafana.net
GRAFANA_CLOUD_SA_TOKEN=
```

## 3. Installation Alloy Ubuntu (v1.14.x stable, 2026)

```bash
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" \
  | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install -y alloy
sudo usermod -aG docker alloy   # pour lire /var/run/docker.sock
sudo systemctl enable --now alloy
sudo systemctl status alloy
alloy --version
```

Le package crée :
- User : `alloy`
- Service systemd : `alloy`
- Config : `/etc/alloy/config.alloy`
- UI debug : `http://127.0.0.1:12345`

→ Voir `grafana.com/docs/alloy/latest/set-up/install/linux.md`.

## 4. Squelette `/etc/alloy/config.alloy`

```alloy
// ---------- DOCKER LOGS → LOKI ----------
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "containers" {
  targets = []
  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }
  rule {
    source_labels = ["__meta_docker_container_log_stream"]
    target_label  = "stream"
  }
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_project"]
    target_label  = "compose_project"
  }
}

loki.source.docker "containers" {
  host          = "unix:///var/run/docker.sock"
  targets       = discovery.docker.containers.targets
  labels        = { host = sys.env("HOSTNAME"), env = "prod" }
  relabel_rules = discovery.relabel.containers.rules
  forward_to    = [loki.write.gcloud.receiver]
}

// Traefik access logs JSON via file tail
local.file_match "traefik" {
  path_targets = [{ __path__ = "/var/log/traefik/access.log" }]
}
loki.source.file "traefik" {
  targets    = local.file_match.traefik.targets
  forward_to = [loki.process.traefik.receiver]
}
loki.process "traefik" {
  stage.json {
    expressions = { status = "DownstreamStatus", method = "RequestMethod",
                    host = "RequestHost", router = "RouterName" }
  }
  stage.labels { values = { status = "", method = "", router = "" } }
  forward_to = [loki.write.gcloud.receiver]
}

loki.write "gcloud" {
  endpoint {
    url = sys.env("GCLOUD_LOKI_URL")
    basic_auth {
      username = sys.env("GCLOUD_LOKI_USER")
      password = sys.env("GCLOUD_LOKI_TOKEN")
    }
  }
}

// ---------- HOST METRICS → MIMIR ----------
prometheus.exporter.unix "host" {
  include_exporter_metrics = false
  disable_collectors       = ["ipvs", "infiniband"]
}
prometheus.scrape "host" {
  targets         = prometheus.exporter.unix.host.targets
  forward_to      = [prometheus.remote_write.gcloud.receiver]
  scrape_interval = "60s"
}

// ---------- DOCKER METRICS → MIMIR ----------
prometheus.exporter.cadvisor "docker" {
  docker_host      = "unix:///var/run/docker.sock"
  storage_duration = "5m"
}
prometheus.scrape "docker" {
  targets         = prometheus.exporter.cadvisor.docker.targets
  forward_to      = [prometheus.remote_write.gcloud.receiver]
  scrape_interval = "60s"
}

prometheus.remote_write "gcloud" {
  endpoint {
    url = sys.env("GCLOUD_MIMIR_URL")
    basic_auth {
      username = sys.env("GCLOUD_MIMIR_USER")
      password = sys.env("GCLOUD_MIMIR_TOKEN")
    }
  }
}

// ---------- TRACES (OTLP de Traefik) → TEMPO ----------
otelcol.receiver.otlp "traefik" {
  grpc { endpoint = "0.0.0.0:4317" }
  http { endpoint = "0.0.0.0:4318" }
  output { traces = [otelcol.processor.batch.default.input] }
}
otelcol.processor.batch "default" {
  output { traces = [otelcol.exporter.otlphttp.gcloud.input] }
}
otelcol.exporter.otlphttp "gcloud" {
  client {
    endpoint = sys.env("GCLOUD_TEMPO_URL")
    auth     = otelcol.auth.basic.gcloud.handler
  }
}
otelcol.auth.basic "gcloud" {
  username = sys.env("GCLOUD_TEMPO_USER")
  password = sys.env("GCLOUD_TEMPO_TOKEN")
}
```

**Secrets via drop-in systemd** :
```bash
sudo systemctl edit alloy
# Ajouter :
[Service]
EnvironmentFile=/etc/alloy/gcloud.env
```

## 5. Traefik 3.x → OTLP vers Alloy

**Static config** (`traefik.yml`) :
```yaml
tracing:
  serviceName: "traefik"
  sampleRate: 1.0
  resourceAttributes:
    deployment.environment: "prod"
    host.name: "vps-ovh"
  otlp:
    grpc:
      endpoint: "alloy:4317"
      insecure: true
```

**Équivalent CLI / compose** :
```
--tracing=true
--tracing.serviceName=traefik
--tracing.sampleRate=1.0
--tracing.otlp.grpc.endpoint=alloy:4317
--tracing.otlp.grpc.insecure=true
```

**Env vars** : `TRAEFIK_TRACING_SERVICENAME`, `TRAEFIK_TRACING_SAMPLERATE`, `TRAEFIK_TRACING_OTLP_GRPC_ENDPOINT`, `TRAEFIK_TRACING_OTLP_GRPC_INSECURE`.

Pour que Traefik atteigne Alloy : soit Alloy aussi en container sur `dokploy-network` (port 4317 exposé), soit Alloy sur l'hôte et Traefik avec `extra_hosts: ["host.docker.internal:host-gateway"]` + endpoint `host.docker.internal:4317`.

→ Voir `doc.traefik.io/traefik/reference/install-configuration/observability/tracing.html`.

## Points incertains / à valider live

- **URLs exactes des endpoints** : à récupérer du portail Grafana après création.
- **cadvisor exporter** : peut exploser 10k séries free tier — whitelist obligatoire. Alternative : `prometheus.exporter.docker` (metrics Docker daemon, beaucoup moins de séries).
- **Traefik access logs** : Traefik doit déjà écrire l'accessLog JSON dans un volume monté, et ce volume doit aussi être visible côté Alloy.
- **Tempo OTLP HTTP** vs gRPC : HTTP plus simple (port 443 + basic auth), gRPC OK aussi.

## Sources

- [Free Tier](https://grafana.com/products/cloud/free-tier/)
- [Pricing](https://grafana.com/pricing/)
- [Usage limits](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/manage-invoices/understand-your-invoice/usage-limits/)
- [Region URL formats](https://grafana.com/docs/grafana-cloud/security-and-account-management/region-url-formats/)
- [Install Alloy on Linux](https://grafana.com/docs/alloy/latest/set-up/install/linux/)
- [Monitor Docker containers with Alloy](https://grafana.com/docs/alloy/latest/monitor/monitor-docker-containers/)
- [Traefik 3 tracing reference](https://doc.traefik.io/traefik/reference/install-configuration/observability/tracing/)
