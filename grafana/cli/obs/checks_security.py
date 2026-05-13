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


# =============================================================================
# CONFIGURATION — édite directement ces constantes pour ajuster les seuils
# et le comportement des checks de sécurité.
#
# Ces valeurs sont aussi overrideables via env vars OBS_<NAME>. Voir checks.py
# pour les seuils performance/erreur (CPU_CRIT_PCT, ERROR_RATE_WARN, etc.).
# =============================================================================

# Ports qu'on accepte d'avoir exposés sur Internet (services publics légitimes)
# → silencieux dans `obs check security`, jamais flag.
PORTS_PUBLIC_OK = {
    22: "SSH",
    80: "HTTP (Traefik redirect HTTPS)",
    443: "HTTPS (Traefik)",
}

# Ports privés (servent en LAN/Tailscale/Docker bridges). S'ils sont
# RÉELLEMENT accessibles depuis Internet → flag WARN ou CRIT.
PORTS_PRIVATE_EXPECTED = {
    2377: "Docker Swarm management",
    7946: "Docker Swarm gossip",
    4789: "Docker VXLAN overlay",
    4317: "Alloy OTLP gRPC",
    4318: "Alloy OTLP HTTP",
    3000: "Dokploy UI",
    2222: "SSH alt",
}

# Hostnames de hosts qui n'acceptent QUE la clé SSH (pas password).
# Conséquence : les brute-force SSH sont juste du bruit Internet → INFO
# au lieu de CRIT. Si tu actives PasswordAuthentication un jour, retire
# le hostname de cette liste.
HOSTS_SSH_KEY_ONLY = {
    "vps-10f2bc7c",     # OVH prod
    "dev-server",       # OVH dev
}

# Seuils SSH brute-force (par host, sur 1h)
SSH_BRUTE_NORMAL_NOISE = 200    # < ce seuil : Internet noise normal sur key-only
SSH_BRUTE_HIGH_VOLUME = 500     # > ce seuil : volume anormalement élevé, suspect


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


def _probe_external(public_ip: str, port: int, proto: str = "tcp", timeout: float = 0.8) -> bool:
    """Test rapide depuis localhost : le port est-il vraiment OPEN sur Internet ?"""
    import socket
    try:
        if proto == "tcp":
            s = socket.create_connection((public_ip, port), timeout=timeout)
            s.close()
            return True
        else:
            return False
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def _probe_external_batch(public_ip: str, ports: list[int]) -> dict[int, bool]:
    """Test en parallèle plusieurs ports d'un host. Cache 5 min PAR IP.

    On parallélise avec ThreadPoolExecutor — 16 workers, timeout 0.8s/port,
    pire cas total ~1s.
    """
    from concurrent.futures import ThreadPoolExecutor
    from . import cache as _cache

    cache_key = f"probe_{public_ip.replace('.', '_')}"
    cached_val = _cache.get(cache_key, max_age_seconds=300)
    if cached_val is not None:
        # cached_val keys sont string (JSON), recast en int
        return {int(k): v for k, v in cached_val.items()}

    results: dict[int, bool] = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(_probe_external, public_ip, p, "tcp"): p for p in ports}
        for fut in futures:
            port = futures[fut]
            try:
                results[port] = fut.result(timeout=2)
            except Exception:
                results[port] = False

    _cache.set(cache_key, results)
    return results


