#!/usr/bin/env bash
# Vérifie que chaque Host Traefik en prod a exactement 1 container associé.
# Exit 1 si collision (= dual-router latent ou actif).
#
# Usage :
#   ./check-traefik-unique-host.sh                  # tous les hosts
#   ./check-traefik-unique-host.sh app.veridian.site  # un host précis
#
# À lancer AVANT et APRÈS toute bascule blue-green, et en CI nightly.

set -euo pipefail

SSH_TARGET="${PROD_SSH:-prod-pub}"
TARGET_HOST="${1:-}"

# Récupère via SSH la liste { container_name -> [hosts] }
mapping=$(ssh "$SSH_TARGET" "docker ps --format '{{.Names}}' | while read c; do
  labels=\$(docker inspect \$c --format '{{json .Config.Labels}}' 2>/dev/null)
  echo \"\$c|\$labels\"
done" 2>/dev/null)

declare -A host_count
declare -A host_containers

while IFS='|' read -r container labels; do
  [ -z "$container" ] && continue
  hosts=$(echo "$labels" | python3 -c '
import json, sys, re
try:
    d = json.loads(sys.stdin.read())
    hosts = set()
    for k, v in d.items():
        if "routers" in k and k.endswith(".rule"):
            for m in re.findall(r"Host\(`([^`]+)`\)", v):
                hosts.add(m)
            for m in re.findall(r"HostRegexp\(`\^?([a-z0-9\\\\.\\-\\[\\]\\^\\$\\+\\*]+)`\)", v):
                hosts.add(f"regexp:{m}")
    print("\n".join(sorted(hosts)))
except Exception:
    pass
' 2>/dev/null)
  while IFS= read -r host; do
    [ -z "$host" ] && continue
    host_count[$host]=$((${host_count[$host]:-0} + 1))
    host_containers[$host]="${host_containers[$host]:-} $container"
  done <<< "$hosts"
done <<< "$mapping"

exit_code=0
collisions=()
ok_count=0

for host in "${!host_count[@]}"; do
  if [ -n "$TARGET_HOST" ] && [ "$host" != "$TARGET_HOST" ]; then
    continue
  fi
  count=${host_count[$host]}
  if [ "$count" -gt 1 ]; then
    collisions+=("$host")
    echo "FAIL  $host  ($count containers) :${host_containers[$host]}"
    exit_code=1
  else
    ok_count=$((ok_count + 1))
  fi
done

if [ $exit_code -eq 0 ]; then
  echo "OK    ${ok_count} hosts checked, no dual-router collision"
else
  echo ""
  echo "${#collisions[@]} collision(s) detected. Blue-green procedure violated."
  echo "Fix : neutraliser les containers de trop (stop + restart=no + retirer labels Traefik du compose)."
  echo "Voir : cc-saas/prompts/applicatif/06-blue-green-procedure.md"
fi

exit $exit_code
