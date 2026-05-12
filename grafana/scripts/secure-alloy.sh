#!/usr/bin/env bash
# Sécurise les ports OTLP Alloy (4317/4318) sur un VPS distant.
#
# Pourquoi : Alloy doit bind sur 0.0.0.0 pour que les containers Docker Swarm
# puissent l'atteindre (réseau overlay, pas de gateway bridge classique).
# Mais on ne veut PAS que ces ports soient exposés sur internet.
#
# Solution : iptables drop tous les paquets venant de l'interface WAN
# vers 4317/4318, mais accept les paquets venant des bridges Docker
# (172.16.0.0/12) + loopback + Tailscale (100.64.0.0/10).
#
# Idempotent : relance OK, vérifie qu'une règle existe avant d'ajouter.
#
# Usage : ./secure-alloy.sh <ssh-target>

set -euo pipefail

SSH_TARGET="${1:-}"
if [[ -z "$SSH_TARGET" ]]; then
  echo "Usage: $0 <ssh-target>" >&2
  exit 1
fi

echo "==> Audit firewall actuel sur $SSH_TARGET..."
ssh "$SSH_TARGET" "sudo iptables -L INPUT -n -v 2>&1 | grep -E '4317|4318' || echo '  (pas de règle existante)'"

echo
echo "==> Configure les règles iptables pour Alloy..."
ssh "$SSH_TARGET" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

if ! command -v netfilter-persistent >/dev/null 2>&1; then
  echo "  installation iptables-persistent..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent 2>&1 | tail -3
fi

ensure_rule() {
  local rule="$1"
  if ! iptables -C INPUT $rule 2>/dev/null; then
    iptables -I INPUT $rule
    echo "  + iptables -I INPUT $rule"
  else
    echo "  = (deja en place) $rule"
  fi
}

# Pour chaque port, on insère :
# 1. DROP en premier (en bas après tous les ACCEPT puisque -I = top)
# 2. ACCEPT loopback / docker / tailscale (insérés après = au-dessus du DROP)
for PORT in 4317 4318; do
  echo
  echo " == Port $PORT =="
  ensure_rule "-p tcp --dport $PORT -j DROP -m comment --comment alloy_otlp_${PORT}_drop"
  ensure_rule "-p tcp --dport $PORT -s 127.0.0.0/8 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_loop"
  ensure_rule "-p tcp --dport $PORT -s 172.16.0.0/12 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_docker"
  ensure_rule "-p tcp --dport $PORT -s 100.64.0.0/10 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_tailscale"
done

echo
echo "==> Sauvegarde iptables-persistent..."
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
echo "  Sauvegarde dans /etc/iptables/rules.v4"

echo
echo "==> Recap regles pour 4317/4318 :"
iptables -L INPUT -n --line-numbers | grep -E '4317|4318'
REMOTE

echo
echo "==> Verification : 4317 et 4318 vus depuis $SSH_TARGET ?"
ssh "$SSH_TARGET" "sudo ss -tlnp 2>&1 | grep -E '4317|4318'"
