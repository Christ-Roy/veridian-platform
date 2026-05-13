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

import os
from .checks import ALL_CHECKS, Finding, Severity
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
# Global flag --env : filtre toutes les commandes par environnement
# Défaut = prod (cas d'usage 99%). --dev = dev seul. --all = pas de filtre.
# Override via env var OBS_DEFAULT_ENV=dev pour changer le défaut.
# ============================================================================


class _Ctx:
    """Contexte global propagé à toutes les sous-commandes via callback."""

    env: Optional[str] = os.environ.get("OBS_DEFAULT_ENV", "prod")


_ctx = _Ctx()


def env_selector() -> Optional[str]:
    """Retourne le label env à passer aux clients Loki/Prom, ou None pour 'all'."""
    return _ctx.env if _ctx.env != "all" else None


@app.callback()
def _global_options(
    env: Annotated[
        str,
        typer.Option(
            "--env",
            "-e",
            help="Filtre par environnement (prod / dev / all). Défaut: prod.",
        ),
    ] = os.environ.get("OBS_DEFAULT_ENV", "prod"),
    dev: Annotated[
        bool,
        typer.Option("--dev", help="Raccourci pour --env dev."),
    ] = False,
    all_envs: Annotated[
        bool,
        typer.Option("--all", help="Raccourci pour --env all (prod + dev)."),
    ] = False,
) -> None:
    """Options globales appliquées à toutes les sous-commandes."""
    if dev:
        _ctx.env = "dev"
    elif all_envs:
        _ctx.env = "all"
    else:
        _ctx.env = env


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
            env=env or env_selector(),
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
            env=env or env_selector(),
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
        volumes = loki.container_volumes(since_seconds=since_s, env=env or env_selector())

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
            env=env or env_selector(),
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
        rows_tuples = loki.container_volumes(since_seconds=since_s, env=env or env_selector())

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
            env=env or env_selector(),
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


# ============================================================================
# stats — distribution par niveau de log + volume estimé (par container)
# ============================================================================


