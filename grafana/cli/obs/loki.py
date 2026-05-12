"""Client Loki via le proxy datasource Grafana stack."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import httpx

from .config import GrafanaCloudConfig
from .timeutil import now_unix, to_ns_string


@dataclass
class LogEntry:
    timestamp_unix: float
    labels: dict[str, str]
    line: str

    @property
    def container(self) -> str:
        return self.labels.get("container", "?")

    @property
    def host(self) -> str:
        return self.labels.get("host", "?")


class LokiClient:
    def __init__(self, cfg: GrafanaCloudConfig, timeout: float = 30.0):
        self._cfg = cfg
        self._client = httpx.Client(
            base_url=cfg.loki_proxy,
            headers=cfg.auth_headers,
            timeout=timeout,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    # ----- API publique -----

    def labels(self, start_unix: int | None = None) -> list[str]:
        params: dict[str, str] = {}
        if start_unix:
            params["start"] = to_ns_string(start_unix)
        r = self._client.get("/loki/api/v1/labels", params=params)
        r.raise_for_status()
        return r.json().get("data", [])

    def label_values(self, label: str, start_unix: int | None = None) -> list[str]:
        params: dict[str, str] = {}
        if start_unix:
            params["start"] = to_ns_string(start_unix)
        r = self._client.get(f"/loki/api/v1/label/{label}/values", params=params)
        r.raise_for_status()
        return r.json().get("data", [])

    def query_range(
        self,
        logql: str,
        since_seconds: int,
        limit: int = 100,
        direction: str = "BACKWARD",
    ) -> list[LogEntry]:
        """Range query : retourne les entrées brutes sur la période."""
        now = now_unix()
        start = now - since_seconds
        params = {
            "query": logql,
            "start": to_ns_string(start),
            "end": to_ns_string(now),
            "limit": str(limit),
            "direction": direction,
        }
        r = self._client.get("/loki/api/v1/query_range", params=params)
        r.raise_for_status()
        data = r.json().get("data", {})
        result = data.get("result", [])
        out: list[LogEntry] = []
        for stream in result:
            labels = stream.get("stream", {})
            for ts_ns_str, line in stream.get("values", []):
                ts_unix = int(ts_ns_str) / 1e9
                out.append(LogEntry(ts_unix, labels, line))
        out.sort(key=lambda e: e.timestamp_unix, reverse=(direction == "BACKWARD"))
        return out

    def query_instant(self, logql: str) -> list[dict]:
        """Query instant (count_over_time, sum by, etc.) — retourne les samples Prometheus-like."""
        params = {"query": logql, "time": to_ns_string(now_unix())}
        r = self._client.get("/loki/api/v1/query", params=params)
        r.raise_for_status()
        return r.json().get("data", {}).get("result", [])

    # ----- Helpers haut niveau -----

    def fetch_logs(
        self,
        container_pattern: str | None,
        since_seconds: int,
        limit: int,
        env: str | None = None,
        level_filter: str | None = None,
        regex_filter: str | None = None,
    ) -> list[LogEntry]:
        """Build LogQL et fetch. container_pattern = substring regex."""
        selectors: list[str] = []
        if container_pattern:
            # Si déjà un regex (.* présent), on garde tel quel ; sinon on encadre.
            if any(c in container_pattern for c in ".*+|()[]"):
                pattern = container_pattern
            else:
                pattern = f".*{container_pattern}.*"
            selectors.append(f'container=~"{pattern}"')
        else:
            selectors.append('container=~".+"')
        if env:
            selectors.append(f'env="{env}"')
        logql = "{" + ",".join(selectors) + "}"
        if level_filter:
            # case-insensitive match dans la ligne
            logql += f' |~ "(?i){level_filter}"'
        if regex_filter:
            logql += f' |~ "{regex_filter}"'
        return self.query_range(logql, since_seconds, limit)

    def container_volumes(
        self, since_seconds: int, env: str | None = None
    ) -> list[tuple[str, str, str, int]]:
        """Top N containers par volume. Retourne (host, env, container, count)."""
        sel = '{container=~".+"}'
        if env:
            sel = f'{{container=~".+",env="{env}"}}'
        since_str = f"{since_seconds}s"
        logql = f"topk(100, sum by (container, host, env) (count_over_time({sel}[{since_str}])))"
        res = self.query_instant(logql)
        rows: list[tuple[str, str, str, int]] = []
        for r in res:
            m = r.get("metric", {})
            v = int(float(r["value"][1]))
            rows.append((m.get("host", "?"), m.get("env", "?"), m.get("container", "?"), v))
        rows.sort(key=lambda x: x[3], reverse=True)
        return rows