def check_security_ports(env_filter: str | None = None, **_) -> CheckResult:
    """Audit les ports LISTEN exposés sur Internet (filtre dynamiquement les
    ports qui répondent depuis localhost = bloqués par iptables).

    Optimisé : SSH scan caché 10 min, probes externes cachées 5 min,
    probes lancées en parallèle (16 workers).
    """
    findings = []
    hosts = _hosts_to_audit(env_filter)

    for host_label, ssh_alias, public_ip in hosts:
        scan = _scan_host_ports(ssh_alias)
        # Le cache JSON convertit les int keys en string : recast en int
        for proto in ("tcp", "udp"):
            if isinstance(scan.get(proto), dict):
                scan[proto] = {int(k): v for k, v in scan[proto].items()}

        if "error" in scan:
            findings.append(Finding(
                check_id="security_ports",
                severity=Severity.INFO,
                target=host_label,
                summary=f"scan échoué : {scan['error']}",
                drilldown=f"ssh {ssh_alias} 'sudo ss -tlnp'",
            ))
            continue

        # Ports à probe externalement (= tous sauf whitelist)
        candidate_ports = [
            p for p in scan.get("tcp", {}).keys()
            if p not in PORTS_PUBLIC_OK
        ]
        if not candidate_ports:
            continue

        # Probe en batch parallèle (cache 5 min par IP)
        probe_results = _probe_external_batch(public_ip, candidate_ports)

        tcp_ports = scan.get("tcp", {})
        for port in candidate_ports:
            if not probe_results.get(port, False):
                continue  # iptables bloque, pas un risque
            process = tcp_ports.get(port, "?")
            label = PORTS_PRIVATE_EXPECTED.get(port, "service inconnu")
            sev = Severity.WARN
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
    """Compte les tentatives SSH échouées sur 1h.

    Severity adaptée selon la config SSH du host :
    - host key-only (dans HOSTS_SSH_KEY_ONLY) : bruit Internet normal,
      flag uniquement si volume anormalement élevé (> SSH_BRUTE_HIGH_VOLUME)
    - host avec password auth : tout > 50/h est suspect (CRIT)
    """
    findings = []
    env_lbl = f',env="{env_filter}"' if env_filter else ""
    try:
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

        is_key_only = host in HOSTS_SSH_KEY_ONLY

        if is_key_only:
            # Host key-only : le bruit Internet est inoffensif.
            # On flag uniquement si volume anormalement élevé (DoS suspect ou 0day SSH).
            if n >= SSH_BRUTE_HIGH_VOLUME:
                sev = Severity.WARN
                msg = f"{n} tentatives SSH /h (key-only mais volume anormal)"
            elif n >= SSH_BRUTE_NORMAL_NOISE:
                # Visible mais pas inquiétant — on garde un INFO pour visibilité
                sev = Severity.INFO
                msg = f"{n} tentatives SSH /h (bruit Internet normal sur key-only)"
            else:
                continue
        else:
            # Host avec password auth : sérieux
            if n >= 50:
                sev = Severity.CRIT
                msg = f"{n} tentatives SSH /h (brute-force probable, password auth active)"
            elif n >= 10:
                sev = Severity.WARN
                msg = f"{n} tentatives SSH /h (brute-force débutant, password auth active)"
            else:
                continue

        findings.append(Finding(
            check_id="security_ssh",
            severity=sev,
            target=host,
            summary=msg,
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


# ----- Check : headers HTTP de sécurité sur les apps publiques -----
#
# Audit passif : un curl par domaine, lit les headers, flag les manquants.
# CRIT pour les apps auth/billing (hub, twenty, notifuse, analytics, prospection).
# WARN pour les apps publiques sans auth.

# Sous-domaines à auditer (domaine → criticité si headers manquants)
# - "crit" : app auth-protected, headers OBLIGATOIRES (hub, twenty, prospection, analytics, notifuse)
# - "warn" : app publique, headers recommandés (sites vitrines, cms)
# - "info" : domaines internes Dokploy/admin, on s'attend déjà à des headers,
#            mais l'absence reste pas critique business
HTTP_SECURITY_TARGETS = [
    ("app.veridian.site", "crit"),
    ("twenty.app.veridian.site", "crit"),
    ("notifuse.app.veridian.site", "crit"),
    ("analytics.app.veridian.site", "crit"),
    ("prospection.app.veridian.site", "crit"),
    ("dokploy.veridian.site", "info"),
]

# Headers de sécurité attendus. Map header (lowercase) → niveau (crit/warn/info)
SECURITY_HEADERS_EXPECTED = {
    "strict-transport-security": "crit",
    "x-frame-options": "crit",
    "x-content-type-options": "crit",
    "referrer-policy": "warn",
    "content-security-policy": "warn",
    "permissions-policy": "info",
}


@cached("security_http_headers", max_age_seconds=600)
def _fetch_headers(url: str, timeout: float = 6.0) -> dict | None:
    """HEAD request via curl. Retourne {header_lowercase: value} ou None si fail.

    On utilise subprocess(curl) plutôt que `requests` pour éviter de poller
    le DNS Python (résolution plus fiable + HTTP/2 supporté nativement).
    """
    try:
        proc = subprocess.run(
            ["curl", "-sI", "-L", "--max-time", str(int(timeout)),
             "-H", "User-Agent: veridian-obs-check/1.0",
             url],
            capture_output=True, text=True, timeout=timeout + 2,
        )
        if proc.returncode != 0:
            return None
        headers: dict[str, str] = {}
        for line in proc.stdout.splitlines():
            if ":" not in line:
                continue
            k, _, v = line.partition(":")
            headers[k.strip().lower()] = v.strip()
        return headers
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def check_security_http_headers(**_) -> CheckResult:
    """Vérifie que chaque app publique sert les headers de sécurité essentiels.

    Non-destructif : 1 HEAD request par domaine, 6s timeout, cache 10 min.
    """
    findings = []
    for domain, criticality in HTTP_SECURITY_TARGETS:
        url = f"https://{domain}/"
        headers = _fetch_headers(url)
        if headers is None:
            findings.append(Finding(
                check_id="security_http_headers",
                severity=Severity.INFO,
                target=domain,
                summary="HEAD request a échoué",
                drilldown=f"curl -sI {url}",
            ))
            continue

        missing = []
        for h_name, h_level in SECURITY_HEADERS_EXPECTED.items():
            if h_name not in headers:
                missing.append((h_name, h_level))

        if not missing:
            continue

        # Tier la severity : CRIT si app "crit" + au moins 1 header crit manque
        has_crit_missing = any(level == "crit" for _, level in missing)
        if criticality == "crit" and has_crit_missing:
            sev = Severity.CRIT
        elif criticality == "warn" or has_crit_missing:
            sev = Severity.WARN
        else:
            sev = Severity.INFO

        # Format : 3 headers manquants → liste courte
        missing_names = ", ".join(h for h, _ in missing[:4])
        if len(missing) > 4:
            missing_names += f" +{len(missing) - 4}"

        findings.append(Finding(
            check_id="security_http_headers",
            severity=sev,
            target=domain,
            summary=f"{len(missing)} headers sécu manquants : {missing_names}",
            drilldown=f"curl -sI {url} | grep -iE 'strict|x-frame|x-content|csp'",
        ))
    return CheckResult("security_http_headers", findings)


# ----- Check : panel admin Dokploy exposé Internet -----


def check_security_dokploy_exposed(**_) -> CheckResult:
    """Vérifie que dokploy.veridian.site n'est PAS accessible publiquement.

    Idéal : 403/401/timeout depuis une IP non-allowlistée → reverse-proxy
    a un middleware ipAllowList ou un Cloudflare Access devant.

    Réalité actuelle (2026-05-12) : répond 200 OK depuis n'importe où.
    """
    url = "https://dokploy.veridian.site/"
    headers = _fetch_headers(url)
    if headers is None:
        # Pas accessible = bon signe (probablement ipAllowList configuré ou tunnel)
        return CheckResult("security_dokploy_exposed", [Finding(
            check_id="security_dokploy_exposed",
            severity=Severity.INFO,
            target="dokploy.veridian.site",
            summary="non accessible publiquement (bon signe)",
            drilldown=f"curl -sI {url}",
        )])

    # Si on a une réponse, vérifier le code
    # _fetch_headers ne retourne pas le code directement, mais s'il a réussi
    # c'est qu'il y a au moins eu un 2xx/3xx. On va checker via curl directement.
    try:
        proc = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             "--max-time", "6", url],
            capture_output=True, text=True, timeout=10,
        )
        code = proc.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        code = "?"

    if code == "200":
        return CheckResult("security_dokploy_exposed", [Finding(
            check_id="security_dokploy_exposed",
            severity=Severity.CRIT,
            target="dokploy.veridian.site",
            summary="Dokploy admin UI exposé publiquement (HTTP 200 sans auth)",
            drilldown=f"curl -sI {url}  # voir infra/TODO.md P0.6",
        )])

    return CheckResult("security_dokploy_exposed", [])


