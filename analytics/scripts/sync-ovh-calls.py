#!/usr/bin/env python3
"""
Sync OVH voiceConsumption → Veridian Analytics /api/ingest/call

Pull les CDR (Call Detail Records) depuis l'API OVH pour la ligne
Tramtech (04 82 53 04 29) et les pousse vers Analytics.

Usage :
  python3 sync-ovh-calls.py              # sync normal
  python3 sync-ovh-calls.py --dry-run    # affiche sans poster

Prérequis :
  - pip install ovh
  - ~/.ovh.conf configuré (app_key, app_secret, consumer_key)

Cron recommandé : toutes les 15 minutes
  */15 * * * * cd /home/ubuntu/analytics-sync && python3 sync-ovh-calls.py >> /tmp/ovh-call-sync.log 2>&1
"""

import ovh
import json
import sys
import urllib.request
from datetime import datetime

# === Config ===
BILLING_ACCOUNT = "bm3625056-ovh-1"
SERVICE = "0033482530429"
ANALYTICS_URL = "https://analytics.app.veridian.site"
SITE_KEY = "cmnutiyl3000puxnoanjrm2dg"  # tramtech-depannage.fr
DRY_RUN = "--dry-run" in sys.argv

def main():
    client = ovh.Client()

    # Lister tous les CDR
    cdr_ids = client.get(f"/telephony/{BILLING_ACCOUNT}/service/{SERVICE}/voiceConsumption")
    print(f"[{datetime.now().isoformat()}] Found {len(cdr_ids)} CDR(s)")

    if not cdr_ids:
        return

    synced = 0
    errors = 0

    for cdr_id in cdr_ids:
        try:
            detail = client.get(
                f"/telephony/{BILLING_ACCOUNT}/service/{SERVICE}/voiceConsumption/{cdr_id}"
            )

            # Mapper OVH → Analytics
            way = detail.get("wayType", "")
            direction = "inbound" if way == "incoming" else "outbound"
            duration = detail.get("duration", 0)

            # Status : si durée > 0, c'est answered. Sinon missed.
            if duration > 0:
                status = "answered"
            else:
                status = "missed"

            # Parse datetime OVH (format ISO avec timezone) → UTC ISO Z
            from datetime import timedelta, timezone
            raw_dt = detail.get("creationDatetime", "")
            dt = datetime.fromisoformat(raw_dt).astimezone(timezone.utc)
            started_at = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            if duration > 0:
                ended_dt = dt + timedelta(seconds=duration)
                ended_at = ended_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            else:
                ended_at = None

            payload = {
                "callId": f"ovh-{cdr_id}",
                "fromNum": detail.get("calling", ""),
                "toNum": detail.get("called", ""),
                "direction": direction,
                "status": status,
                "duration": duration,
                "startedAt": started_at,
                "endedAt": ended_at,
            }

            if DRY_RUN:
                print(f"  [dry-run] {payload['direction']} {payload['fromNum']} → {payload['toNum']} ({duration}s) {status}")
                synced += 1
                continue

            # POST vers Analytics
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                f"{ANALYTICS_URL}/api/ingest/call",
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "x-site-key": SITE_KEY,
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read())
                if body.get("ok"):
                    synced += 1
                else:
                    print(f"  [warn] CDR {cdr_id}: {body}")
                    errors += 1

        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            # 409 ou payload déjà existant = pas grave (idempotent)
            if e.code == 409:
                synced += 1
            else:
                print(f"  [error] CDR {cdr_id}: HTTP {e.code} — {err_body[:200]}")
                errors += 1
        except Exception as e:
            print(f"  [error] CDR {cdr_id}: {e}")
            errors += 1

    print(f"  Synced: {synced}, Errors: {errors}")

if __name__ == "__main__":
    main()
