"""Multi-format output : table (Rich), json, ndjson, csv, tsv, raw, silent."""

from __future__ import annotations

import csv
import io
import json
import sys
from enum import Enum
from typing import Any, Iterable

from rich.console import Console
from rich.table import Table

console = Console()
error_console = Console(stderr=True, style="red")


class OutputFormat(str, Enum):
    table = "table"
    json = "json"
    ndjson = "ndjson"
    csv = "csv"
    tsv = "tsv"
    raw = "raw"  # 1 valeur brute par ligne, pas de header
    silent = "silent"  # n'affiche que le count


def render(
    rows: list[dict[str, Any]],
    columns: list[str],
    fmt: OutputFormat,
    title: str | None = None,
) -> None:
    """rows = liste de dicts homogènes. columns = ordre des colonnes."""
    if fmt == OutputFormat.silent:
        print(len(rows))
        return

    if fmt == OutputFormat.json:
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=2, default=str)
        sys.stdout.write("\n")
        return

    if fmt == OutputFormat.ndjson:
        for r in rows:
            json.dump(r, sys.stdout, ensure_ascii=False, default=str)
            sys.stdout.write("\n")
        return

    if fmt in (OutputFormat.csv, OutputFormat.tsv):
        delim = "\t" if fmt == OutputFormat.tsv else ","
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=delim)
        w.writerow(columns)
        for r in rows:
            w.writerow([r.get(c, "") for c in columns])
        sys.stdout.write(buf.getvalue())
        return

    if fmt == OutputFormat.raw:
        for r in rows:
            sys.stdout.write(" ".join(str(r.get(c, "")) for c in columns) + "\n")
        return

    # default = table
    if not rows:
        console.print(f"[dim]({title or 'résultats'}: aucune ligne)[/dim]")
        return

    table = Table(title=title, show_lines=False, header_style="bold cyan")
    for c in columns:
        table.add_column(c, overflow="fold")
    for r in rows:
        table.add_row(*[str(r.get(c, "")) for c in columns])
    console.print(table)


def print_kv(items: dict[str, Any], fmt: OutputFormat) -> None:
    """Pour les commandes 'health' / 'info' qui retournent un dict plat."""
    if fmt == OutputFormat.json:
        json.dump(items, sys.stdout, ensure_ascii=False, indent=2, default=str)
        sys.stdout.write("\n")
        return
    if fmt == OutputFormat.silent:
        print(len(items))
        return
    for k, v in items.items():
        console.print(f"[bold]{k}[/bold]: {v}")
