"""
Module checks : heuristiques de détection d'anomalies utilisées par `obs check`.

Chaque check est une fonction qui prend les clients (loki, prom) et retourne une liste
de `Finding` (= sujet à creuser). Pas d'effet de bord, pas d'impression — on retourne
les findings et le caller décide quoi faire (render table, JSON, etc.).

Conventions :
- Tous les seuils sont des constantes module-level overrideables via env var
  (ex: OBS_CPU_CRIT=90 pour relever le seuil CPU CRITICAL).
- Chaque check a un timeout court (max ~5s). Si Grafana Cloud rate-limite ou
  est lent, le check renvoie un finding INFO plutôt que crash.
- Les findings citent toujours une commande exacte de drill-down — c'est le
  contrat avec les agents qui appellent `obs check`.
- `env_filter` (kwarg) : si défini ("prod", "dev"), restreint le scan à cet
  environnement. None = pas de filtre = scan global (--all).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import Callable

from .loki import LokiClient
from .prom import PromClient


# ---------------------------------------------------------------------------
# Seuils (overrideables via env var OBS_<NAME>)
# ---------------------------------------------------------------------------


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(f"OBS_{name}")
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(f"OBS_{name}")
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


# CPU / RAM / Disk hôte
CPU_CRIT_PCT = _env_float("CPU_CRIT", 85.0)
CPU_WARN_PCT = _env_float("CPU_WARN", 70.0)
RAM_CRIT_PCT = _env_float("RAM_CRIT", 90.0)
RAM_WARN_PCT = _env_float("RAM_WARN", 80.0)
DISK_CRIT_PCT = _env_float("DISK_CRIT", 90.0)
DISK_WARN_PCT = _env_float("DISK_WARN", 80.0)

# Logs
ERROR_RATE_CRIT_PCT = _env_float("ERROR_RATE_CRIT", 10.0)
ERROR_RATE_WARN_PCT = _env_float("ERROR_RATE_WARN", 3.0)
ERROR_MIN_PER_HOUR = _env_int("ERROR_MIN_PER_HOUR", 50)

LOOP_THRESHOLD_PCT = _env_float("LOOP_THRESHOLD", 70.0)
LOOP_MIN_COUNT = _env_int("LOOP_MIN_COUNT", 200)

VOLUME_SPIKE_RATIO = _env_float("VOLUME_SPIKE_RATIO", 3.0)
VOLUME_SPIKE_MIN_PER_HOUR = _env_int("VOLUME_SPIKE_MIN_PER_HOUR", 500)

# Quota
QUOTA_WARN_PCT = _env_float("QUOTA_WARN", 70.0)
QUOTA_CRIT_PCT = _env_float("QUOTA_CRIT", 90.0)

# Traefik
TRAEFIK_5XX_WARN_PCT = _env_float("TRAEFIK_5XX_WARN", 1.0)
TRAEFIK_5XX_CRIT_PCT = _env_float("TRAEFIK_5XX_CRIT", 5.0)
TRAEFIK_5XX_MIN_REQ = _env_int("TRAEFIK_5XX_MIN_REQ", 50)

# Sécurité
AUTH_FAIL_WARN = _env_int("AUTH_FAIL_WARN", 10)
AUTH_FAIL_CRIT = _env_int("AUTH_FAIL_CRIT", 50)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class Severity(str, Enum):
    CRIT = "CRIT"
    WARN = "WARN"
    INFO = "INFO"
    OK = "OK"

    @property
    def order(self) -> int:
        return {"CRIT": 0, "WARN": 1, "INFO": 2, "OK": 3}[self.value]


@dataclass
class Finding:
    """Un sujet identifié par un check."""

    check_id: str
    severity: Severity
    target: str  # ex: "vps-10f2bc7c", "notifuse-postgres-1"
    summary: str  # ex: "CPU 92% (baseline 35%)"
    drilldown: str  # commande exacte à lancer pour creuser

    def to_dict(self) -> dict:
        return {
            "check": self.check_id,
            "severity": self.severity.value,
            "target": self.target,
            "summary": self.summary,
            "drilldown": self.drilldown,
        }


@dataclass
class CheckResult:
    """Résultat d'un check : 0 ou N findings."""

    check_id: str
    findings: list[Finding]
    error: str | None = None  # set if check a échoué (timeout, query error...)


