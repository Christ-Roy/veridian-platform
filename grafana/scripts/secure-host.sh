#!/usr/bin/env bash
# Sécurise les ports internes d'un VPS Veridian via iptables.
#
# Couvre :
# - Alloy OTLP receivers (4317/4318 TCP)         — chaîne INPUT (process host)
# - Docker Swarm management (2377 TCP)            — chaîne INPUT (dockerd écoute sur host)
# - Docker Swarm gossip (7946 TCP+UDP)            — chaîne INPUT
# - Docker overlay network VXLAN (4789 UDP)       — chaîne INPUT
#
# Note : DOCKER-USER serait pour les ports forwardés vers des containers via -p.
# Les ports Swarm sont écoutés par dockerd sur l'host, donc INPUT s'applique.
#
# Stratégie pour chaque port :
# - ACCEPT depuis loopback (127.0.0.0/8)
# - ACCEPT depuis Docker bridges (172.16.0.0/12)
# - ACCEPT depuis Tailscale (100.64.0.0/10, CGNAT) — utile si Robert veut
#   ajouter un node Swarm via Tailscale plus tard
# - DROP tout le reste
#
# Chaînes utilisées :
# - INPUT : pour les process host (Alloy)
# - DOCKER-USER : pour les ports gérés par dockerd (Swarm). Docker injecte
#   ses propres règles dans FORWARD et écrase INPUT, mais DOCKER-USER est
#   préservé entre les restarts.
#
# Sauvegarde via netfilter-persistent → règles survivent reboot.
# Idempotent — relance OK.

set -euo pipefail

SSH_TARGET="${1:-}"
if [[ -z "$SSH_TARGET" ]]; then
  echo "Usage: $0 <ssh-target>" >&2
  echo "Exemples : $0 prod-pub | $0 dev-pub" >&2
  exit 1
fi

echo "==> Audit firewall actuel sur $SSH_TARGET..."
ssh "$SSH_TARGET" "sudo iptables -L INPUT -n -v 2>&1 | grep -E '4317|4318|2377|7946|4789' | head -10" || true

echo
echo "==> Configuration iptables..."
ssh "$SSH_TARGET" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

if ! command -v netfilter-persistent >/dev/null 2>&1; then
  echo "  installation iptables-persistent..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent 2>&1 | tail -3
fi

ensure_rule() {
  local chain="$1"
  shift
  local rule="$*"
  if ! iptables -C "$chain" $rule 2>/dev/null; then
    iptables -I "$chain" $rule
    echo "  + iptables -I $chain $rule"
  else
    echo "  = (deja en place) $chain $rule"
  fi
}

# ========================================================================
# Alloy OTLP receivers — chaîne INPUT (process host)
# ========================================================================
for PORT in 4317 4318; do
  echo
  echo " == INPUT/TCP $PORT (Alloy OTLP) =="
  ensure_rule INPUT "-p tcp --dport $PORT -j DROP -m comment --comment alloy_otlp_${PORT}_drop"
  ensure_rule INPUT "-p tcp --dport $PORT -s 127.0.0.0/8 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_loop"
  ensure_rule INPUT "-p tcp --dport $PORT -s 172.16.0.0/12 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_docker"
  ensure_rule INPUT "-p tcp --dport $PORT -s 100.64.0.0/10 -j ACCEPT -m comment --comment alloy_otlp_${PORT}_tailscale"
done

# ========================================================================
# Docker Swarm — chaîne INPUT
# ========================================================================
# Les ports Swarm 2377/7946 sont écoutés par dockerd lui-même sur l'host
# (pas forwardés vers des containers), donc INPUT s'applique. La chaîne
# DOCKER-USER serait pour les ports publiés via -p sur des containers.
# VXLAN 4789 est traité dans le kernel par l'overlay driver, INPUT aussi.

# Swarm management (TCP 2377)
echo
echo " == INPUT/TCP 2377 (Swarm management) =="
ensure_rule INPUT "-p tcp --dport 2377 -j DROP -m comment --comment swarm_mgmt_drop"
ensure_rule INPUT "-p tcp --dport 2377 -s 127.0.0.0/8 -j ACCEPT -m comment --comment swarm_mgmt_loop"
ensure_rule INPUT "-p tcp --dport 2377 -s 172.16.0.0/12 -j ACCEPT -m comment --comment swarm_mgmt_docker"
ensure_rule INPUT "-p tcp --dport 2377 -s 100.64.0.0/10 -j ACCEPT -m comment --comment swarm_mgmt_tailscale"

