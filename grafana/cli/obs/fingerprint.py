"""Fingerprinting de log lines : normalise puis hash pour grouper les messages similaires.

Le but : repérer immédiatement quand 'DB connection retry attempt 1234' et
'DB connection retry attempt 1235' sont la même classe de message — donc 2 lignes
d'un loop, pas 2 erreurs distinctes.

Stratégie : on remplace les VARIABLES connues par des placeholders <X>, puis on
hash la ligne normalisée. Le `key` qui résulte sert à grouper.

Normalisations appliquées (dans l'ordre) :
1. ANSI escapes — virés
2. ISO timestamps — `<ts>`
3. Unix timestamps (10/13 digits) — `<ts>`
4. UUIDs — `<uuid>`
5. Hexstrings >= 16 chars — `<hex>`
6. IP v4 / v6 — `<ip>`
7. Ports — `<port>` (uniquement après `:`)
8. Durées (`1.2ms`, `145µs`, `3.4s`) — `<dur>`
9. Bytes-like (`1.5MB`, `12KiB`) — `<size>`
10. Numbers (>=4 digits ou décimaux) — `<num>`
11. Espaces successifs — un seul

Les chiffres courts (<4 digits) sont gardés intacts parce qu'ils encodent
souvent du sens : `[401]`, `[500]`, `port 80`.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass

# Précompiler les regex pour la vitesse (on les utilise sur des millions de lignes potentiellement)
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_ISO_TS_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"
)
_UNIX_TS_RE = re.compile(r"\b1[6789]\d{8,10}\b")  # 2023+ unix seconds or ms
_UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)
_HEX_LONG_RE = re.compile(r"\b[0-9a-f]{16,}\b", re.IGNORECASE)
_IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_IPV6_RE = re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b")
_PORT_RE = re.compile(r":(\d{2,5})\b")
_DURATION_RE = re.compile(r"\d+(?:\.\d+)?(?:ns|µs|us|ms|s)\b")
_BYTES_RE = re.compile(r"\d+(?:\.\d+)?\s?(?:[KMGT]i?B|bytes?)\b", re.IGNORECASE)
# Préfère matcher les décimales aussi sans \b parce que \b après un . est tricky
_NUM_RE = re.compile(r"\d+\.\d+|\b\d{4,}\b")
_MULTI_SPACE_RE = re.compile(r"\s+")


def normalize(line: str) -> str:
    """Retourne une version normalisée de la ligne — variables → placeholders."""
    s = line
    s = _ANSI_RE.sub("", s)
    s = _ISO_TS_RE.sub("<ts>", s)
    s = _UNIX_TS_RE.sub("<ts>", s)
    s = _UUID_RE.sub("<uuid>", s)
    s = _HEX_LONG_RE.sub("<hex>", s)
    s = _IPV4_RE.sub("<ip>", s)
    s = _IPV6_RE.sub("<ip>", s)
    s = _PORT_RE.sub(":<port>", s)
    s = _DURATION_RE.sub("<dur>", s)
    s = _BYTES_RE.sub("<size>", s)
    s = _NUM_RE.sub("<num>", s)
    s = _MULTI_SPACE_RE.sub(" ", s).strip()
    return s


def fingerprint(line: str) -> str:
    """Hash court (12 hex chars) qui identifie une classe de message."""
    normalized = normalize(line)
    return hashlib.md5(normalized.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]


@dataclass
class LogClass:
    fingerprint: str
    sample: str  # premier exemplaire vu, avec ses variables
    normalized: str  # version templated, lisible par humain
    count: int
    containers: Counter  # par container, combien de fois

    def to_dict(self) -> dict:
        return {
            "fingerprint": self.fingerprint,
            "sample": self.sample,
            "normalized": self.normalized,
            "count": self.count,
            "containers": dict(self.containers),
        }


def reduce_logs(entries: list[tuple[float, str, str]]) -> list[LogClass]:
    """
    Réduit une liste de logs (ts, container, line) en classes uniques.

    Returns: list[LogClass] trié par count décroissant.
    """
    classes: dict[str, LogClass] = {}
    for ts, container, line in entries:
        fp = fingerprint(line)
        if fp not in classes:
            classes[fp] = LogClass(
                fingerprint=fp,
                sample=line.strip()[:500],
                normalized=normalize(line)[:500],
                count=0,
                containers=Counter(),
            )
        cls = classes[fp]
        cls.count += 1
        cls.containers[container] += 1
    return sorted(classes.values(), key=lambda c: c.count, reverse=True)
