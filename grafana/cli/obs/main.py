"""
obs — Agent-first CLI pour Grafana Cloud (logs, metrics, traces) Veridian.

Conçu pour :
- Les agents Claude (ops + applicatif) qui veulent diagnostiquer une app
  sans ouvrir l'UI Grafana.
- Toi en ligne de commande quand tu veux un check rapide.

Toutes les sous-commandes acceptent `--format {table|json|ndjson|csv|tsv|raw|silent}`
pour adapter la sortie à l'usage.

Voir `obs <commande> --help` pour le détail de chaque commande.
"""

from __future__ import annotations

import re
import sys
from typing import Annotated, Optional

import typer
from rich.console import Console

from .config import load_config
from .fingerprint import normalize, reduce_logs
from .loki import LokiClient, LogEntry
from .output import OutputFormat, console, error_console, print_kv, render
from .prom import PromClient
from .tempo import TempoClient
from .timeutil import parse_duration, to_short_time

app = typer.Typer(
    name="obs",
    help=__doc__,
    no_args_is_help=True,
    rich_markup_mode="rich",
    pretty_exceptions_show_locals=False,
)


# ============================================================================
# logs — fetch et affiche les logs bruts (dernières lignes en date)
# ============================================================================


@app.command(
    "logs",
    help="""Fetch les logs récents d'un ou plusieurs containers.

[bold]Exemples :[/bold]

  obs logs hub-prod --since 30m
  obs logs prospection --since 2h --level error --limit 100
  obs logs ".*twenty.*" --regex "panic|fatal" --format ndjson
  obs logs --env prod --limit 200 --truncate 300
""",
)
def cmd_logs(
    pattern: Annotated[
        Optional[str],
        typer.Argument(help="Pattern container (substring ou regex). Vide = tous."),
    ] = None,
    since: Annotated[str, typer.Option("--since", "-s", help="Durée passée (30s/15m/1h/2d).")] = "1h",
    limit: Annotated[int, typer.Option("--limit", "-n", help="Nombre max de lignes.")] = 50,
    env: Annotated[Optional[str], typer.Option(help="Filtre env (prod / dev / local).")] = None,
    level: Annotated[
        Optional[str],
        typer.Option(help="Filtre niveau (error / warn / info...). Match insensible à la casse."),
    ] = None,
    regex: Annotated[
        Optional[str],
        typer.Option(help="Regex Loki à appliquer au content (|~ syntax)."),
    ] = None,
    truncate: Annotated[int, typer.Option(help="Tronque chaque ligne à N chars (0 = aucun).")] = 250,
    fmt: Annotated[
        OutputFormat, typer.Option("--format", "-f", help="Format de sortie.")
    ] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)

    with LokiClient(cfg) as loki:
        entries = loki.fetch_logs(
            container_pattern=pattern,
            since_seconds=since_s,
            limit=limit,
            env=env,
            level_filter=level,
            regex_filter=regex,
        )

    rows = []
    for e in entries:
        line = e.line.rstrip()
        if truncate and len(line) > truncate:
            line = line[:truncate] + "…"
        rows.append(
            {
                "time": to_short_time(e.timestamp_unix),
                "host": e.host,
                "container": e.container,
                "line": line,
            }
        )

    render(rows, ["time", "host", "container", "line"], fmt, title=f"logs ({len(rows)})")


# ============================================================================
# top — top N classes de messages dans un set de containers (DÉDUPLICATION)
# ============================================================================


