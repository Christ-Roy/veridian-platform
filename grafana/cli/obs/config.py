"""Chargement des credentials Grafana Cloud depuis ~/credentials/.all-creds.env.

On évite `source` parce que le fichier contient des lignes mal-quotées ailleurs
(ex. `SENDER_NAME=Robert Brunon`) qui cassent bash. On lit ligne par ligne.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GrafanaCloudConfig:
    stack_url: str
    sa_token: str
    org_id: str
    stack_id: str
    region: str

    @property
    def loki_proxy(self) -> str:
        return f"{self.stack_url}/api/datasources/proxy/uid/grafanacloud-logs"

    @property
    def prom_proxy(self) -> str:
        return f"{self.stack_url}/api/datasources/proxy/uid/grafanacloud-prom"

    @property
    def tempo_proxy(self) -> str:
        return f"{self.stack_url}/api/datasources/proxy/uid/grafanacloud-traces"

    @property
    def auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.sa_token}"}


def _read_creds(path: Path) -> dict[str, str]:
    """Parse simple key=value, ignore les # commentaires et lignes vides."""
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Si la value contient un espace non-quoted, on prend juste le 1er token
        # (cas SENDER_NAME=Robert Brunon → on stocke "Robert" mais ce field nous concerne pas)
        if " " in value and not (value.startswith('"') or value.startswith("'")):
            value = value.split()[0]
        out[key] = value
    return out


def load_config(creds_path: Path | None = None) -> GrafanaCloudConfig:
    """Charge les credentials. Lève si une var critique manque."""
    path = creds_path or Path.home() / "credentials" / ".all-creds.env"
    if not path.exists():
        raise SystemExit(f"ERREUR : {path} introuvable")

    creds = _read_creds(path)

    def need(key: str) -> str:
        # Permet aussi d'override via env var (TF-style)
        env_val = os.environ.get(key)
        if env_val:
            return env_val
        val = creds.get(key)
        if not val:
            raise SystemExit(f"ERREUR : {key} manquant dans {path}")
        return val

    return GrafanaCloudConfig(
        stack_url=need("GRAFANA_CLOUD_STACK_URL"),
        sa_token=need("GRAFANA_STACK_SA_TOKEN"),
        org_id=need("GRAFANA_CLOUD_ORG_ID"),
        stack_id=need("GRAFANA_CLOUD_STACK_ID"),
        region=need("GRAFANA_CLOUD_REGION"),
    )
