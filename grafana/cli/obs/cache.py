"""Cache local pour les checks lents (CVE scan, port scan distant, etc.).

Stocké dans ~/.cache/obs/ en JSON avec timestamp.
TTL configurable par check (default 1h).
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

CACHE_DIR = Path.home() / ".cache" / "obs"


def _ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def get(key: str, max_age_seconds: int = 3600) -> Any | None:
    """Retourne la valeur cachée si fraîche, sinon None."""
    _ensure_cache_dir()
    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    ts = data.get("_timestamp", 0)
    if time.time() - ts > max_age_seconds:
        return None
    return data.get("value")


def set(key: str, value: Any) -> None:  # noqa: A001
    """Persiste une valeur avec timestamp."""
    _ensure_cache_dir()
    path = CACHE_DIR / f"{key}.json"
    payload = {"_timestamp": time.time(), "value": value}
    path.write_text(json.dumps(payload, default=str))


def clear(key: str | None = None) -> None:
    """Efface une clé (ou tout le cache si None)."""
    _ensure_cache_dir()
    if key:
        (CACHE_DIR / f"{key}.json").unlink(missing_ok=True)
    else:
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()


def cached(key: str, max_age_seconds: int = 3600):
    """Decorator : cache le retour d'une fonction. Bypass si OBS_FRESH=1."""
    import os

    def decorator(fn):
        def wrapper(*args, **kwargs):
            if os.environ.get("OBS_FRESH") == "1":
                result = fn(*args, **kwargs)
                set(key, result)
                return result
            cached_val = get(key, max_age_seconds)
            if cached_val is not None:
                return cached_val
            result = fn(*args, **kwargs)
            set(key, result)
            return result
        return wrapper
    return decorator