# Swarm gossip TCP (7946)
echo
echo " == INPUT/TCP 7946 (Swarm gossip) =="
ensure_rule INPUT "-p tcp --dport 7946 -j DROP -m comment --comment swarm_gossip_tcp_drop"
ensure_rule INPUT "-p tcp --dport 7946 -s 127.0.0.0/8 -j ACCEPT -m comment --comment swarm_gossip_tcp_loop"
ensure_rule INPUT "-p tcp --dport 7946 -s 172.16.0.0/12 -j ACCEPT -m comment --comment swarm_gossip_tcp_docker"
ensure_rule INPUT "-p tcp --dport 7946 -s 100.64.0.0/10 -j ACCEPT -m comment --comment swarm_gossip_tcp_tailscale"

# Swarm gossip UDP (7946)
echo
echo " == INPUT/UDP 7946 (Swarm gossip) =="
ensure_rule INPUT "-p udp --dport 7946 -j DROP -m comment --comment swarm_gossip_udp_drop"
ensure_rule INPUT "-p udp --dport 7946 -s 127.0.0.0/8 -j ACCEPT -m comment --comment swarm_gossip_udp_loop"
ensure_rule INPUT "-p udp --dport 7946 -s 172.16.0.0/12 -j ACCEPT -m comment --comment swarm_gossip_udp_docker"
ensure_rule INPUT "-p udp --dport 7946 -s 100.64.0.0/10 -j ACCEPT -m comment --comment swarm_gossip_udp_tailscale"

# Overlay network VXLAN (UDP 4789) — le plus risqué selon Docker docs
echo
echo " == INPUT/UDP 4789 (VXLAN overlay) =="
ensure_rule INPUT "-p udp --dport 4789 -j DROP -m comment --comment overlay_vxlan_drop"
ensure_rule INPUT "-p udp --dport 4789 -s 127.0.0.0/8 -j ACCEPT -m comment --comment overlay_vxlan_loop"
ensure_rule INPUT "-p udp --dport 4789 -s 172.16.0.0/12 -j ACCEPT -m comment --comment overlay_vxlan_docker"
ensure_rule INPUT "-p udp --dport 4789 -s 100.64.0.0/10 -j ACCEPT -m comment --comment overlay_vxlan_tailscale"

# Cleanup : retirer les vieilles règles DOCKER-USER si elles existent (legacy
# v1 du script qui mettait à tort dans DOCKER-USER). Silently ignored si absent.
if iptables -L DOCKER-USER -n >/dev/null 2>&1; then
  for comment in swarm_mgmt_drop swarm_mgmt_loop swarm_mgmt_docker swarm_mgmt_tailscale \
                 swarm_gossip_tcp_drop swarm_gossip_tcp_loop swarm_gossip_tcp_docker swarm_gossip_tcp_tailscale \
                 swarm_gossip_udp_drop swarm_gossip_udp_loop swarm_gossip_udp_docker swarm_gossip_udp_tailscale \
                 overlay_vxlan_drop overlay_vxlan_loop overlay_vxlan_docker overlay_vxlan_tailscale; do
    while iptables -S DOCKER-USER 2>/dev/null | grep -q "comment $comment"; do
      rule=$(iptables -S DOCKER-USER 2>/dev/null | grep "comment $comment" | head -1 | sed 's/^-A DOCKER-USER //')
      iptables -D DOCKER-USER $rule 2>/dev/null && echo "  - cleanup DOCKER-USER $comment" || break
    done
  done
fi

echo
echo "==> Sauvegarde iptables-persistent..."
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
echo "  Sauvegarde dans /etc/iptables/rules.v4"

echo
echo "==> Recap regles INPUT (tous ports sécurisés) :"
iptables -L INPUT -n --line-numbers 2>&1 | grep -E '4317|4318|2377|7946|4789' || echo "  (aucune)"
REMOTE

echo
echo "==> Verification finale : ports vus depuis $SSH_TARGET ?"
ssh "$SSH_TARGET" "sudo ss -tlnp 2>&1 | grep -E '4317|4318|2377|7946'; sudo ss -ulnp 2>&1 | grep -E '7946|4789'"
