"""
Checks sécurité — auditer la surface d'attaque de l'infra Veridian.

Couvre :
- security_ports : ports LISTEN sur 0.0.0.0 exposés sur Internet (SSH dépendant
  de la VPS pour éviter le bruit)
- security_ssh : tentatives brute-force SSH récentes (journald)
- security_swarm : Docker Swarm exposé sans iptables drop
- security_docker_versions : version Docker daemon vs CVE actives connues

Chaque check renvoie des Finding standard avec une commande de drill-down.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

from .cache import cached
from .checks import CheckResult, Finding, Severity, _host_to_ssh
from .loki import LokiClient
from .prom import PromClient


# ----- Configuration : ports attendus exposés Internet (whitelist) -----

# Ports qu'on accepte d'avoir exposés sur Internet (services publics légitimes)
PORTS_PUBLIC_OK = {
    22: "SSH",
    80: "HTTP (Traefik redirect HTTPS)",
    443: "HTTPS (Traefik)",
}

# Ports à filtrer (privés mais utiles via Tailscale ou Docker bridges)
PORTS_PRIVATE_EXPECTED = {
    2377: "Docker Swarm management",
    7946: "Docker Swarm gossip",
    4789: "Docker VXLAN overlay",
    4317: "Alloy OTLP gRPC",
    4318: "Alloy OTLP HTTP",
    3000: "Dokploy UI",
    2222: "SSH alt",
}


# ----- Helpers SSH -----


def _ssh_run(ssh_target: str, cmd: str, timeout: int = 10) -> tuple[int, str, str]:
    """Lance une commande sur un VPS distant. Returns (rc, stdout, stderr)."""
    try:
        proc = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", f"ConnectTimeout={timeout}",
             ssh_target, cmd],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"
    except FileNotFoundError:
        return -2, "", "ssh not found"


def _hosts_to_audit(env_filter: str | None) -> list[tuple[str, str, str]]:
    """Retourne la liste (hostname_label, ssh_alias, public_ip) à auditer.

    Mapping figé pour Veridian. Pour ajouter un VPS : éditer ici.
    """
    all_hosts = [
        ("vps-10f2bc7c", "prod-pub", "51.210.7.44", "prod"),
        ("dev-server", "dev-pub", "37.187.199.185", "dev"),
    ]
    if env_filter:
        return [(h, s, ip) for h, s, ip, e in all_hosts if e == env_filter]
    return [(h, s, ip) for h, s, ip, _ in all_hosts]


# ----- Check : ports exposés Internet -----


@cached("security_ports", max_age_seconds=600)
def _scan_host_ports(ssh_alias: str) -> dict:
    """Récupère l'inventaire des ports LISTEN d'un host distant."""
    rc, out, err = _ssh_run(
        ssh_alias,
        "sudo ss -tlnp 2>&1 | tail -n +2 && echo '---UDP---' && sudo ss -ulnp 2>&1 | tail -n +2",
        timeout=15,
    )
    if rc != 0:
        return {"error": f"rc={rc} stderr={err[:200]}"}

    tcp_ports: dict[int, str] = {}  # port -> process
    udp_ports: dict[int, str] = {}
    current = tcp_ports
    for line in out.splitlines():
        if line.strip() == "---UDP---":
            current = udp_ports
            continue
        # Parse ss output : look for "*:PORT" or "0.0.0.0:PORT" patterns (= bind on all)
        parts = line.split()
        if len(parts) < 5:
            continue
        local_addr = parts[3]
        # Extract IP and port
        if ":" not in local_addr:
            continue
        addr_part, port_str = local_addr.rsplit(":", 1)
        if not port_str.isdigit():
            continue
        port = int(port_str)
        # Skip non-public binds
        if addr_part in ("127.0.0.1", "127.0.0.53", "127.0.0.54", "127.0.0.53%lo"):
            continue
        if addr_part.startswith("127.") or addr_part.startswith("172."):
            continue
        if addr_part.startswith("[fd7a:") or addr_part.startswith("100."):
            continue  # Tailscale/IPv6 link-local
        # *:PORT ou 0.0.0.0:PORT = bind sur toutes interfaces
        if addr_part in ("*", "0.0.0.0", "[::]", "::"):
            # Extract process name
            process = "?"
            if "users:" in line:
                try:
                    process = line.split('"')[1]
                except IndexError:
                    pass
            current[port] = process
    return {"tcp": tcp_ports, "udp": udp_ports}


def _probe_external(public_ip: str, port: int, proto: str = "tcp") -> bool:
    """Test rapide depuis localhost : le port est-il vraiment OPEN sur Internet ?"""
    import socket
    try:
        if proto == "tcp":
            s = socket.create_connection((public_ip, port), timeout=2)
            s.close()
            return True
        else:
            # UDP : on ne peut pas tester sans paquet d'application, skip
            return False
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def check_security_ports(env_filter: str | None = None, **_) -> CheckResult:
    """Audit les ports LISTEN exposés sur Internet (filtre dynamiquement les
    ports qui répondent depuis localhost = bloqués par iptables)."""
    findings = []
    hosts = _hosts_to_audit(env_filter)

    for host_label, ssh_alias, public_ip in hosts:
        scan = _scan_host_ports(ssh_alias)
        if "error" in scan:
            findings.append(Finding(
                check_id="security_ports",
                severity=Severity.INFO,
                target=host_label,
                summary=f"scan échoué : {scan['error']}",
                drilldown=f"ssh {ssh_alias} 'sudo ss -tlnp'",
            ))
            continue

        for port, process in scan.get("tcp", {}).items():
            if port in PORTS_PUBLIC_OK:
                continue  # accepté (SSH 22, HTTP 80, HTTPS 443)
            # Test réel depuis Internet (filtre iptables)
            really_open = _probe_external(public_ip, port, "tcp")
            if not really_open:
                continue  # iptables bloque, pas un risque
            label = PORTS_PRIVATE_EXPECTED.get(port, "service inconnu")
            sev = Severity.WARN
            # Ports critiques qu'on avait explicitement fermés : si on les voit
            # ouverts, c'est qu'iptables est cassé → CRIT
            if port in (2377, 7946, 4317, 4318, 4789):
                sev = Severity.CRIT
            findings.append(Finding(
                check_id="security_ports",
                severity=sev,
                target=f"{host_label}:{port}",
                summary=f"{label} ({process}) exposé Internet",
                drilldown=f"ssh {ssh_alias} 'sudo iptables -L INPUT -n | grep {port}'",
            ))

    return CheckResult("security_ports", findings)


# ----- Check : tentatives brute-force SSH -----


def check_security_ssh_bruteforce(
    loki: LokiClient, env_filter: str | None = None, **_
) -> CheckResult:
    """Compte les tentatives SSH échouées par IP source sur 1h."""
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ""
    try:
        # Aggrège par host : nb total + IPs distinctes
        res = loki.query_instant(
            f'sum by (host) (count_over_time({{source="journald",unit="ssh.service"{env_lbl}}} '
            f'|~ "Failed password|invalid user|authentication failure" [1h]))'
        )
    except Exception as e:
        return CheckResult("security_ssh", [], error=str(e))

    for s in res:
        host = s["metric"].get("host", "?")
        try:
            n = int(float(s["value"][1]))
        except (ValueError, IndexError):
            continue
        if n >= 50:
            sev = Severity.CRIT
        elif n >= 10:
            sev = Severity.WARN
        else:
            continue
        findings.append(Finding(
            check_id="security_ssh",
            severity=sev,
            target=host,
            summary=f"{n} tentatives SSH échouées /h (brute-force probable)",
            drilldown=f'obs search "Failed password|invalid user" --since 1h --format table',
        ))
    return CheckResult("security_ssh", findings)


# ----- Check : Docker daemon version vs CVE -----


# Version Docker minimum sans CVE high/critical pré-auth connue (mise à jour manuelle)
# Source: github.com/moby/moby/security/advisories
DOCKER_MIN_VERSION = "28.4.0"


def _version_tuple(v: str) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in v.split(".")[:3])
    except (ValueError, AttributeError):
        return (0, 0, 0)


@cached("security_docker_version", max_age_seconds=3600)
def _get_docker_version(ssh_alias: str) -> str | None:
    rc, out, _ = _ssh_run(ssh_alias, "sudo docker version --format '{{.Server.Version}}'", timeout=10)
    if rc != 0:
        return None
    return out.strip()


def check_security_docker_version(env_filter: str | None = None, **_) -> CheckResult:
    findings = []
    for host_label, ssh_alias, _ in _hosts_to_audit(env_filter):
        version = _get_docker_version(ssh_alias)
        if not version:
            continue
        if _version_tuple(version) < _version_tuple(DOCKER_MIN_VERSION):
            findings.append(Finding(
                check_id="security_docker_version",
                severity=Severity.WARN,
                target=host_label,
                summary=f"Docker {version} < {DOCKER_MIN_VERSION} (CVE potentielles)",
                drilldown=f"ssh {ssh_alias} 'sudo apt list --upgradable | grep -E docker-ce'",
            ))
    return CheckResult("security_docker_version", findings)


# ----- Registry des checks security -----


SECURITY_CHECKS = [
    ("security_ports", check_security_ports),
    ("security_ssh", check_security_ssh_bruteforce),
    ("security_docker_version", check_security_docker_version),
]
