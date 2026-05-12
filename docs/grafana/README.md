# Doc Grafana — mirror local

Doc officielle Grafana + Traefik observability mirrorée en local pour usage hors-ligne et référence rapide. Récupérée le **2026-05-12** depuis grafana.com (markdown raw via suffixe `.md` sur les URLs) et doc.traefik.io (HTML, pas de .md exposé).

## Comment relancer un mirror frais

```bash
./.meta/mirror.sh   # télécharge les .md/.html selon urls.txt
./.meta/clean.sh    # nettoie les artefacts de rendu (Copy icon, "Expand table")
```

- `.meta/urls.txt` — liste des URLs sources
- `.meta/mirror.log` — résultat du dernier run (taille, status)
- `.meta/mirror.sh` — script idempotent (relance OK)
- `.meta/clean.sh` — passe sed pour rendre les .md exploitables

## Arbo

```
docs/grafana/
├── CHEATSHEET.md                       ← Brief synthétique (free tier, install, config)
├── grafana.com/docs/
│   ├── alloy/latest/                   ← Agent Alloy 1.14 (install, components Loki/Prom/OTLP)
│   └── grafana-cloud/                  ← Compte Cloud, access policies, endpoints région, free tier
└── doc.traefik.io/traefik/             ← Traefik 3.x observability (tracing OTLP, access logs, metrics)
```

## Pour comprendre rapidement

1. Lire `CHEATSHEET.md` (résumé en 5 sections : free tier, compte, install, config Alloy, Traefik OTLP)
2. Pour un composant Alloy précis : `grafana.com/docs/alloy/latest/reference/components/<famille>/<composant>.md`
3. Pour les endpoints région : `grafana.com/docs/grafana-cloud/security-and-account-management/region-url-formats.md`
4. Pour les limites free tier : `grafana.com/docs/grafana-cloud/cost-management-and-billing/manage-invoices/understand-your-invoice/usage-limits.md`