@app.command(
    "top",
    help="""Top N [bold]classes de messages[/bold] (déduplication via fingerprint).

Permet d'identifier instantanément les containers qui spamment la même ligne
en boucle. Affiche un échantillon, la version normalisée (variables → <num>,
<ts>, <uuid>...), le count total et la répartition par container.

[bold]Exemples :[/bold]

  obs top notifuse --since 1h --top 10
  obs top --env prod --since 30m
  obs top hub --since 6h --format json
""",
)
def cmd_top(
    pattern: Annotated[
        Optional[str], typer.Argument(help="Pattern container. Vide = tous.")
    ] = None,
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    top: Annotated[int, typer.Option("--top", "-t", help="Top N classes affichées.")] = 20,
    fetch: Annotated[
        int,
        typer.Option(
            help="Lignes à récupérer côté Loki pour faire l'analyse "
            "(plus grand = plus précis mais plus lent ; max 5000)."
        ),
    ] = 1000,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    level: Annotated[Optional[str], typer.Option(help="Filtre niveau.")] = None,
    truncate: Annotated[int, typer.Option(help="Tronque sample/normalized à N chars.")] = 200,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    fetch = min(fetch, 5000)

    with LokiClient(cfg) as loki:
        entries = loki.fetch_logs(
            container_pattern=pattern,
            since_seconds=since_s,
            limit=fetch,
            env=env,
            level_filter=level,
        )

    if not entries:
        error_console.print("(aucun log trouvé)")
        raise typer.Exit(0)

    triples = [(e.timestamp_unix, e.container, e.line) for e in entries]
    classes = reduce_logs(triples)[:top]

    rows = []
    for c in classes:
        sample = c.sample[:truncate] + ("…" if len(c.sample) > truncate else "")
        norm = c.normalized[:truncate] + ("…" if len(c.normalized) > truncate else "")
        containers_str = ", ".join(
            f"{k}:{v}" for k, v in c.containers.most_common(3)
        )
        if len(c.containers) > 3:
            containers_str += f" (+{len(c.containers) - 3})"
        rows.append(
            {
                "count": c.count,
                "fingerprint": c.fingerprint,
                "containers": containers_str,
                "normalized": norm,
                "sample": sample,
            }
        )

    title = (
        f"Top {len(rows)} classes (analysées sur {len(entries)} lignes, "
        f"{len(classes) + (top if len(rows) == top else 0)} classes uniques détectées)"
    )
    render(rows, ["count", "fingerprint", "containers", "normalized", "sample"], fmt, title=title)


# ============================================================================
# loops — détecte les containers qui spamment une même ligne
# ============================================================================


@app.command(
    "loops",
    help="""Détecte les loops : containers où UNE classe de message domine anormalement.

Pour chaque container, fetch les logs, calcule la classe la plus fréquente,
flag si elle dépasse --threshold% du total ET un seuil absolu.

[bold]Exemples :[/bold]

  obs loops --since 1h
  obs loops --env prod --threshold 80 --min-count 200
""",
)
def cmd_loops(
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    threshold: Annotated[
        float,
        typer.Option(help="% min de logs occupés par la classe dominante."),
    ] = 70.0,
    min_count: Annotated[
        int, typer.Option(help="Count absolu min pour flag.")
    ] = 100,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    fetch_per_container: Annotated[
        int,
        typer.Option(help="Lignes à analyser par container."),
    ] = 500,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)

    with LokiClient(cfg) as loki:
        # 1. Liste les containers qui ont du volume
        volumes = loki.container_volumes(since_seconds=since_s, env=env)

        # 2. Pour chaque container avec volume > min_count, fetch + dédup
        rows = []
        for host, env_lbl, container, total in volumes:
            if total < min_count:
                continue
            # Match exact via label container= (pas regex) — plus rapide et évite les
            # tracas RE2 sur certains noms de containers
            logql = f'{{container="{container}"}}'
            entries = loki.query_range(
                logql,
                since_seconds=since_s,
                limit=fetch_per_container,
            )
            if not entries:
                continue
            triples = [(e.timestamp_unix, e.container, e.line) for e in entries]
            classes = reduce_logs(triples)
            if not classes:
                continue
            top_class = classes[0]
            top_pct = (top_class.count / len(entries)) * 100
            if top_pct >= threshold:
                rows.append(
                    {
                        "container": container,
                        "host": host,
                        "env": env_lbl,
                        "total_logs_period": total,
                        "top_class_pct": f"{top_pct:.0f}%",
                        "top_class_count": top_class.count,
                        "top_class_normalized": top_class.normalized[:200],
                    }
                )

    rows.sort(key=lambda r: r["total_logs_period"], reverse=True)
    render(
        rows,
        ["container", "host", "env", "total_logs_period", "top_class_pct", "top_class_count", "top_class_normalized"],
        fmt,
        title=f"Loops détectées (threshold≥{threshold:.0f}%, min_count≥{min_count})",
    )


# ============================================================================
# errors — agrège les lignes contenant des patterns d'erreur
# ============================================================================


@app.command(
    "errors",
    help="""Compte les lignes d'erreur par container.

Match les lignes contenant : error / panic / fatal / exception / traceback /
unhandled / 5xx (case-insensitive). Si --dedup, regroupe par fingerprint.

[bold]Exemples :[/bold]

  obs errors --since 1h
  obs errors hub --since 30m --dedup
""",
)
def cmd_errors(
    pattern: Annotated[
        Optional[str], typer.Argument(help="Pattern container.")
    ] = None,
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    dedup: Annotated[
        bool, typer.Option("--dedup", help="Regroupe par fingerprint.")
    ] = False,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    fetch: Annotated[int, typer.Option(help="Lignes à analyser.")] = 1000,
    truncate: Annotated[int, typer.Option(help="Tronque sample.")] = 200,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    # Regex Loki LogQL : pas de \b (Loki RE2). On ratisse large sur les mots-clés textuels.
    err_regex = "(?i)(error|panic|fatal|exception|traceback|unhandled)"

    with LokiClient(cfg) as loki:
        entries = loki.fetch_logs(
            container_pattern=pattern,
            since_seconds=since_s,
            limit=fetch,
            env=env,
            regex_filter=err_regex,
        )

    if not entries:
        error_console.print("(aucune erreur détectée)")
        raise typer.Exit(0)

    if dedup:
        triples = [(e.timestamp_unix, e.container, e.line) for e in entries]
        classes = reduce_logs(triples)
        rows = []
        for c in classes:
            containers_str = ", ".join(f"{k}:{v}" for k, v in c.containers.most_common(3))
            rows.append(
                {
                    "count": c.count,
                    "fingerprint": c.fingerprint,
                    "containers": containers_str,
                    "normalized": c.normalized[:truncate],
                }
            )
        render(rows, ["count", "fingerprint", "containers", "normalized"], fmt,
               title=f"Erreurs dédupliquées ({len(entries)} lignes → {len(classes)} classes)")
    else:
        # Mode aggregate par container
        from collections import Counter

        per_container = Counter(e.container for e in entries)
        rows = [{"count": c, "container": cn} for cn, c in per_container.most_common()]
        render(rows, ["count", "container"], fmt,
               title=f"Erreurs par container ({len(entries)} lignes total)")


# ============================================================================
# containers — liste les containers vus avec volume
# ============================================================================


@app.command(
    "containers",
    help="""Liste tous les containers vus par Loki avec leur volume de logs.

[bold]Exemples :[/bold]

  obs containers --since 1h --env prod
  obs containers --since 24h --format csv
""",
)
def cmd_containers(
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    with LokiClient(cfg) as loki:
        rows_tuples = loki.container_volumes(since_seconds=since_s, env=env)

    rows = [
        {"logs": v, "host": h, "env": e, "container": c} for h, e, c, v in rows_tuples
    ]
    render(rows, ["logs", "host", "env", "container"], fmt,
           title=f"Containers ({len(rows)}) — volume sur {since}")


# ============================================================================
# search — cherche un motif partout
# ============================================================================


@app.command(
    "search",
    help="""Cherche un motif (regex) dans tous les logs (ou filtré par container/env).

[bold]Exemples :[/bold]

  obs search "Stripe webhook" --since 6h
  obs search "ECONNRESET" --since 1h --env prod
""",
)
def cmd_search(
    regex: Annotated[str, typer.Argument(help="Regex (RE2 Loki) à matcher.")],
    container: Annotated[Optional[str], typer.Option(help="Filtre container.")] = None,
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    limit: Annotated[int, typer.Option("--limit", "-n")] = 100,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    truncate: Annotated[int, typer.Option(help="Tronque chaque ligne.")] = 300,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    with LokiClient(cfg) as loki:
        entries = loki.fetch_logs(
            container_pattern=container,
            since_seconds=since_s,
            limit=limit,
            env=env,
            regex_filter=regex,
        )

    rows = []
    for e in entries:
        line = e.line.rstrip()
        if truncate and len(line) > truncate:
            line = line[:truncate] + "…"
        rows.append(
            {
                "time": to_short_time(e.timestamp_unix),
                "container": e.container,
                "line": line,
            }
        )
    render(rows, ["time", "container", "line"], fmt,
           title=f"Match '{regex}' ({len(rows)})")


# ============================================================================
# rate — courbe de volume de logs sur la période
# ============================================================================


@app.command(
    "rate",
    help="""Affiche le nombre de logs par tranche de temps (pour détecter les pics).

[bold]Exemples :[/bold]

  obs rate --since 6h --step 5m
  obs rate hub --since 1h --step 1m
""",
)
def cmd_rate(
    pattern: Annotated[Optional[str], typer.Argument(help="Pattern container.")] = None,
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    step: Annotated[str, typer.Option("--step", help="Tranche (1m, 5m, 1h).")] = "5m",
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    step_s = parse_duration(step)

    selectors = ['container=~".+"']
    if pattern:
        if any(c in pattern for c in ".*+|()[]"):
            selectors = [f'container=~"{pattern}"']
        else:
            selectors = [f'container=~".*{pattern}.*"']
    if env:
        selectors.append(f'env="{env}"')
    selector = "{" + ",".join(selectors) + "}"
    logql = f"sum(count_over_time({selector}[{step}]))"

    with LokiClient(cfg) as loki:
        params = {
            "query": logql,
            "start": str(int(__import__("time").time()) - since_s),
            "end": str(int(__import__("time").time())),
            "step": str(step_s),
        }
        r = loki._client.get("/loki/api/v1/query_range", params=params)
        r.raise_for_status()
        result = r.json().get("data", {}).get("result", [])

    if not result:
        error_console.print("(aucune data)")
        raise typer.Exit(0)

    series = result[0]
    rows = []
    max_v = max((int(float(v)) for _, v in series.get("values", [])), default=1)
    for ts_str, val in series.get("values", []):
        v = int(float(val))
        bar = "█" * min(50, int(v * 50 / max(max_v, 1)))
        rows.append({"time": to_short_time(float(ts_str)), "count": v, "bar": bar})

    render(rows, ["time", "count", "bar"], fmt, title=f"Rate ({step} bins)")


# ============================================================================
# metric — PromQL libre
# ============================================================================


@app.command(
    "metric",
    help="""Query Prometheus/Mimir libre (PromQL).

[bold]Exemples :[/bold]

  obs metric 'node_load1{host="vps-10f2bc7c"}'
  obs metric 'sum by (container) (rate(container_cpu_usage_seconds_total[5m]))'
  obs metric 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100' --since 6h
""",
)
def cmd_metric(
    query: Annotated[str, typer.Argument(help="Expression PromQL.")],
    since: Annotated[Optional[str], typer.Option("--since", "-s")] = None,
    step: Annotated[str, typer.Option(help="Step pour range query.")] = "60s",
    instant: Annotated[
        bool, typer.Option(help="Force query instant (sinon range si --since fourni).")
    ] = False,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    with PromClient(cfg) as prom:
        if since and not instant:
            since_s = parse_duration(since)
            step_s = parse_duration(step)
            samples = prom.query_range(query, since_s, step_s)
        else:
            samples = prom.query(query)

    if not samples:
        error_console.print("(aucun résultat)")
        raise typer.Exit(0)

    rows = []
    for s in samples:
        labels = ",".join(f"{k}={v}" for k, v in s.metric.items())
        if len(s.values) == 1:
            ts, val = s.values[0]
            rows.append({"labels": labels, "time": to_short_time(ts), "value": val})
        else:
            first_t, first_v = s.values[0]
            last_t, last_v = s.values[-1]
            rows.append(
                {
                    "labels": labels,
                    "first_time": to_short_time(first_t),
                    "first_value": first_v,
                    "last_time": to_short_time(last_t),
                    "last_value": last_v,
                    "samples": len(s.values),
                }
            )

    cols = list(rows[0].keys())
    render(rows, cols, fmt, title=f"PromQL ({len(rows)} séries)")


# ============================================================================
# trace — récupère une trace Tempo
# ============================================================================


@app.command(
    "trace",
    help="Récupère une trace Tempo par traceID.",
)
def cmd_trace(
    trace_id: Annotated[str, typer.Argument(help="Trace ID hex.")],
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.json,
) -> None:
    cfg = load_config()
    with TempoClient(cfg) as tempo:
        data = tempo.get_trace(trace_id)
    # On laisse render gérer pour table on flatten un peu
    if fmt == OutputFormat.json:
        import json as _json
        _json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        error_console.print(
            "Le format table pour traces n'est pas implémenté — utiliser --format json."
        )


# ============================================================================
# health — sanity check de la stack
# ============================================================================


@app.command(
    "health",
    help="Sanity check : la stack obs reçoit-elle bien les données ?",
)
def cmd_health(
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    out: dict[str, str] = {}

    with LokiClient(cfg) as loki:
        try:
            hosts = loki.label_values("host")
            out["loki_status"] = "OK"
            out["loki_hosts"] = ", ".join(hosts) if hosts else "(aucun)"
        except Exception as e:
            out["loki_status"] = f"KO ({type(e).__name__})"

        try:
            # Volume sur 1h, par host
            vols = loki.query_instant(
                'sum by (host) (count_over_time({container=~".+"}[1h]))'
            )
            for v in vols:
                h = v["metric"].get("host", "?")
                cnt = int(float(v["value"][1]))
                out[f"logs_per_h__{h}"] = str(cnt)
        except Exception as e:
            out["loki_volume"] = f"KO ({type(e).__name__})"

    with PromClient(cfg) as prom:
        try:
            up = prom.query("count by (host) (node_load1)")
            if up:
                for s in up:
                    h = s.metric.get("host", "?")
                    out[f"prom_series__{h}"] = str(s.values[0][1])
            else:
                out["prom_status"] = "WARN — aucune série node_load1"
        except Exception as e:
            out["prom_status"] = f"KO ({type(e).__name__})"

    if fmt in (OutputFormat.json, OutputFormat.ndjson):
        print_kv(out, fmt)
    else:
        rows = [{"key": k, "value": v} for k, v in out.items()]
        render(rows, ["key", "value"], fmt, title="obs health")


if __name__ == "__main__":
    app()
