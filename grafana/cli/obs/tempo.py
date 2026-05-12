"""Client Tempo via proxy datasource (basique pour l'instant)."""

from __future__ import annotations

import httpx

from .config import GrafanaCloudConfig


class TempoClient:
    def __init__(self, cfg: GrafanaCloudConfig, timeout: float = 30.0):
        self._cfg = cfg
        self._client = httpx.Client(
            base_url=cfg.tempo_proxy,
            headers=cfg.auth_headers,
            timeout=timeout,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def get_trace(self, trace_id: str) -> dict:
        r = self._client.get(f"/api/traces/{trace_id}")
        r.raise_for_status()
        return r.json()