@app.command(
    "stats",
    help="""Statistiques détaillées par container : volume total, distribution
par level, top 3 messages, taille moyenne, %% bruit.

[bold]Exemples :[/bold]

  obs stats --since 1h
  obs stats notifuse --since 6h --format json
""",
)
def cmd_stats(
    pattern: Annotated[Optional[str], typer.Argument(help="Pattern container.")] = None,
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    sample: Annotated[
        int,
        typer.Option(help="Lignes à échantillonner par container pour l'analyse."),
    ] = 500,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)

    with LokiClient(cfg) as loki:
        # 1. Volume par container
        volumes = loki.container_volumes(since_seconds=since_s, env=env or env_selector())
        if pattern:
            volumes = [v for v in volumes if pattern in v[2]]

        # 2. Pour chaque container actif, fetch un sample et calcule stats
        from collections import Counter

        rows = []
        for host, env_lbl, container, total in volumes[:30]:
            if total == 0:
                continue
            entries = loki.query_range(
                logql=f'{{container="{container}"}}',
                since_seconds=since_s,
                limit=sample,
            )
            if not entries:
                continue

            # Distribution par level (via label level qu'Alloy a posé, ou via regex)
            levels = Counter()
            for e in entries:
                lvl = (e.labels.get("level") or "").lower()
                if not lvl:
                    line_lower = e.line[:200].lower()
                    for kw in ("fatal", "error", "warn", "info", "debug", "trace"):
                        if kw in line_lower:
                            lvl = kw
                            break
                levels[lvl or "?"] += 1

            avg_len = sum(len(e.line) for e in entries) // max(1, len(entries))
            est_bytes_h = (total * avg_len) // max(1, since_s // 3600 or 1)

            triples = [(e.timestamp_unix, e.container, e.line) for e in entries]
            classes = reduce_logs(triples)
            top1_pct = (classes[0].count * 100 // len(entries)) if classes else 0

            levels_str = " ".join(
                f"{lvl}:{cnt}" for lvl, cnt in levels.most_common()
            )

            rows.append(
                {
                    "container": container,
                    "host": host,
                    "env": env_lbl,
                    "logs": total,
                    "levels": levels_str,
                    "avg_len_b": avg_len,
                    "est_KB_h": est_bytes_h // 1024,
                    "top1_pct": f"{top1_pct}%",
                    "unique_classes": len(classes),
                }
            )

    render(
        rows,
        ["container", "host", "env", "logs", "levels", "avg_len_b", "est_KB_h", "top1_pct", "unique_classes"],
        fmt,
        title=f"Stats containers (sample {sample} / container, période {since})",
    )


# ============================================================================
# levels — breakdown par niveau de log, barres ASCII
# ============================================================================


@app.command(
    "levels",
    help="""Distribution des niveaux de log (error/warn/info/debug) globale.

[bold]Exemples :[/bold]

  obs levels --since 1h
  obs levels --env prod --since 24h --format json
""",
)
def cmd_levels(
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)

    sel = '{level=~".+"}'
    if env:
        sel = f'{{level=~".+",env="{env}"}}'

    logql = f"sum by (level) (count_over_time({sel}[{since}]))"

    with LokiClient(cfg) as loki:
        res = loki.query_instant(logql)

    if not res:
        error_console.print("(aucune donnée — Alloy a-t-il bien posé le label `level` ?)")
        raise typer.Exit(0)

    # Normalize les levels en lowercase + alias warning→warn
    raw = {r["metric"].get("level", "?"): int(float(r["value"][1])) for r in res}
    counts: dict[str, int] = {}
    for k, v in raw.items():
        n = k.strip().lower()
        if n == "warning":
            n = "warn"
        counts[n] = counts.get(n, 0) + v
    total = sum(counts.values()) or 1

    rows = []
    for lvl in ("fatal", "error", "warn", "info", "debug", "trace"):
        c = counts.pop(lvl, 0)
        if c:
            pct = c * 100 // total
            bar = "█" * (pct // 2)
            rows.append({"level": lvl, "count": c, "pct": f"{pct}%", "bar": bar})
    # Ajoute le reste si jamais d'autres levels traînent
    for lvl, c in counts.items():
        pct = c * 100 // total
        bar = "█" * (pct // 2)
        rows.append({"level": lvl, "count": c, "pct": f"{pct}%", "bar": bar})

    render(rows, ["level", "count", "pct", "bar"], fmt, title=f"Distribution levels ({since})")


# ============================================================================
# noisy — flag les containers où >X% du volume est dans une seule classe
# ============================================================================


@app.command(
    "noisy",
    help="""Liste les containers candidats au filtrage : ceux où une classe de
message domine fortement (= bons candidats à mettre dans filters.prod.alloy).

[bold]Exemples :[/bold]

  obs noisy --since 1h --threshold 50
  obs noisy --env prod --since 24h --format json
""",
)
def cmd_noisy(
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    threshold: Annotated[
        float,
        typer.Option(help="% min de logs occupés par la classe dominante."),
    ] = 40.0,
    min_count: Annotated[int, typer.Option(help="Count absolu min.")] = 100,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
    sample: Annotated[int, typer.Option(help="Lignes à analyser par container.")] = 500,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)

    with LokiClient(cfg) as loki:
        volumes = loki.container_volumes(since_seconds=since_s, env=env or env_selector())
        rows = []
        for host, env_lbl, container, total in volumes:
            if total < min_count:
                continue
            entries = loki.query_range(
                logql=f'{{container="{container}"}}',
                since_seconds=since_s,
                limit=sample,
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
                        "total": total,
                        "top_pct": f"{top_pct:.0f}%",
                        "top_count": top_class.count,
                        "wasted_logs": int(total * top_pct / 100),
                        "normalized": top_class.normalized[:150],
                    }
                )

    rows.sort(key=lambda r: r["wasted_logs"], reverse=True)
    render(
        rows,
        ["container", "host", "env", "total", "top_pct", "top_count", "wasted_logs", "normalized"],
        fmt,
        title=f"Noisy containers (top class ≥{threshold:.0f}%, min_count≥{min_count})",
    )


# ============================================================================
# quota — usage Grafana Cloud actuel vs limites free tier
# ============================================================================


@app.command(
    "quota",
    help="""Affiche l'usage actuel Loki + Mimir + Tempo vs limites free tier.

Interroge la Grafana Cloud Billing API + les datasources insights.

[bold]Exemples :[/bold]

  obs quota
  obs quota --format json
""",
)
def cmd_quota(
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()

    # Free tier hard caps (vérifiés 2026-05-12)
    LIMITS = {
        "loki_logs_gb": 50,
        "mimir_series": 10_000,
        "tempo_traces_gb": 50,
        "pyroscope_profiles_gb": 50,
    }

    # On utilise le datasource "grafanacloud-usage" qui expose les vraies metrics
    with PromClient(cfg) as prom:
        # Switch sur le datasource usage en construisant un client custom
        usage_url = cfg.stack_url + "/api/datasources/proxy/uid/grafanacloud-usage"
        import httpx as _httpx
        client = _httpx.Client(base_url=usage_url, headers=cfg.auth_headers, timeout=30.0)

        rows = []

        # Loki ingest bytes 30j
        try:
            r = client.get("/api/v1/query", params={"query": 'sum(increase(grafanacloud_logs_instance_bytes_received_total[30d]))'})
            r.raise_for_status()
            res = r.json().get("data", {}).get("result", [])
            if res:
                bytes_v = float(res[0]["value"][1])
                gb = bytes_v / 1024**3
                pct = gb / LIMITS["loki_logs_gb"] * 100
                rows.append({
                    "resource": "Loki logs (30j)",
                    "used": f"{gb:.2f} GB",
                    "limit": f"{LIMITS['loki_logs_gb']} GB",
                    "pct": f"{pct:.1f}%",
                    "bar": "█" * min(50, int(pct / 2)),
                })
        except Exception as e:
            rows.append({"resource": "Loki logs", "used": f"erreur: {e}", "limit": "", "pct": "", "bar": ""})

        # Mimir active series
        try:
            r = client.get("/api/v1/query", params={"query": 'sum(grafanacloud_instance_active_series)'})
            r.raise_for_status()
            res = r.json().get("data", {}).get("result", [])
            if res:
                series = int(float(res[0]["value"][1]))
                pct = series / LIMITS["mimir_series"] * 100
                rows.append({
                    "resource": "Mimir series",
                    "used": f"{series:,}",
                    "limit": f"{LIMITS['mimir_series']:,}",
                    "pct": f"{pct:.1f}%",
                    "bar": "█" * min(50, int(pct / 2)),
                })
        except Exception as e:
            rows.append({"resource": "Mimir series", "used": f"erreur: {e}", "limit": "", "pct": "", "bar": ""})

        # Tempo bytes 30j
        try:
            r = client.get("/api/v1/query", params={"query": 'sum(increase(grafanacloud_traces_instance_bytes_received_total[30d]))'})
            r.raise_for_status()
            res = r.json().get("data", {}).get("result", [])
            if res:
                bytes_v = float(res[0]["value"][1])
                gb = bytes_v / 1024**3
                pct = gb / LIMITS["tempo_traces_gb"] * 100
                rows.append({
                    "resource": "Tempo traces (30j)",
                    "used": f"{gb:.2f} GB",
                    "limit": f"{LIMITS['tempo_traces_gb']} GB",
                    "pct": f"{pct:.1f}%",
                    "bar": "█" * min(50, int(pct / 2)),
                })
        except Exception as e:
            rows.append({"resource": "Tempo traces", "used": f"erreur: {e}", "limit": "", "pct": "", "bar": ""})

        client.close()

    render(rows, ["resource", "used", "limit", "pct", "bar"], fmt, title="Grafana Cloud quota (free tier)")


# ============================================================================
# drops — combien Alloy a-t-il filtré et pour quelle raison ?
# ============================================================================


@app.command(
    "drops",
    help="""Combien de lignes Alloy a-t-il droppé pour quelle raison ?

Utile pour valider l'efficacité des filtres dans filters.prod.alloy.

[bold]Exemples :[/bold]

  obs drops --since 1h
""",
)
def cmd_drops(
    since: Annotated[str, typer.Option("--since", "-s")] = "1h",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
) -> None:
    cfg = load_config()
    since_s = parse_duration(since)
    with PromClient(cfg) as prom:
        # rate(...[since]) * since donne le delta sur la fenêtre
        res = prom.query(
            f"sum by (reason, host) (increase(loki_process_dropped_lines_total[{since}]))"
        )

    rows = []
    for s in res:
        m = s.metric
        v = int(float(s.values[0][1]))
        if v == 0:
            continue
        rows.append({
            "host": m.get("host", "?"),
            "reason": m.get("reason", "?"),
            "dropped": v,
        })
    rows.sort(key=lambda r: r["dropped"], reverse=True)
    render(rows, ["host", "reason", "dropped"], fmt,
           title=f"Lignes droppées par Alloy ({since})")


# ============================================================================
# tail — live follow d'un container (équivalent docker logs -f distant)
# ============================================================================


@app.command(
    "tail",
    help="""Live tail des logs d'un container (équivalent docker logs -f mais distant).

Note: Loki est en pull, donc on poll toutes les --interval secondes.

[bold]Exemples :[/bold]

  obs tail hub-prod
  obs tail notifuse --interval 2 --truncate 300
""",
)
def cmd_tail(
    pattern: Annotated[str, typer.Argument(help="Pattern container.")],
    interval: Annotated[float, typer.Option(help="Intervalle de poll (sec).")] = 3.0,
    truncate: Annotated[int, typer.Option(help="Tronque chaque ligne.")] = 250,
    env: Annotated[Optional[str], typer.Option(help="Filtre env.")] = None,
) -> None:
    cfg = load_config()
    import time as _time

    seen: set[tuple[float, str]] = set()
    last_ts = _time.time() - 5  # commence 5s avant pour catch-up

    console.print(f"[bold]Tail '{pattern}'[/bold] (Ctrl+C pour stop)\n")

    try:
        with LokiClient(cfg) as loki:
            while True:
                now = _time.time()
                since_s = max(2, int(now - last_ts))
                entries = loki.fetch_logs(
                    container_pattern=pattern,
                    since_seconds=since_s,
                    limit=200,
                    env=env or env_selector(),
                )
                for e in reversed(entries):  # plus ancien en premier
                    key = (e.timestamp_unix, e.line[:80])
                    if key in seen:
                        continue
                    seen.add(key)
                    line = e.line.rstrip()
                    if truncate and len(line) > truncate:
                        line = line[:truncate] + "…"
                    t = to_short_time(e.timestamp_unix)
                    console.print(
                        f"[dim]{t}[/dim] [cyan]{e.container[:40]:40s}[/cyan] {line}"
                    )
                last_ts = now
                # Cleanup vieille entries du set pour pas grossir indéfiniment
                if len(seen) > 5000:
                    seen = set(list(seen)[-2000:])
                _time.sleep(interval)
    except KeyboardInterrupt:
        console.print("\n[dim]Stop.[/dim]")


# ============================================================================
# health — sanity check de la stack
# ============================================================================


# ============================================================================
# check — COMMANDE MÈRE : scan complet et résumé des sujets chauds
# ============================================================================


# ----- check_app : sous-commandes hiérarchisées (obs check <topic>) -----

check_app = typer.Typer(
    name="check",
    help="""[bold]Quick wins agent-first[/bold] — scans rapides classés par topic.

Chaque check liste les sujets chauds avec [italic]la commande exacte de drill-down[/italic].

Topics :
- [bold]obs check[/bold] ou [bold]obs check all[/bold] : scan complet (12+ heuristiques)
- [bold]obs check infra[/bold] : CPU / RAM / Disk des hosts
- [bold]obs check apps[/bold] : error rate / loops / pics par container
- [bold]obs check security[/bold] : ports exposés / SSH brute-force / Docker CVE
- [bold]obs check quota[/bold] : usage Grafana Cloud vs free tier
- [bold]obs check traefik[/bold] : 5xx rate, latence Traefik

Format / filtres communs : --format json, --severity warn, --env dev.
""",
    invoke_without_command=True,
    no_args_is_help=False,
)
app.add_typer(check_app)


# ----- pentest_app : red team actif (obs pentest <preset>) -----

from .pentest import pentest_app  # noqa: E402
app.add_typer(pentest_app)


def _run_check_suite(
    checks_to_run: list[tuple[str, callable]],
    severity: str,
    only_checks: str | None,
    fmt: OutputFormat,
    quiet_ok: bool,
    label: str = "obs check",
) -> None:
    """Lance une suite de checks et render le résultat. Exit code 0/1/2."""
    cfg = load_config()
    sev_min_order = {"crit": 0, "warn": 1, "info": 2, "ok": 3}.get(
        severity.lower(), 2
    )

    requested = None
    if only_checks:
        requested = {c.strip() for c in only_checks.split(",") if c.strip()}

    from concurrent.futures import ThreadPoolExecutor

    all_findings: list[Finding] = []
    errors: list[tuple[str, str]] = []
    checks_run = 0

    with LokiClient(cfg) as loki, PromClient(cfg) as prom:
        kwargs = {
            "loki": loki,
            "prom": prom,
            "cfg": cfg,
            "env_filter": env_selector(),
        }

        # Allow skipping via OBS_DISABLED_CHECKS="check_id1,check_id2" env var
        disabled = {c.strip() for c in os.environ.get("OBS_DISABLED_CHECKS", "").split(",") if c.strip()}

        with ThreadPoolExecutor(max_workers=4) as pool:
            future_to_id = {}
            for check_id, fn in checks_to_run:
                if requested and check_id not in requested:
                    continue
                if check_id in disabled:
                    continue
                checks_run += 1
                future_to_id[pool.submit(fn, **kwargs)] = check_id

            for future in future_to_id:
                check_id = future_to_id[future]
                try:
                    result = future.result(timeout=30)
                except Exception as e:
                    errors.append((check_id, str(e)))
                    continue
                if result.error:
                    errors.append((check_id, result.error))
                all_findings.extend(result.findings)

    filtered = [f for f in all_findings if f.severity.order <= sev_min_order]
    filtered.sort(key=lambda f: (f.severity.order, f.target))

    if fmt in (OutputFormat.json, OutputFormat.ndjson):
        out = {
            "timestamp": __import__("datetime").datetime.now().isoformat(),
            "label": label,
            "checks_run": checks_run,
            "findings_total": len(all_findings),
            "findings_filtered": len(filtered),
            "errors": [{"check": c, "error": e} for c, e in errors],
            "findings": [f.to_dict() for f in filtered],
        }
        if fmt == OutputFormat.json:
            import json as _json
            _json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
            sys.stdout.write("\n")
        else:
            for f in filtered:
                import json as _json
                _json.dump(f.to_dict(), sys.stdout, ensure_ascii=False)
                sys.stdout.write("\n")
    elif fmt == OutputFormat.silent:
        print(len(filtered))
    else:
        _render_check_pretty(filtered, all_findings, errors, checks_run, quiet_ok, label)

    if any(f.severity == Severity.CRIT for f in filtered):
        raise typer.Exit(2)
    if any(f.severity == Severity.WARN for f in filtered):
        raise typer.Exit(1)
    raise typer.Exit(0)


# Mapping topic → check_ids émis dans Finding (peuvent différer de la registry).
# Attention : un check function peut émettre PLUSIEURS check_ids différents
# (ex: 'quota' check → quota_mimir / quota_loki).
CHECK_TOPICS: dict[str, list[str]] = {
    "infra":    ["host_cpu", "host_ram", "host_disk", "alloy_push_fail"],
    "apps":     ["error_rate", "loops", "volume_spike", "silent_container"],
    "security": ["security_ports", "security_ssh", "security_docker_version"],
    "quota":    ["quota_mimir", "quota_loki", "quota_tempo", "drops_dominant", "license_trial"],
    "traefik":  ["traefik_5xx", "auth_failures"],
}

# Registry key (dans ALL_CHECKS) → topic. Pour le count "X chk" par topic.
REGISTRY_TO_TOPIC: dict[str, str] = {
    "host_cpu": "infra", "host_ram": "infra", "host_disk": "infra", "alloy_push_fail": "infra",
    "error_rate": "apps", "loops": "apps", "volume_spike": "apps", "silent_containers": "apps",
    "security_ports": "security", "security_ssh": "security", "security_docker_version": "security",
    "quota": "quota", "drops": "quota", "license_trial": "quota",
    "traefik_5xx": "traefik", "auth_failures": "traefik",
}

TOPIC_ICONS = {
    "infra": "🖥️",
    "apps": "📦",
    "security": "🔐",
    "quota": "💰",
    "traefik": "🌐",
}


def _all_checks_resolved() -> list[tuple[str, callable]]:
    """Concatène ALL_CHECKS (base) + SECURITY_CHECKS sans doublons."""
    from .checks_security import SECURITY_CHECKS
    seen = set()
    out: list[tuple[str, callable]] = []
    for cid, fn in list(ALL_CHECKS) + list(SECURITY_CHECKS):
        if cid in seen:
            continue
        seen.add(cid)
        out.append((cid, fn))
    return out


@check_app.callback(invoke_without_command=True)
def _check_callback(
    ctx: typer.Context,
    detail: Annotated[
        bool,
        typer.Option(
            "--detail", "-d",
            help="Affiche les findings de chaque topic (verbose). Sinon : 1 ligne par topic.",
        ),
    ] = False,
    fmt: Annotated[
        OutputFormat,
        typer.Option("--format", "-f", help="Format de sortie."),
    ] = OutputFormat.table,
    severity: Annotated[
        str,
        typer.Option("--severity", help="Filtre findings par severity min (crit/warn/info)."),
    ] = "info",
) -> None:
    """`obs check` (sans sous-commande) → vue synthétique : 1 ligne par topic.

    Pour le détail d'un topic : `obs check <topic>`.
    Pour tout dérouler : `obs check --detail` ou `obs check all`.
    """
    if ctx.invoked_subcommand is not None:
        # Une sous-commande est appelée, on ne fait rien ici
        return
    _run_check_summary(detail=detail, fmt=fmt, severity=severity)


def _run_check_summary(detail: bool, fmt: OutputFormat, severity: str) -> None:
    """Lance TOUS les checks et affiche soit un résumé compact (1 ligne / topic)
    soit le détail complet selon --detail."""
    cfg = load_config()
    sev_min_order = {"crit": 0, "warn": 1, "info": 2, "ok": 3}.get(
        severity.lower(), 2
    )

    from concurrent.futures import ThreadPoolExecutor

    all_findings: list[Finding] = []
    errors: list[tuple[str, str]] = []
    checks_run = 0

    with LokiClient(cfg) as loki, PromClient(cfg) as prom:
        kwargs = {"loki": loki, "prom": prom, "cfg": cfg, "env_filter": env_selector()}
        with ThreadPoolExecutor(max_workers=4) as pool:
            future_to_id = {}
            for check_id, fn in _all_checks_resolved():
                checks_run += 1
                future_to_id[pool.submit(fn, **kwargs)] = check_id
            for future in future_to_id:
                check_id = future_to_id[future]
                try:
                    result = future.result(timeout=30)
                except Exception as e:
                    errors.append((check_id, str(e)))
                    continue
                if result.error:
                    errors.append((check_id, result.error))
                all_findings.extend(result.findings)

    # Filtre par severity min
    filtered = [f for f in all_findings if f.severity.order <= sev_min_order]

    # Groupe par topic
    topic_of: dict[str, str] = {}
    for topic, ids in CHECK_TOPICS.items():
        for cid in ids:
            topic_of[cid] = topic

    by_topic: dict[str, list[Finding]] = {t: [] for t in CHECK_TOPICS}
    by_topic["other"] = []
    for f in filtered:
        topic = topic_of.get(f.check_id, "other")
        by_topic[topic].append(f)

    # Compte les check_ids LANCÉS par topic (registry, pas findings)
    checks_per_topic: dict[str, int] = {t: 0 for t in CHECK_TOPICS}
    for cid, _ in _all_checks_resolved():
        t = REGISTRY_TO_TOPIC.get(cid, "other")
        checks_per_topic.setdefault(t, 0)
        checks_per_topic[t] += 1

    # ----- Output JSON / ndjson : structure compatible avec les agents -----
    if fmt in (OutputFormat.json, OutputFormat.ndjson):
        out = {
            "timestamp": __import__("datetime").datetime.now().isoformat(),
            "label": "obs check (summary)",
            "checks_run": checks_run,
            "findings_total": len(all_findings),
            "findings_filtered": len(filtered),
            "errors": [{"check": c, "error": e} for c, e in errors],
            "topics": {
                topic: {
                    "checks_count": checks_per_topic.get(topic, 0),
                    "crit": sum(1 for f in flist if f.severity == Severity.CRIT),
                    "warn": sum(1 for f in flist if f.severity == Severity.WARN),
                    "info": sum(1 for f in flist if f.severity == Severity.INFO),
                    "drilldown": f"obs check {topic}" if topic != "other" else None,
                    "findings": [f.to_dict() for f in flist] if detail else [],
                }
                for topic, flist in by_topic.items() if flist or checks_per_topic.get(topic)
            },
        }
        if fmt == OutputFormat.json:
            import json as _json
            _json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
            sys.stdout.write("\n")
        else:
            import json as _json
            for topic, info in out["topics"].items():
                line = {"topic": topic, **info}
                _json.dump(line, sys.stdout, ensure_ascii=False)
                sys.stdout.write("\n")
        # Exit code
        if any(f.severity == Severity.CRIT for f in filtered):
            raise typer.Exit(2)
        if any(f.severity == Severity.WARN for f in filtered):
            raise typer.Exit(1)
        raise typer.Exit(0)

    if fmt == OutputFormat.silent:
        print(len(filtered))
        if any(f.severity == Severity.CRIT for f in filtered):
            raise typer.Exit(2)
        if any(f.severity == Severity.WARN for f in filtered):
            raise typer.Exit(1)
        raise typer.Exit(0)

    # ----- Output table (Rich) : vue synthétique -----
    _render_check_summary_table(by_topic, checks_per_topic, errors, checks_run, detail)

    # Exit code
    if any(f.severity == Severity.CRIT for f in filtered):
        raise typer.Exit(2)
    if any(f.severity == Severity.WARN for f in filtered):
        raise typer.Exit(1)
    raise typer.Exit(0)


def _render_check_summary_table(
    by_topic: dict[str, list[Finding]],
    checks_per_topic: dict[str, int],
    errors: list[tuple[str, str]],
    checks_run: int,
    detail: bool,
) -> None:
    """Render vue synthétique : 1 ligne par topic, ou détaillée si --detail."""
    from datetime import datetime

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    env_label = _ctx.env if _ctx.env != "all" else "prod+dev"

    n_crit_total = sum(1 for flist in by_topic.values() for f in flist if f.severity == Severity.CRIT)
    n_warn_total = sum(1 for flist in by_topic.values() for f in flist if f.severity == Severity.WARN)
    n_info_total = sum(1 for flist in by_topic.values() for f in flist if f.severity == Severity.INFO)

    # Header global
    if n_crit_total == 0 and n_warn_total == 0:
        status = "[bold green]✓ sain[/bold green]"
    elif n_crit_total > 0:
        status = f"[bold red]{n_crit_total} CRIT[/bold red] · [yellow]{n_warn_total} WARN[/yellow]"
    else:
        status = f"[yellow]{n_warn_total} WARN[/yellow] · [cyan]{n_info_total} INFO[/cyan]"

    console.print()
    console.print(
        f"[bold]obs check[/bold] — {timestamp} — env=[bold]{env_label}[/bold] — {status} "
        f"[dim]({checks_run} checks)[/dim]"
    )
    console.print("─" * 80)

    # Une ligne par topic
    topic_order = ["security", "infra", "apps", "traefik", "quota", "other"]
    for topic in topic_order:
        flist = by_topic.get(topic, [])
        nck = checks_per_topic.get(topic, 0)
        if nck == 0 and not flist:
            continue  # topic vide (pas de checks ni findings)
        n_crit = sum(1 for f in flist if f.severity == Severity.CRIT)
        n_warn = sum(1 for f in flist if f.severity == Severity.WARN)
        n_info = sum(1 for f in flist if f.severity == Severity.INFO)

        icon = TOPIC_ICONS.get(topic, "•")
        if n_crit > 0:
            status_icon = "🔴"
            color = "red"
        elif n_warn > 0:
            status_icon = "🟡"
            color = "yellow"
        elif n_info > 0:
            status_icon = "🔵"
            color = "cyan"
        else:
            status_icon = "✅"
            color = "green"

        # Composition de la ligne
        counts = []
        if n_crit:
            counts.append(f"[red]{n_crit}🔴[/red]")
        if n_warn:
            counts.append(f"[yellow]{n_warn}🟡[/yellow]")
        if n_info:
            counts.append(f"[cyan]{n_info}🔵[/cyan]")
        counts_str = " ".join(counts) if counts else "[green]all OK[/green]"

        drilldown = f"[italic cyan]obs check {topic}[/italic cyan]" if topic != "other" else ""
        if topic == "other":
            drilldown = "[dim]checks non topiqués[/dim]"

        console.print(
            f"  {status_icon} [{color}]{topic:9s}[/{color}]  "
            f"{nck:>2} chk  {counts_str:35s}  {drilldown if (n_crit or n_warn or n_info) else ''}"
        )

        # Mode --detail : développe les findings sous chaque topic
        if detail and flist:
            for f in flist[:10]:
                color_f = {"CRIT": "red", "WARN": "yellow", "INFO": "cyan"}[f.severity.value]
                console.print(f"      [{color_f}]│[/{color_f}] [bold]{f.target}[/bold]  {f.summary}")
                console.print(f"      [{color_f}]│[/{color_f}]   [dim]→[/dim] [italic cyan]{f.drilldown}[/italic cyan]")
            if len(flist) > 10:
                console.print(f"      [dim]│ … et {len(flist) - 10} autres findings (voir `obs check {topic}` ou `--detail`)[/dim]")

    # Erreurs internes éventuelles
    if errors:
        console.print()
        console.print(f"[dim]⚠ {len(errors)} checks ont échoué (vérifier la stack obs):[/dim]")
        for cid, err in errors[:3]:
            console.print(f"  [dim]• {cid} : {err[:120]}[/dim]")

    # Hints adaptatifs
    if n_crit_total == 0 and n_warn_total == 0 and n_info_total == 0:
        console.print()
        console.print("[dim]Aucun signal détecté. Pour explorer quand même : `obs check --detail`.[/dim]")
    elif not detail and (n_crit_total + n_warn_total + n_info_total) <= 5:
        console.print()
        console.print(
            f"[dim]Peu de findings ({n_crit_total + n_warn_total + n_info_total}). "
            f"`obs check --detail` les développe tous.[/dim]"
        )
    elif not detail:
        console.print()
        console.print(
            f"[dim]→ Pour creuser un topic : `obs check <topic>`. "
            f"Pour tout dérouler : `obs check --detail` ou `obs check all`.[/dim]"
        )


@check_app.command("all", help="Scan complet (tous les checks, ~14 heuristiques).")
def cmd_check_all(
    severity: Annotated[str, typer.Option("--severity", help="Min severity affichée.")] = "info",
    only_checks: Annotated[Optional[str], typer.Option("--check", help="Liste check_id (CSV).")] = None,
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
) -> None:
    from .checks_security import SECURITY_CHECKS
    all_suite = list(ALL_CHECKS) + list(SECURITY_CHECKS)
    _run_check_suite(all_suite, severity, only_checks, fmt, quiet_ok, label="obs check all")


@check_app.command("infra", help="État machines : CPU / RAM / Disk + santé Alloy push.")
def cmd_check_infra(
    severity: Annotated[str, typer.Option("--severity")] = "info",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
) -> None:
    infra_checks = [
        (cid, fn) for cid, fn in ALL_CHECKS
        if cid in ("host_cpu", "host_ram", "host_disk", "alloy_push_fail")
    ]
    _run_check_suite(infra_checks, severity, None, fmt, quiet_ok, label="obs check infra")


@check_app.command("apps", help="État applicatif : error rate, loops, pics, containers muets.")
def cmd_check_apps(
    severity: Annotated[str, typer.Option("--severity")] = "info",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
) -> None:
    apps_checks = [
        (cid, fn) for cid, fn in ALL_CHECKS
        if cid in ("error_rate", "loops", "volume_spike", "silent_containers")
    ]
    _run_check_suite(apps_checks, severity, None, fmt, quiet_ok, label="obs check apps")


@check_app.command("security", help="Audit cybersec : ports exposés, brute-force SSH, Docker CVE.")
def cmd_check_security(
    severity: Annotated[str, typer.Option("--severity")] = "info",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
    fresh: Annotated[bool, typer.Option("--fresh", help="Bypass cache 1h.")] = False,
) -> None:
    import os as _os
    if fresh:
        _os.environ["OBS_FRESH"] = "1"
    from .checks_security import SECURITY_CHECKS
    _run_check_suite(list(SECURITY_CHECKS), severity, None, fmt, quiet_ok, label="obs check security")


@check_app.command("quota", help="Usage Grafana Cloud vs free tier + drops Alloy + trial expiration.")
def cmd_check_quota(
    severity: Annotated[str, typer.Option("--severity")] = "info",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
) -> None:
    quota_checks = [
        (cid, fn) for cid, fn in ALL_CHECKS
        if cid in ("quota", "drops", "license_trial")
    ]
    _run_check_suite(quota_checks, severity, None, fmt, quiet_ok, label="obs check quota")


@check_app.command("traefik", help="État Traefik : 5xx, auth failures, latence.")
def cmd_check_traefik(
    severity: Annotated[str, typer.Option("--severity")] = "info",
    fmt: Annotated[OutputFormat, typer.Option("--format", "-f")] = OutputFormat.table,
    quiet_ok: Annotated[bool, typer.Option("--quiet-ok/--show-ok")] = True,
) -> None:
    traefik_checks = [
        (cid, fn) for cid, fn in ALL_CHECKS
        if cid in ("traefik_5xx", "auth_failures")
    ]
    _run_check_suite(traefik_checks, severity, None, fmt, quiet_ok, label="obs check traefik")


def _render_check_pretty(
    filtered: list[Finding],
    all_findings: list[Finding],
    errors: list[tuple[str, str]],
    checks_run: int,
    quiet_ok: bool,
    label: str = "obs check",
) -> None:
    """Render Rich pour le mode table : sections par sévérité."""
    from datetime import datetime

    n_crit = sum(1 for f in filtered if f.severity == Severity.CRIT)
    n_warn = sum(1 for f in filtered if f.severity == Severity.WARN)
    n_info = sum(1 for f in filtered if f.severity == Severity.INFO)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    env_label = _ctx.env if _ctx.env != "all" else "prod+dev"

    if not filtered:
        if quiet_ok:
            console.print(
                f"[bold green]✓ {checks_run}/{checks_run} checks OK[/bold green] "
                f"[dim](env={env_label}, {timestamp})[/dim]"
            )
        else:
            console.print(
                f"[bold green]✓ {checks_run}/{checks_run} checks OK[/bold green] "
                f"[dim](env={env_label}, {timestamp})[/dim]"
            )
            console.print(f"  (aucun finding à afficher au-dessus de --severity)")
        if errors:
            console.print()
            console.print(f"[yellow]⚠ {len(errors)} checks ont échoué[/yellow]:")
            for cid, err in errors:
                console.print(f"  • {cid} : {err[:200]}")
        return

    # Header
    header = (
        f"[bold]{label}[/bold] — {timestamp} — env=[bold]{env_label}[/bold] — "
        f"[red]{n_crit} CRIT[/red] · [yellow]{n_warn} WARN[/yellow] · "
        f"[cyan]{n_info} INFO[/cyan] sur {checks_run} checks"
    )
    console.print()
    console.print(header)
    console.print("─" * 80)

    # Sections par sévérité
    by_sev = {Severity.CRIT: [], Severity.WARN: [], Severity.INFO: []}
    for f in filtered:
        if f.severity in by_sev:
            by_sev[f.severity].append(f)

    colors = {Severity.CRIT: "red", Severity.WARN: "yellow", Severity.INFO: "cyan"}
    icons = {Severity.CRIT: "🔴", Severity.WARN: "🟡", Severity.INFO: "🔵"}

    for sev in (Severity.CRIT, Severity.WARN, Severity.INFO):
        items = by_sev[sev]
        if not items:
            continue
        color = colors[sev]
        icon = icons[sev]
        console.print()
        console.print(f"{icon} [bold {color}]{sev.value} ({len(items)})[/bold {color}]")
        for f in items:
            console.print(
                f"  [{color}]│[/{color}] [bold]{f.target}[/bold]  {f.summary}"
            )
            console.print(
                f"  [{color}]│[/{color}]   [dim]→[/dim] [italic cyan]{f.drilldown}[/italic cyan]"
            )

    if errors:
        console.print()
        console.print(f"[dim]⚠ {len(errors)} checks ont échoué (vérifier la stack):[/dim]")
        for cid, err in errors[:5]:
            console.print(f"  [dim]• {cid} : {err[:150]}[/dim]")


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
