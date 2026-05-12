# `obs` — CLI Grafana Cloud pour agents Veridian

Agent-first CLI pour interroger les logs, metrics et traces dans Grafana Cloud,
**sans avoir à ouvrir l'UI**. Conçu pour être utilisé par les agents Claude (ops + applicatif)
et par Robert en ligne de commande.

## Install (depuis ce dossier)

```bash
cd ~/Bureau/veridian-platform-infra/grafana/cli
pipx install -e .
# OU avec pip --user :
pip install --user -e .
```

Le binaire `obs` est ensuite disponible globalement. Les credentials sont lus
depuis `~/credentials/.all-creds.env` (vars `GRAFANA_CLOUD_*` et `GRAFANA_STACK_SA_TOKEN`).

## Cookbook agent-first

### "Y a-t-il un container qui spam ?"
```bash
obs loops --since 1h --threshold 70
```
Liste les containers où > 70% des logs sont **la même classe de message** (= loop).

### "Quels containers sont les plus bruyants ?"
```bash
obs containers --since 1h
```

### "Donne-moi les erreurs récentes sur le hub"
```bash
obs errors hub --since 30m --dedup
```
`--dedup` regroupe par fingerprint → 1 ligne par classe d'erreur, pas 100 occurrences.

### "Quelles sont les classes de messages les plus fréquentes sur Notifuse ?"
```bash
obs top notifuse --since 1h --top 10
```

### "Cherche-moi un pattern précis dans les 6 dernières heures"
```bash
obs search "ECONNRESET|EHOSTUNREACH" --since 6h
```

### "Y a-t-il un pic anormal ?"
```bash
obs rate hub --since 6h --step 5m
```

### "État de la stack obs elle-même"
```bash
obs health
```

## Formats de sortie

Toutes les commandes acceptent `--format` (alias `-f`) :

- `table` (défaut) — table Rich lisible
- `json` — JSON indenté
- `ndjson` — 1 objet JSON par ligne (idéal pour pipe vers jq/agent)
- `csv` / `tsv` — pour Excel ou pipelines simples
- `raw` — valeurs brutes par ligne, sans header
- `silent` — affiche juste le count

## Architecture

```
cli/
├── pyproject.toml
├── README.md
└── obs/
    ├── __init__.py
    ├── main.py          ← Typer app + sous-commandes
    ├── config.py        ← chargement creds .all-creds.env
    ├── timeutil.py      ← parse_duration("1h"), unix↔ns
    ├── fingerprint.py   ← normalize() + reduce_logs() — déduplication
    ├── loki.py          ← client Loki via datasource proxy
    ├── prom.py          ← client Prometheus/Mimir
    ├── tempo.py         ← client Tempo
    └── output.py        ← rendu multi-format (table/json/ndjson/csv/...)
```

## Tests

```bash
cd cli && pytest tests/
```

## Limites connues

- Tempo : seule la query par traceID est implémentée (pas encore TraceQL).
- Pas de cache des credentials : chaque appel re-parse `.all-creds.env` (overhead négligeable).
- La déduplication client-side est limitée à `--fetch` lignes (1000 par défaut). Pour
  agréger sur des fenêtres énormes, prévoir d'augmenter `--fetch` ou faire plusieurs runs.
