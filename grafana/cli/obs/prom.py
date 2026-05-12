"""Client Prometheus/Mimir via proxy datasource."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from .config import GrafanaCloudConfig
from .timeutil import now_unix


@dataclass
class MetricSample:
    metric: dict[str, str]
    values: list[tuple[float, str]]  # liste (ts, value) pour range, ou [(ts, value)] pour instant


class PromClient:
    def __init__(self, cfg: GrafanaCloudConfig, timeout: float = 30.0):
        self._cfg = cfg
        self._client = httpx.Client(
            base_url=cfg.prom_proxy,
            headers=cfg.auth_headers,
            timeout=timeout,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def query(self, promql: str) -> list[MetricSample]:
        params = {"query": promql, "time": str(now_unix())}
        r = self._client.get("/api/v1/query", params=params)
        r.raise_for_status()
        data = r.json().get("data", {})
        out: list[MetricSample] = []
        for s in data.get("result", []):
            ts, val = s["value"]
            out.append(MetricSample(metric=s.get("metric", {}), values=[(ts, val)]))
        return out

    def query_range(
        self, promql: str, since_seconds: int, step_seconds: int = 60
    ) -> list[MetricSample]:
        now = now_unix()
        start = now - since_seconds
        params = {
            "query": promql,
            "start": str(start),
            "end": str(now),
            "step": str(step_seconds),
        }
        r = self._client.get("/api/v1/query_range", params=params)
        r.raise_for_status()
        data = r.json().get("data", {})
        out: list[MetricSample] = []
        for s in data.get("result", []):
            vals = [(float(t), v) for t, v in s.get("values", [])]
            out.append(MetricSample(metric=s.get("metric", {}), values=vals))
        return out
