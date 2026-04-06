#!/bin/bash
# Check if OSS services have new versions available
# Run as part of CI or cron to detect updates

set -e

echo "=== OSS Version Check ==="

# Current versions (from docker-compose)
TWENTY_CURRENT="v1.16.7"
NOTIFUSE_CURRENT="v27.0"

# Check latest version from Docker Hub (semver sorted)
get_latest_tag() {
  local repo=$1
  curl -sf "https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=100&ordering=-last_updated" 2>/dev/null | python3 -c "
import sys, json, re
data = json.load(sys.stdin)
tags = []
for t in data.get('results', []):
    n = t['name']
    if re.match(r'^v\d+\.\d+\.\d+$', n):
        tags.append(n)
# Sort by semver (major.minor.patch)
tags.sort(key=lambda x: [int(p) for p in x[1:].split('.')], reverse=True)
print(tags[0] if tags else 'unknown')
" 2>/dev/null || echo "unknown"
}

TWENTY_LATEST=$(get_latest_tag "twentycrm/twenty")
NOTIFUSE_LATEST=$(get_latest_tag "notifuse/notifuse")

echo "Twenty:  current=$TWENTY_CURRENT  latest=$TWENTY_LATEST"
echo "Notifuse: current=$NOTIFUSE_CURRENT  latest=$NOTIFUSE_LATEST"

if [ "$TWENTY_CURRENT" != "$TWENTY_LATEST" ] && [ "$TWENTY_LATEST" != "unknown" ]; then
  echo "::warning::Twenty update available: $TWENTY_CURRENT → $TWENTY_LATEST"
fi

if [ "$NOTIFUSE_CURRENT" != "$NOTIFUSE_LATEST" ] && [ "$NOTIFUSE_LATEST" != "unknown" ]; then
  echo "::warning::Notifuse update available: $NOTIFUSE_CURRENT → $NOTIFUSE_LATEST"
fi

echo "=== Done ==="