# ----- Check : CORS wildcard sur apps auth-protected -----


# Apps où CORS *  est un risque critique (manipule cookies / tokens)
CORS_CRIT_DOMAINS = {
    "app.veridian.site",
    "twenty.app.veridian.site",
    "notifuse.app.veridian.site",
    "analytics.app.veridian.site",
    "prospection.app.veridian.site",
}


def check_security_cors_wildcard(**_) -> CheckResult:
    """Détecte `Access-Control-Allow-Origin: *` sur les apps auth-protected.

    Envoie un curl avec Origin: https://evil.com et vérifie si l'app
    accepte. Si oui + cookies présents = vrai problème.
    """
    findings = []
    for domain in CORS_CRIT_DOMAINS:
        url = f"https://{domain}/"
        try:
            proc = subprocess.run(
                ["curl", "-sI", "--max-time", "6",
                 "-H", "Origin: https://evil.com",
                 "-H", "User-Agent: veridian-obs-check/1.0",
                 url],
                capture_output=True, text=True, timeout=10,
            )
            if proc.returncode != 0:
                continue
            headers: dict[str, str] = {}
            for line in proc.stdout.splitlines():
                if ":" not in line:
                    continue
                k, _, v = line.partition(":")
                headers[k.strip().lower()] = v.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue

        aco = headers.get("access-control-allow-origin", "")
        acc = headers.get("access-control-allow-credentials", "").lower()

        if aco == "*":
            # Wildcard CORS — risque selon credentials
            if acc == "true":
                # Combo non-spec mais dangereux sur User-Agents permissifs
                findings.append(Finding(
                    check_id="security_cors_wildcard",
                    severity=Severity.CRIT,
                    target=domain,
                    summary="CORS * + Credentials: true (lecture cross-origin avec cookies)",
                    drilldown=f"curl -sI -H 'Origin: https://evil.com' {url}",
                ))
            else:
                findings.append(Finding(
                    check_id="security_cors_wildcard",
                    severity=Severity.WARN,
                    target=domain,
                    summary="CORS Access-Control-Allow-Origin: * sur app auth-protected",
                    drilldown=f"curl -sI -H 'Origin: https://evil.com' {url}",
                ))
        elif aco == "https://evil.com":
            # Reflète l'Origin tel quel = bypass total
            findings.append(Finding(
                check_id="security_cors_wildcard",
                severity=Severity.CRIT,
                target=domain,
                summary="CORS reflète l'Origin attaquant (allow https://evil.com)",
                drilldown=f"curl -sI -H 'Origin: https://evil.com' {url}",
            ))

    return CheckResult("security_cors_wildcard", findings)


