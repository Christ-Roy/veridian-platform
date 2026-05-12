# Observabilité Veridian — Grafana Cloud

Stack obs (logs + metrics + traces) packagée comme du code, versionnée dans ce dossier.

## Quick facts

- **Vendor** : Grafana Cloud free tier (50 GB/mois, 14j rétention, EU Suisse 🇨🇭)
- **Stack URL** : https://brunon5robert.grafana.net
- **Agents** : Grafana Alloy v1.16.1 installé sur PROD VPS (vps-10f2bc7c) + dev-server
- **IaC** : OpenTofu (provider `grafana/grafana`), state local + commit
- **CLI agent-first** : `obs` (Python + Typer + Rich), installé via `pipx install -e ./cli`

## Architecture

```
                       ┌──────────────────────────────────┐
                       │   brunon5robert.grafana.net      │
                       │   (Grafana 13.1.0, EU central)   │
                       │   ↗ Loki  ↗ Mimir  ↗ Tempo       │
                       └────────────┬─────────────────────┘
                                    │ HTTPS
            ┌───────────────────────┼───────────────────────┐
            │                                                │
    ┌───────▼───────┐                                ┌───────▼───────┐
    │  Alloy v1.16  │                                │  Alloy v1.16  │
    │  PROD VPS     │                                │  Dev Server   │
    │  vps-10f2bc7c │                                │  dev-server   │
    └───────┬───────┘                                └───────┬───────┘
            │                                                │
    ┌───────▼─────────────┐                          ┌───────▼─────────────┐
    │ Docker logs (34c.)  │                          │ Docker logs         │
    │ Host metrics (CPU…) │                          │ Host metrics        │
    │ cAdvisor (per ct.)  │                          │ cAdvisor            │
    │ Traefik access log  │                          │ (pas de Traefik)    │
    │ OTLP receiver :4317 │                          │ OTLP receiver       │
    └─────────────────────┘                          └─────────────────────┘
```

## Layout

```
grafana/
├── README.md                ← ce fichier
├── terraform/               ← IaC OpenTofu (folders, datasources, dashboards, alerts)
│   ├── main.tf              ← provider grafana/grafana 3.25
│   ├── variables.tf         ← inputs (URL stack, SA token)
│   ├── folders.tf           ← 3 folders : Infra, SaaS, Incidents
│   ├── terraform.tfvars.example
│   ├── terraform.tfstate    ← committé, pas de secret dedans
│   └── .gitignore
├── alloy/
│   └── config.alloy.tmpl    ← template config Alloy (rendered per host)
├── scripts/
│   ├── tofu-wrap.sh         ← wrapper qui injecte les creds en TF_VAR_*
│   └── deploy-alloy.sh      ← install/update Alloy sur VPS distant, idempotent
└── cli/                     ← CLI Python `obs`
    ├── pyproject.toml
    ├── README.md            ← doc usage du CLI
    └── obs/                 ← package source
```

## Workflow

### Installer le CLI obs (1 fois par machine)

```bash
cd grafana/cli
pipx install -e .
obs --help          # vérifie que ça marche
obs health          # vérifie que la stack reçoit bien les data
```

### Modifier la config Alloy

1. Édite `alloy/config.alloy.tmpl`
2. Redéploie : `./scripts/deploy-alloy.sh prod-pub prod && ./scripts/deploy-alloy.sh dev-pub dev`
3. Vérifie : `obs health` puis `obs containers --since 5m`

### Ajouter un dashboard / un folder / une alerte

1. Édite les `.tf` dans `terraform/`
2. `./scripts/tofu-wrap.sh plan` → relis le diff
3. `./scripts/tofu-wrap.sh apply`
4. Commit le `.tf` modifié + `terraform.tfstate` mis à jour

### Ajouter une VPS au monitoring

```bash
./scripts/deploy-alloy.sh <ssh-target> <env-label>
# Ex: ./scripts/deploy-alloy.sh new-vps prod
```

Le script est idempotent : il install Alloy si absent, sinon il met juste la config à jour.

## Credentials

Tous lus depuis `~/credentials/.all-creds.env` (non commité, synchronisé Syncthing) :

| Variable | Usage |
|---|---|
| `GRAFANA_CLOUD_STACK_URL` | URL stack (https://brunon5robert.grafana.net) |
| `GRAFANA_STACK_SA_TOKEN` | Service Account "claude-admin" (role Admin), API stack |
| `GRAFANA_CLOUD_TOKEN` | Cloud Access Policy "cc-cc", push data |
| `GRAFANA_CLOUD_LOKI_USER` | Tenant ID Loki (1592708) |
| `GRAFANA_CLOUD_MIMIR_USER` | Tenant ID Mimir (3194066) |
| `GRAFANA_CLOUD_TEMPO_USER` | Tenant ID Tempo (1587009) |
| `GRAFANA_CLOUD_LOKI_URL` | Endpoint Loki push |
| `GRAFANA_CLOUD_MIMIR_URL` | Endpoint Mimir push |
| `GRAFANA_CLOUD_TEMPO_URL` | Endpoint Tempo push |
| `GRAFANA_CLOUD_OTLP_URL` | OTLP gateway unifié (pour Traefik tracing) |

## Pour aller plus loin

- **Tracing Traefik** : à activer (P0.2 — modifier compose Dokploy + redeploy Traefik)
- **Dashboards** : à provisionner via `terraform/dashboards/*.tf` (voir cookbook README/cli/)
- **Alertes** : Telegram via `grafana_contact_point` + `grafana_rule_group`

## Documentation officielle

Mirror local dans `../docs/grafana/` (.md raw + .html pour Traefik).