# ---------------------------------------------------------------------------
# Helper : prom query safe (retourne [] si erreur)
# ---------------------------------------------------------------------------


def _safe_prom(prom: PromClient, query: str) -> list:
    try:
        return prom.query(query)
    except Exception:
        return []


def _safe_loki_instant(loki: LokiClient, query: str) -> list:
    try:
        return loki.query_instant(query)
    except Exception:
        return []


def _env_selector(env_filter: str | None, label: str = "env") -> str:
    """Retourne le selector LogQL/PromQL pour filtrer par env (ou '' si None)."""
    if not env_filter:
        return ""
    return f',{label}="{env_filter}"'


def _env_prom_selector(env_filter: str | None) -> str:
    """Idem pour PromQL où on n'a pas de virgule de séparation contextuelle."""
    if not env_filter:
        return ""
    return f'{{env="{env_filter}"}}'


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_host_cpu(prom: PromClient, env_filter: str | None = None, **_) -> CheckResult:
    """CPU host : load1 normalisé par nproc (load = 1.0 = 100% d'un core)."""
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    q = (
        '100 * (1 - avg by (host) '
        f'(rate(node_cpu_seconds_total{{mode="idle"{env_lbl}}}[15m])))'
    )
    samples = _safe_prom(prom, q)
    findings = []
    for s in samples:
        host = s.metric.get("host", "?")
        try:
            pct = float(s.values[0][1])
        except (ValueError, IndexError):
            continue
        if pct >= CPU_CRIT_PCT:
            sev = Severity.CRIT
        elif pct >= CPU_WARN_PCT:
            sev = Severity.WARN
        else:
            continue
        findings.append(
            Finding(
                check_id="host_cpu",
                severity=sev,
                target=host,
                summary=f"CPU {pct:.0f}% (15min avg, seuil {CPU_WARN_PCT:.0f}/{CPU_CRIT_PCT:.0f}%)",
                drilldown=f"obs metric 'rate(node_cpu_seconds_total{{host=\"{host}\",mode!=\"idle\"}}[5m])' --since 1h",
            )
        )
    return CheckResult("host_cpu", findings)


def check_host_ram(prom: PromClient, env_filter: str | None = None, **_) -> CheckResult:
    env_lbl = f'{{env="{env_filter}"}}' if env_filter else ''
    q = (
        f'100 * (1 - (avg by (host) (node_memory_MemAvailable_bytes{env_lbl}) '
        f'/ avg by (host) (node_memory_MemTotal_bytes{env_lbl})))'
    )
    samples = _safe_prom(prom, q)
    findings = []
    for s in samples:
        host = s.metric.get("host", "?")
        try:
            pct = float(s.values[0][1])
        except (ValueError, IndexError):
            continue
        if pct >= RAM_CRIT_PCT:
            sev = Severity.CRIT
        elif pct >= RAM_WARN_PCT:
            sev = Severity.WARN
        else:
            continue
        findings.append(
            Finding(
                check_id="host_ram",
                severity=sev,
                target=host,
                summary=f"RAM {pct:.0f}% utilisée (seuil {RAM_WARN_PCT:.0f}/{RAM_CRIT_PCT:.0f}%)",
                drilldown=f"obs metric 'node_memory_MemAvailable_bytes{{host=\"{host}\"}} / node_memory_MemTotal_bytes{{host=\"{host}\"}} * 100' --since 6h",
            )
        )
    return CheckResult("host_ram", findings)