# ----- Check : santé du bouncer CrowdSec (taux de 500/timeout) -----


def check_security_bouncer_health(loki: LokiClient, **_) -> CheckResult:
    """Détecte si le bouncer CrowdSec rame / fail-closed.

    Depuis 2026-05-13 P0.4 fix : le bouncer est un plugin Traefik intégré
    (maxlerebourg/crowdsec-bouncer-traefik-plugin v1.6.0) en mode stream.
    Le poll LAPI 1x/60s loggue `handleStreamCache:updated` quand OK,
    `handleStreamCache:...error` quand LAPI down. Si pas un seul OK en 5min,
    le cache du bouncer n'est plus rafraîchi → c'est un signal d'alerte.

    Garde aussi l'ancien check sur `code-crowdsec-traefik-bouncer-1` (fbonalair)
    au cas où il serait remis en route (rollback potentiel).
    """
    findings = []

    # --- Plugin Traefik (nouveau) ---
    try:
        plugin_ok = loki.query_instant(
            'sum(count_over_time({container="dokploy-traefik"} '
            '|~ "CrowdsecBouncerTraefikPlugin" |~ "handleStreamCache:updated" [10m]))'
        )
        plugin_err = loki.query_instant(
            'sum(count_over_time({container="dokploy-traefik"} '
            '|~ "CrowdsecBouncerTraefikPlugin" |~ "error|fail|unable" [10m]))'
        )
        n_ok = int(float(plugin_ok[0]["value"][1])) if plugin_ok else 0
        n_err = int(float(plugin_err[0]["value"][1])) if plugin_err else 0
    except Exception:
        n_ok = n_err = 0

    if n_ok == 0 and n_err == 0:
        findings.append(Finding(
            check_id="security_bouncer_health",
            severity=Severity.WARN,
            target="dokploy-traefik (plugin)",
            summary="Aucun log plugin CrowdSec sur 10min (ni OK ni erreur) — plugin actif ?",
            drilldown="obs tail dokploy-traefik | grep -i crowdsec",
        ))
    elif n_err > n_ok and n_err > 3:
        findings.append(Finding(
            check_id="security_bouncer_health",
            severity=Severity.CRIT,
            target="dokploy-traefik (plugin)",
            summary=f"Plugin CrowdSec : {n_err} erreurs vs {n_ok} OK sur 10min — LAPI joignable ?",
            drilldown="obs tail dokploy-traefik | grep -i crowdsec",
        ))

    # --- Ancien bouncer fbonalair (rollback safety) ---
    try:
        deadline_res = loki.query_instant(
            'sum(count_over_time({container="code-crowdsec-traefik-bouncer-1"} '
            '|~ "context deadline exceeded|context canceled" [15m]))'
        )
        total_res = loki.query_instant(
            'sum(count_over_time({container="code-crowdsec-traefik-bouncer-1"} [15m]))'
        )
        n_deadlines = int(float(deadline_res[0]["value"][1])) if deadline_res else 0
        n_total = int(float(total_res[0]["value"][1])) if total_res else 0
    except Exception:
        n_deadlines = n_total = 0

    if n_total > 0:
        pct = (n_deadlines / n_total) * 100
        if pct >= 20:
            findings.append(Finding(
                check_id="security_bouncer_health",
                severity=Severity.CRIT,
                target="code-crowdsec-traefik-bouncer-1 (legacy)",
                summary=f"{n_deadlines}/{n_total} ({pct:.1f}%) requêtes bouncer legacy en timeout — rollback en cours ?",
                drilldown="obs tail code-crowdsec-traefik-bouncer-1  # cf infra/TODO.md P0.4",
            ))
        elif pct >= 5:
            findings.append(Finding(
                check_id="security_bouncer_health",
                severity=Severity.WARN,
                target="code-crowdsec-traefik-bouncer-1 (legacy)",
                summary=f"{n_deadlines}/{n_total} ({pct:.1f}%) requêtes bouncer legacy en timeout",
                drilldown="obs tail code-crowdsec-traefik-bouncer-1",
            ))

    return CheckResult("security_bouncer_health", findings)


