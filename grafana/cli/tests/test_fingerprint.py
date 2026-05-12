"""Tests unitaires du module fingerprint.

Vérifie que les variations attendues sont bien normalisées vers la même classe.
Cas réels tirés de logs Veridian (Notifuse, Supabase, Twenty).
"""

from __future__ import annotations

import pytest

from obs.fingerprint import fingerprint, normalize, reduce_logs


def test_normalize_strips_ansi():
    line = "\x1b[36mINFO\x1b[0m   Completed in 95.926µs /health"
    assert "\x1b" not in normalize(line)
    assert "INFO" in normalize(line)


def test_normalize_timestamps():
    a = "2026-05-12T15:27:00Z GET /health 200"
    b = "2026-05-12T15:28:00Z GET /health 200"
    assert normalize(a) == normalize(b)
    assert fingerprint(a) == fingerprint(b)


def test_normalize_uuids():
    a = "request_id=cW1n1elEu0Wt0d0JC84LE complete"
    b = "request_id=AAAAAAAAAAAAAAAA1234 complete"
    # ces chaînes ne sont pas des UUID stricts — gardons le test sur de vrais UUIDs
    a2 = "user 67046648-a691-4eac-b4c0-42601acacfe4 logged in"
    b2 = "user 12345678-90ab-cdef-1234-567890abcdef logged in"
    assert fingerprint(a2) == fingerprint(b2)


def test_normalize_durations():
    # Test isolé : 2 lignes qui ne diffèrent QUE par la durée doivent normaliser pareil
    a = "Completed in 95.926µs /health"
    b = "Completed in 1.234ms /health"
    assert fingerprint(a) == fingerprint(b)
    # Vérifie aussi que la durée est bien remplacée par <dur>
    assert "<dur>" in normalize(a)
    assert "<dur>" in normalize(b)


def test_normalize_ip_addresses():
    a = "Request from 192.168.1.100:54321 to /api"
    b = "Request from 10.0.0.1:12345 to /api"
    assert fingerprint(a) == fingerprint(b)


def test_short_numbers_preserved():
    # Status codes doivent être préservés
    a = "GET /pricing 500"
    b = "GET /pricing 200"
    # 200 et 500 ne devraient PAS être normalisés au même placeholder
    assert fingerprint(a) != fingerprint(b)


def test_reduce_logs_groups_correctly():
    entries = [
        (1.0, "hub", "Completed in 1.5ms /health"),
        (2.0, "hub", "Completed in 2.3ms /health"),
        (3.0, "hub", "Completed in 99.9ms /health"),
        (4.0, "hub", "DB connection lost"),
        (5.0, "prospection", "Completed in 0.8ms /api"),
    ]
    classes = reduce_logs(entries)
    # 3 classes : 3 "Completed in X /health", 1 "DB lost", 1 "Completed /api"
    assert len(classes) == 3
    # La plus fréquente est /health
    assert classes[0].count == 3
    assert "<dur>" in classes[0].normalized


def test_empty_input():
    assert reduce_logs([]) == []