def check_host_disk(prom: PromClient, env_filter: str | None = None, **_) -> CheckResult:
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    q = (
        f'100 * (1 - (node_filesystem_avail_bytes{{mountpoint="/",fstype!~"tmpfs|overlay"{env_lbl}}} '
        f'/ node_filesystem_size_bytes{{mountpoint="/",fstype!~"tmpfs|overlay"{env_lbl}}}))'
    )
    samples = _safe_prom(prom, q)
    findings = []
    for s in samples:
        host = s.metric.get("host", "?")
        try:
            pct = float(s.values[0][1])
        except (ValueError, IndexError):
            continue
        if pct >= DISK_CRIT_PCT:
            sev = Severity.CRIT
        elif pct >= DISK_WARN_PCT:
            sev = Severity.WARN
        else:
            continue
        findings.append(
            Finding(
                check_id="host_disk",
                severity=sev,
                target=host,
                summary=f"Disk / à {pct:.0f}% (seuil {DISK_WARN_PCT:.0f}/{DISK_CRIT_PCT:.0f}%)",
                drilldown=f"ssh {host.replace('vps-10f2bc7c', 'prod-pub').replace('dev-server', 'dev-pub')} 'df -h / && du -sh /var/lib/docker /var/log'",
            )
        )
    return CheckResult("host_disk", findings)