# ----- Check : Traefik voit-il les vraies IPs clients ? -----


# Ranges Cloudflare v4 (récupérés via api.cloudflare.com/client/v4/ips).
# Si Traefik log `ClientHost` dans ces ranges, c'est que `forwardedHeaders.trustedIPs`
# n'est pas configuré → CrowdSec ne peut pas bannir l'attaquant réel.
CLOUDFLARE_V4_PREFIXES = (
    "173.245.48.", "103.21.244.", "103.22.200.", "103.31.4.",
    "141.101.64.", "108.162.192.", "190.93.240.", "188.114.96.",
    "197.234.240.", "198.41.128.", "162.158.", "104.16.", "104.17.",
    "104.18.", "104.19.", "104.20.", "104.21.", "104.22.", "104.23.",
    "104.24.", "104.25.", "104.26.", "104.27.", "172.64.", "172.65.",
    "172.66.", "172.67.", "172.68.", "172.69.", "172.70.", "172.71.",
    "131.0.72.",
)


def check_security_traefik_real_ip(**_) -> CheckResult:
    """Vérifie que Traefik voit les vraies IPs clients, pas celles du proxy CF.

    Note 2026-05-13 : Traefik envoie ses access logs en OTLP gRPC (pas Loki),
    donc on lit directement les logs Docker via SSH. Les logs Traefik en INFO
    contiennent rarement ClientHost mais on regarde les éventuelles entrées
    JSON access-log qui auraient fui sur stdout.

    Symptôme bug : `ClientHost` dans logs Traefik commence par un range CF
    (ex `172.70.x.x`). Conséquences :
    - CrowdSec bannit Cloudflare au lieu de l'attaquant → DoS tous users CF
    - fail2ban-traefik-auth ne peut pas distinguer attaquants des proxies
    - Audit logs faussés
    """
    rc, out, _ = _ssh_run(
        "prod-pub",
        "docker logs --since 1h dokploy-traefik 2>&1 | grep -oE 'ClientHost\":\"[0-9.]+' | sort -u | head -50",
        timeout=15,
    )
    if rc != 0 or not out.strip():
        # Pas d'access logs sur stdout — c'est normal, vu qu'OTLP gRPC
        # est utilisé. Pas de finding, ce check est best-effort.
        return CheckResult("security_traefik_real_ip", [])

    cf_hosts: list[str] = []
    other_hosts: list[str] = []
    for line in out.strip().splitlines():
        ip = line.split('"')[-1]
        if any(ip.startswith(p) for p in CLOUDFLARE_V4_PREFIXES):
            cf_hosts.append(ip)
        else:
            other_hosts.append(ip)

    findings = []
    total = len(cf_hosts) + len(other_hosts)
    if cf_hosts and total > 0:
        pct = (len(cf_hosts) / total) * 100
        sample = ", ".join(cf_hosts[:3])
        findings.append(Finding(
            check_id="security_traefik_real_ip",
            severity=Severity.CRIT if pct > 5 else Severity.WARN,
            target="dokploy-traefik",
            summary=f"{len(cf_hosts)}/{total} IPs uniques observées sont CF ({sample}) — forwardedHeaders.trustedIPs incomplet ?",
            drilldown="ssh prod-pub 'docker logs --tail 100 dokploy-traefik | grep ClientHost'",
        ))

    return CheckResult("security_traefik_real_ip", findings)


