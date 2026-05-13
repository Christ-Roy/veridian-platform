# IaC infra — index

> Source de vérité versionnée pour les composants infra Veridian non gérés par
> Dokploy (Traefik, fail2ban, CrowdSec côté config). Dokploy reste source pour
> les composes app-level (cf `infra/CLAUDE.md`).

## Layout actuel

```
infra/
├── traefik/                          # Traefik reverse proxy (vs Dokploy stack)
│   ├── traefik.yml                   # Config statique (plugins, entryPoints, trustedIPs)
│   └── dynamic/                      # Config dynamique (routers, middlewares, services)
│       ├── crowdsec-middleware.yml   # Plugin CrowdSec stream (P0.4 ✅)
│       ├── dokploy.yml               # Routers Dokploy UI (3 routers actuels)
│       ├── dokploy.yml.draft-p0.6-lockdown  # Draft P0.6 (1 router + ipAllowList)
│       ├── internal-security.yml     # Middleware tailscale-only (référencé nulle part actuellement)
│       ├── middlewares.yml           # redirect-to-https
│       ├── green-wildcard.yml        # Wildcard *.green.app.veridian.site (blue/green tests)
│       └── twenty-wildcard.yml       # Wildcard Twenty multi-workspace
│
├── crowdsec/                         # CrowdSec LAPI + agent
│   ├── compose.yml                   # Service crowdsec v1.7.7 (PAS encore Dokploy)
│   ├── whitelists.yaml               # Parser s02-enrich allowlist Veridian
│   └── README.md
│
├── fail2ban/                         # Container fail2ban (draft P0.5)
│   ├── compose.yml                   # linuxserver/fail2ban network_mode=host
│   ├── jail.local                    # 5 jails (sshd, sshd-aggressive, sshd-alt, traefik-auth, dokploy-login)
│   ├── filter/                       # Filtres custom (traefik-auth.conf, dokploy-login.conf)
│   ├── action/                       # docker-action.conf (legacy)
│   └── README.md
│
├── scripts/
│   ├── apply-traefik.sh              # Sync infra/traefik/ → prod + envsubst + restart
│   ├── crowdsec-apply-allowlist.sh   # Sync whitelists.yaml → CrowdSec + SIGHUP
│   ├── trivy-scan-prod.sh            # Scan images Docker prod (P1.1 draft)
│   ├── backup-postgres.sh            # Backup DBs vers R2 (P0.1 ✅)
│   ├── restore-db.sh                 # Restore depuis R2 dans Postgres temp
│   ├── test-restore-monthly.sh       # Test restore mensuel (cron Dokploy)
│   ├── check-traefik-unique-host.sh  # Anti-collision dual-router (P0.0)
│   ├── dokploy-recreate-stack.sh     # Wrapper Dokploy API
│   └── ... (legacy : cleanup-docker, backup-secrets, etc.)
│
├── docker-compose*.yml               # Composes Veridian apps (Dokploy)
└── CLAUDE.md                         # Règles spécifiques à ce dossier
```

## Source de vérité par composant

| Composant | Source de vérité | Apply via |
|---|---|---|
| Traefik (reverse proxy) | `infra/traefik/` | `infra/scripts/apply-traefik.sh` |
| CrowdSec allowlist | `infra/crowdsec/whitelists.yaml` | `infra/scripts/crowdsec-apply-allowlist.sh` |
| CrowdSec compose | `infra/crowdsec/compose.yml` (draft) | Dokploy UI (TODO) |
| fail2ban | `infra/fail2ban/` (draft) | Dokploy UI (TODO) |
| Apps SaaS | `docker-compose*.yml` (root) | Dokploy UI (cf `CLAUDE.md`) |
| Monitoring host | `/opt/veridian/monitoring/` sur chaque host | `install.sh` (pas auto) |
| Grafana Cloud | `grafana/alloy/`, `grafana/terraform/` | `grafana/scripts/` |

## Secrets

**JAMAIS** de secret en clair. Patterns acceptés :
- `${VAR_NAME}` interpolation dans les composes → résolu par Dokploy ENV au deploy
- `${VAR_NAME}` dans les YAML Traefik → résolu par `apply-traefik.sh` via envsubst
  depuis `~/credentials/.all-creds.env` (local Robert) ou Dokploy ENV (CI)

Source de vérité valeurs : `~/credentials/.all-creds.env` (synchronisé Syncthing
entre les 3 machines Robert). En prod, les valeurs vivent dans Dokploy ENV pour
chaque stack. **Tout drift doit être corrigé via le `.env` local** (qui est la
référence).

## Cron / scheduled jobs

Pas de cron système ad hoc. Tout passe par :
- **Dokploy Schedule Jobs** (UI Dokploy) — backups DB, trivy scan, restore tests
- **systemd timers** uniquement pour le monitoring `/opt/veridian/monitoring/`
- **GitHub Actions** pour le CI/CD

## Onboarding agent

Lis dans cet ordre :
1. `CLAUDE.md` racine (vision) → `infra/CLAUDE.md` (règles ici)
2. `infra/IAC-INDEX.md` (ce fichier) — quoi est où
3. `todo/infra/TODO.md` — chantiers ouverts
4. `runbooks/incidents/*.md` si incident en cours
5. `runbooks/standards/*.md` (naming, healthchecks, tags) avant tout nouveau service