def check_error_rate_per_container(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """Pour chaque container, ratio erreurs / total logs sur 1h."""
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    try:
        total_res = loki.query_instant(
            f'sum by (container) (count_over_time({{container=~".+"{env_lbl}}}[1h]))'
        )
        err_res = loki.query_instant(
            f'sum by (container) '
            f'(count_over_time({{container=~".+"{env_lbl}}} |~ "(?i)(error|panic|fatal|traceback|unhandled)" [1h]))'
        )
    except Exception as e:
        return CheckResult("error_rate", [], error=str(e))

    totals = {r["metric"].get("container", "?"): int(float(r["value"][1])) for r in total_res}
    errors = {r["metric"].get("container", "?"): int(float(r["value"][1])) for r in err_res}

    for container, err_count in errors.items():
        total = totals.get(container, 0)
        if total == 0 or err_count < ERROR_MIN_PER_HOUR:
            continue
        pct = (err_count / total) * 100
        if pct >= ERROR_RATE_CRIT_PCT:
            sev = Severity.CRIT
        elif pct >= ERROR_RATE_WARN_PCT:
            sev = Severity.WARN
        else:
            continue
        findings.append(
            Finding(
                check_id="error_rate",
                severity=sev,
                target=container,
                summary=f"{err_count}/{total} logs en erreur ({pct:.1f}%, seuil {ERROR_RATE_WARN_PCT:.0f}/{ERROR_RATE_CRIT_PCT:.0f}%)",
                drilldown=f"obs errors {_short_pattern(container)} --dedup --since 1h",
            )
        )

    findings.sort(key=lambda f: (f.severity.order, -int(f.summary.split("/")[0])))
    return CheckResult("error_rate", findings)


def check_loops(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """Containers où une classe domine >70% du volume (= spam à filtrer)."""
    from .fingerprint import reduce_logs

    findings = []
    try:
        volumes = loki.container_volumes(since_seconds=3600, env=env_filter)
    except Exception as e:
        return CheckResult("loops", [], error=str(e))

    for host, env_lbl, container, total in volumes:
        if total < LOOP_MIN_COUNT:
            continue
        try:
            entries = loki.query_range(
                logql=f'{{container="{container}"}}',
                since_seconds=3600,
                limit=300,
            )
        except Exception:
            continue
        if not entries:
            continue
        triples = [(e.timestamp_unix, e.container, e.line) for e in entries]
        classes = reduce_logs(triples)
        if not classes:
            continue
        top = classes[0]
        pct = (top.count / len(entries)) * 100
        if pct >= LOOP_THRESHOLD_PCT:
            findings.append(
                Finding(
                    check_id="loops",
                    severity=Severity.WARN,
                    target=container,
                    summary=f"loop {pct:.0f}% sur '{top.normalized[:80]}'",
                    drilldown=f"obs top {_short_pattern(container)} --since 1h",
                )
            )
    return CheckResult("loops", findings)


def check_volume_spike(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """Container dont le volume 15min >3× le volume moyen 24h."""
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    try:
        recent = loki.query_instant(
            f'sum by (container) (rate({{container=~".+"{env_lbl}}}[15m]))'
        )
        baseline = loki.query_instant(
            f'sum by (container) (rate({{container=~".+"{env_lbl}}}[24h]))'
        )
    except Exception as e:
        return CheckResult("volume_spike", [], error=str(e))

    recent_map = {r["metric"].get("container", "?"): float(r["value"][1]) for r in recent}
    baseline_map = {r["metric"].get("container", "?"): float(r["value"][1]) for r in baseline}

    for container, recent_rate in recent_map.items():
        baseline_rate = baseline_map.get(container, 0)
        if baseline_rate == 0:
            continue
        # Convertir rate (logs/sec) en logs/hour pour la lisibilité
        recent_per_hour = recent_rate * 3600
        if recent_per_hour < VOLUME_SPIKE_MIN_PER_HOUR:
            continue
        ratio = recent_rate / baseline_rate
        if ratio >= VOLUME_SPIKE_RATIO:
            findings.append(
                Finding(
                    check_id="volume_spike",
                    severity=Severity.WARN,
                    target=container,
                    summary=f"{recent_per_hour:.0f} logs/h récent vs baseline {baseline_rate*3600:.0f}/h (×{ratio:.1f})",
                    drilldown=f"obs rate {_short_pattern(container)} --since 6h --step 5m",
                )
            )
    return CheckResult("volume_spike", findings)


def check_traefik_5xx(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """% de 5xx sur Traefik. dokploy-traefik tourne uniquement sur prod."""
    # Si on filtre sur dev, Traefik n'a pas de container correspondant — skip
    if env_filter == "dev":
        return CheckResult("traefik_5xx", [])
    try:
        total_res = loki.query_instant(
            'sum(count_over_time({container="dokploy-traefik"}[1h]))'
        )
        err_res = loki.query_instant(
            'sum(count_over_time({container="dokploy-traefik",status=~"5.."}[1h]))'
        )
    except Exception as e:
        return CheckResult("traefik_5xx", [], error=str(e))

    if not total_res:
        return CheckResult("traefik_5xx", [])

    total = int(float(total_res[0]["value"][1]))
    errors = int(float(err_res[0]["value"][1])) if err_res else 0

    if total < TRAEFIK_5XX_MIN_REQ:
        return CheckResult("traefik_5xx", [])

    pct = (errors / total) * 100 if total else 0
    if pct >= TRAEFIK_5XX_CRIT_PCT:
        sev = Severity.CRIT
    elif pct >= TRAEFIK_5XX_WARN_PCT:
        sev = Severity.WARN
    else:
        return CheckResult("traefik_5xx", [])

    return CheckResult(
        "traefik_5xx",
        [
            Finding(
                check_id="traefik_5xx",
                severity=sev,
                target="dokploy-traefik",
                summary=f"{errors}/{total} requêtes en 5xx ({pct:.1f}%, seuil {TRAEFIK_5XX_WARN_PCT:.0f}/{TRAEFIK_5XX_CRIT_PCT:.0f}%)",
                drilldown='obs logs dokploy-traefik --regex \'"DownstreamStatus":5\' --since 1h --truncate 200',
            )
        ],
    )


def check_quota(prom: PromClient, cfg, **_) -> CheckResult:
    """Usage Grafana Cloud vs limites free tier."""
    findings = []
    import httpx as _httpx

    usage_url = cfg.stack_url + "/api/datasources/proxy/uid/grafanacloud-usage"
    try:
        client = _httpx.Client(base_url=usage_url, headers=cfg.auth_headers, timeout=10.0)
    except Exception as e:
        return CheckResult("quota", [], error=str(e))

    try:
        # Mimir series (le plus risqué pour nous)
        r = client.get(
            "/api/v1/query",
            params={"query": "sum(grafanacloud_instance_active_series)"},
        )
        if r.status_code == 200:
            res = r.json().get("data", {}).get("result", [])
            if res:
                series = int(float(res[0]["value"][1]))
                pct = series / 10_000 * 100
                if pct >= QUOTA_CRIT_PCT:
                    sev = Severity.CRIT
                elif pct >= QUOTA_WARN_PCT:
                    sev = Severity.WARN
                else:
                    sev = None
                if sev:
                    findings.append(
                        Finding(
                            check_id="quota_mimir",
                            severity=sev,
                            target="Mimir series",
                            summary=f"{series}/10000 séries actives ({pct:.0f}%)",
                            drilldown="obs metric 'topk(20, count by (__name__) ({__name__=~\".+\"}))'",
                        )
                    )
    except Exception:
        pass
    finally:
        client.close()

    return CheckResult("quota", findings)


def check_drops(prom: PromClient, **_) -> CheckResult:
    """Si un reason de drop domine massivement → vérifier qu'on ne perd pas du signal."""
    samples = _safe_prom(
        prom, "sum by (reason) (rate(loki_process_dropped_lines_total[5m]))"
    )
    if not samples:
        return CheckResult("drops", [])

    totals = {s.metric.get("reason", "?"): float(s.values[0][1]) for s in samples}
    total_sum = sum(totals.values())
    if total_sum == 0:
        return CheckResult("drops", [])

    findings = []
    for reason, rate in totals.items():
        share = rate / total_sum
        per_h = rate * 3600
        if per_h >= 1000 and share >= 0.8 and reason != "debug_trace":
            # Un seul reason qui prend tout >80% — bizarre, sauf debug_trace qui est attendu
            findings.append(
                Finding(
                    check_id="drops_dominant",
                    severity=Severity.INFO,
                    target=f"reason={reason}",
                    summary=f"{per_h:.0f} lignes/h droppées ({share*100:.0f}% des drops)",
                    drilldown="obs drops --since 1h",
                )
            )
    return CheckResult("drops", findings)


def check_alloy_push_failures(prom: PromClient, env_filter: str | None = None, **_) -> CheckResult:
    """Si Alloy a des erreurs de push (auth, network) → signal grave."""
    findings = []
    env_lbl = f'{{env="{env_filter}"}}' if env_filter else ''
    samples = _safe_prom(
        prom,
        f"sum by (host) (rate(loki_write_dropped_bytes_total{env_lbl}[5m]))",
    )
    for s in samples:
        host = s.metric.get("host", "?")
        rate = float(s.values[0][1])
        if rate > 0:
            findings.append(
                Finding(
                    check_id="alloy_push_fail",
                    severity=Severity.CRIT,
                    target=host,
                    summary=f"Alloy drop {rate*60:.0f} bytes/min vers Loki (push failures)",
                    drilldown=f"ssh {_host_to_ssh(host)} 'sudo journalctl -u alloy --since 10m | grep error | tail -20'",
                )
            )

    # Idem pour Mimir
    samples = _safe_prom(
        prom,
        f"sum by (host) (rate(prometheus_remote_storage_samples_failed_total{env_lbl}[5m]))",
    )
    for s in samples:
        host = s.metric.get("host", "?")
        rate = float(s.values[0][1])
        if rate > 0:
            findings.append(
                Finding(
                    check_id="alloy_push_fail",
                    severity=Severity.CRIT,
                    target=host,
                    summary=f"Alloy drop {rate*60:.0f} samples/min vers Mimir",
                    drilldown=f"ssh {_host_to_ssh(host)} 'sudo journalctl -u alloy --since 10m | grep error | tail -20'",
                )
            )
    return CheckResult("alloy_push_fail", findings)


def check_auth_failures(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """SSH/sudo auth failures (journald) sur 1h."""
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    try:
        res = loki.query_instant(
            f'sum by (host) (count_over_time({{source="journald"{env_lbl}}} |~ "Failed password|authentication failure|invalid user" [1h]))'
        )
    except Exception as e:
        return CheckResult("auth_failures", [], error=str(e))

    for s in res:
        host = s["metric"].get("host", "?")
        n = int(float(s["value"][1]))
        if n >= AUTH_FAIL_CRIT:
            sev = Severity.CRIT
        elif n >= AUTH_FAIL_WARN:
            sev = Severity.WARN
        else:
            continue
        findings.append(
            Finding(
                check_id="auth_failures",
                severity=sev,
                target=host,
                summary=f"{n} auth failures journald sur 1h (seuil {AUTH_FAIL_WARN}/{AUTH_FAIL_CRIT})",
                drilldown=f'obs search "Failed password|invalid user" --since 1h',
            )
        )
    return CheckResult("auth_failures", findings)


def check_silent_containers(loki: LokiClient, env_filter: str | None = None, **_) -> CheckResult:
    """Container actif il y a 24h mais silencieux maintenant (>30 min)."""
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ''
    try:
        recent = loki.query_instant(
            f'sum by (container) (count_over_time({{container=~".+"{env_lbl}}}[30m]))'
        )
        baseline = loki.query_instant(
            f'sum by (container) (count_over_time({{container=~".+"{env_lbl}}}[24h] offset 30m))'
        )
    except Exception as e:
        return CheckResult("silent", [], error=str(e))

    recent_map = {r["metric"].get("container", "?"): int(float(r["value"][1])) for r in recent}
    baseline_map = {r["metric"].get("container", "?"): int(float(r["value"][1])) for r in baseline}

    for container, base_count in baseline_map.items():
        if base_count < 100:
            continue
        recent_count = recent_map.get(container, 0)
        if recent_count == 0:
            # Was active, now silent
            findings.append(
                Finding(
                    check_id="silent_container",
                    severity=Severity.WARN,
                    target=container,
                    summary=f"silencieux depuis 30 min (baseline 24h = {base_count} logs)",
                    drilldown=f"obs logs {_short_pattern(container)} --since 6h --limit 20",
                )
            )
    return CheckResult("silent", findings)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _short_pattern(container: str) -> str:
    """Réduit un container name long en pattern court utilisable dans obs commands.

    Format Dokploy : compose-<adj>-<adj>-<noun>-<noun>-<hash6>-<service>-<replica>
    Le hash 6-chars Dokploy a toujours au moins un chiffre quelque part.

    'compose-back-up-online-pixel-nl2k9p-hub-prod-1' → 'hub-prod'
    'compose-bypass-bluetooth-feed-tbayqr-twenty-worker-1' → 'twenty-worker'
    """
    import re

    parts = container.split("-")
    if parts[0] == "compose" and len(parts) >= 7:
        # Trouve le segment hash : 6 chars alphanum.
        # Dokploy génère hash random : peut être tout chiffre, tout lettre, mix.
        # On prend le PREMIER segment qui matche après les 4 mots adjectifs
        # (positions 1-4 sont toujours les mots, position 5 = hash, sauf cas
        # particulier où il y a moins de mots).
        hash_idx = None
        # Cherche dans la fenêtre raisonnable (pos 4-6 idéalement)
        for i in range(min(4, len(parts) - 2), min(7, len(parts) - 1)):
            p = parts[i]
            if len(p) == 6 and re.fullmatch(r"[a-z0-9]{6}", p):
                hash_idx = i
                break
        if hash_idx is not None:
            # Tout ce qui suit le hash, sauf le dernier (-1 = replica)
            tail = parts[hash_idx + 1:]
            if tail and tail[-1].isdigit():
                tail = tail[:-1]
            if tail:
                return "-".join(tail)

    # Fallback : juste strip le -<num> final
    return re.sub(r"-\d+$", "", container) or container


def _host_to_ssh(host: str) -> str:
    """Mappe hostname → alias SSH connu."""
    mapping = {
        "vps-10f2bc7c": "prod-pub",
        "dev-server": "dev-pub",
        "dev-server-1": "dev-pub",
        "mail": "localhost",
    }
    return mapping.get(host, host)


# ---------------------------------------------------------------------------
# Registry : tous les checks lancés par `obs check`
# ---------------------------------------------------------------------------


ALL_CHECKS: list[tuple[str, Callable]] = [
    ("host_cpu", check_host_cpu),
    ("host_ram", check_host_ram),
    ("host_disk", check_host_disk),
    ("error_rate", check_error_rate_per_container),
    ("loops", check_loops),
    ("volume_spike", check_volume_spike),
    ("traefik_5xx", check_traefik_5xx),
    ("quota", check_quota),
    ("drops", check_drops),
    ("alloy_push_fail", check_alloy_push_failures),
    ("auth_failures", check_auth_failures),
    ("silent_containers", check_silent_containers),
]