# ----- Check : fail2ban jails actifs -----

# Jails minimum attendus sur prod. Manque l'un = lacune sécurité.
FAIL2BAN_JAILS_EXPECTED = {
    "sshd",
    # à ajouter après P0.5 :
    # "traefik-auth",
    # "dokploy-login",
}


@cached("security_fail2ban_jails", max_age_seconds=900)
def _list_fail2ban_jails_raw(ssh_alias: str) -> list[str] | None:
    """Liste les jails actifs sur un host. None si fail2ban absent.

    Retourne une liste (sérialisable JSON) — le cache convertit set→str sinon.
    """
    rc, out, _ = _ssh_run(ssh_alias, "sudo fail2ban-client status 2>/dev/null", timeout=10)
    if rc != 0:
        return None
    for line in out.splitlines():
        if "Jail list:" in line:
            parts = line.split("Jail list:")
            if len(parts) > 1:
                return sorted({j.strip() for j in parts[1].split(",") if j.strip()})
    return []


def _list_fail2ban_jails(ssh_alias: str) -> set[str] | None:
    raw = _list_fail2ban_jails_raw(ssh_alias)
    if raw is None:
        return None
    return set(raw)


def check_security_fail2ban_jails(env_filter: str | None = None, **_) -> CheckResult:
    """Audit fail2ban : container/service actif ? quels jails sont activés ?"""
    findings = []
    for host_label, ssh_alias, _ip in _hosts_to_audit(env_filter):
        jails = _list_fail2ban_jails(ssh_alias)
        if jails is None:
            findings.append(Finding(
                check_id="security_fail2ban_jails",
                severity=Severity.CRIT,
                target=host_label,
                summary="fail2ban absent ou service down",
                drilldown=f"ssh {ssh_alias} 'systemctl status fail2ban'",
            ))
            continue

        missing = FAIL2BAN_JAILS_EXPECTED - jails
        if missing:
            findings.append(Finding(
                check_id="security_fail2ban_jails",
                severity=Severity.WARN,
                target=host_label,
                summary=f"jails attendus manquants : {', '.join(sorted(missing))}",
                drilldown=f"ssh {ssh_alias} 'sudo fail2ban-client status'",
            ))
        # Pas de jail HTTP/Traefik = ticket P0.5 ouvert mais pas un finding direct
        # car on attend l'implémentation IaC. Si jails == {"sshd"} seul, c'est OK.
    return CheckResult("security_fail2ban_jails", findings)


# ----- Registry des checks security -----


SECURITY_CHECKS = [
    ("security_ports", check_security_ports),
    ("security_ssh", check_security_ssh_bruteforce),
    ("security_docker_version", check_security_docker_version),
    ("security_http_headers", check_security_http_headers),
    ("security_dokploy_exposed", check_security_dokploy_exposed),
    ("security_cors_wildcard", check_security_cors_wildcard),
    ("security_bouncer_health", check_security_bouncer_health),
    ("security_traefik_real_ip", check_security_traefik_real_ip),
    ("security_fail2ban_jails", check_security_fail2ban_jails),
]
