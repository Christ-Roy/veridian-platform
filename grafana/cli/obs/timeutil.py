"""Helpers pour les durées (--since 1h, 30m, 2d…) et timestamps."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone

_DURATION_RE = re.compile(r"^(\d+)([smhd])$")


def parse_duration(s: str) -> int:
    """Parse '30s' / '15m' / '1h' / '2d' en secondes. Lève si invalide."""
    s = s.strip().lower()
    # Tolère pur int
    if s.isdigit():
        return int(s)
    m = _DURATION_RE.match(s)
    if not m:
        raise ValueError(f"Durée invalide : {s!r} (attendu Ns/Nm/Nh/Nd)")
    n, unit = int(m.group(1)), m.group(2)
    return {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit] * n


def now_unix() -> int:
    return int(time.time())


def now_ns() -> int:
    return time.time_ns()


def to_iso(unix_seconds: float) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def to_short_time(unix_seconds: float) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).strftime("%H:%M:%S")


def to_ns_string(unix_seconds: int) -> str:
    """Loki query_range veut des nanosecondes string."""
    return f"{unix_seconds}000000000"
