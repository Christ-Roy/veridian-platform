# Audit sécurité — stack obs Veridian
> Date : 2026-05-12
> Status : Alloy OTLP sécurisé ✅, autres ports à auditer séparément (hors scope obs)

## Récap audit

Audit fait suite à la mise en place de la stack obs (Alloy + Grafana Cloud) le 2026-05-12.
Question initiale : "rien n'est accessible publiquement et lié au vps ? pas de cybersécu à gérer ?"

### Ports LISTEN sur PROD VPS (vps-10f2bc7c) au 2026-05-12 18:25

| Port | Service | Exposition | Statut sécurité | Action |
|------|---------|------------|----------------|--------|
| **22** | SSH | 0.0.0.0 (Internet) | ⚠️ Auth par clé SSH OK mais bots permanents | Auditer fail2ban séparément |
| **2222** | SSH alt | 0.0.0.0 (Internet) | ⚠️ Doublon SSH, raison à clarifier | À investiguer |
| **80** | Traefik HTTP | 0.0.0.0 | ✅ Redir HTTPS, normal | OK |
| **443** | Traefik HTTPS | 0.0.0.0 | ✅ Letsencrypt + CrowdSec ForwardAuth | OK |
| **3000** | Dokploy UI | 0.0.0.0 (Internet) | ⚠️ Auth applicatif OK, mais exposé | Vérifier 2FA + CrowdSec |
| **2377** | Docker Swarm mgmt | bind * + iptables DROP from WAN | ✅ Fix 2026-05-12 | OK |
| **7946** | Docker Swarm gossip | bind * + iptables DROP from WAN (TCP+UDP) | ✅ Fix 2026-05-12 | OK |
| **4789 (UDP)** | Docker VXLAN overlay | iptables DROP from WAN | ✅ Fix 2026-05-12 | OK |
| **4317, 4318** | Alloy OTLP | bind * + iptables DROP from WAN | ✅ Fix 2026-05-12 | OK (voir ci-dessous) |
| **53** | unbound DNS | 127.0.0.1 | ✅ Local only | OK |
| **12345** | Alloy UI | 127.0.0.1 | ✅ Local only | OK |
| **8082** | Traefik metrics | Docker bridge | ✅ Pas exposé directement | OK |
| **8384** | Syncthing UI | 127.0.0.1 | ✅ Local only | OK |
| **22000, 62727** | Syncthing/Tailscale | Tailscale only | ✅ | OK |

### Hors scope obs (à auditer séparément)

Ces ports sont **pré-existants** à la stack obs et leur audit dépasse le scope :

- SSH (22) : devrait être ban list-only via fail2ban, vérifier
- SSH alt (2222) : raison historique à comprendre
- Dokploy UI (3000) : règle iptables Tailscale-only déjà en place, à confirmer

→ Ticket à créer dans `todo/infra/TODO.md` pour audit cybersec global plus tard.

## Fix Docker Swarm 2377 / 7946 / 4789 (2026-05-12)

### Problème

Audit suite à question Robert : "docker swarm devrait être sous vpn et pas
exposé sur internet il est attaquable cve ?"

Vérification : 2377/7946 (TCP+UDP) + 4789 (UDP) bind sur 0.0.0.0 sur **les
deux** VPS (prod ET dev). Test nc depuis Internet → OPEN.

Diagnostic Swarm : **2 swarms séparés**, pas un cluster joint :
- prod : 1 manager (lui-même), 1 node — utilisé par Dokploy pour 3 services
- dev : 1 manager (lui-même), 1 node — utilisé par Dokploy pour 0 service
- Dokploy multi-server utilise Docker contexts SSH, **pas** Swarm cluster

Donc les ports sont **inutiles** sur Internet — surface d'attaque pour rien.

### CVE concernées (recherche 2024-2026)

- **Pas de RCE pré-auth connue** sur 2377 — Swarm utilise mTLS obligatoire
  via PKI auto-signée au `swarm init`. Sans cert client signé par la CA, le
  handshake TLS est rejeté avant accès API.
- **CVE-2024-41110** (9.9 critical) : API Engine HTTP, AuthZ bypass via
  Content-Length:0. NE concerne PAS 2377 mais l'API Engine (2375/2376/socket).
- **CVE-2026-34040** (8.8 high) : API Engine, AuthZ bypass via body >1MB.
  Fixed 29.3.1, nous sommes en 28.2.2 → présent mais requiert creds API.
- **CVE-2025-54388** (moderate) : firewalld reload réexpose les ports
  containers publiés. Pas appliqué (on n'utilise pas firewalld) mais à noter.
- **UDP 4789 VXLAN** : Docker doc dit explicitement "should never be opened
  at a perimeter firewall". Sans encryption overlay (défaut), injection de
  trafic possible dans les réseaux overlay.

### Tentative 1 (échec) : DOCKER-USER chain

J'avais d'abord mis les règles dans `DOCKER-USER` (chaîne Docker préservée
entre restarts). **Résultat : ports toujours OPEN sur Internet**.

Explication : `DOCKER-USER` filtre le trafic FORWARDÉ vers des containers
(ports publiés via `-p`). Les ports Swarm sont écoutés par **dockerd
lui-même sur l'host**, donc chaîne **INPUT** s'applique, comme pour Alloy.

### Solution retenue : iptables INPUT (comme Alloy)

Mêmes règles que pour 4317/4318 mais appliquées à 2377/7946/4789 :
- ACCEPT depuis `127.0.0.0/8`
- ACCEPT depuis `172.16.0.0/12` (Docker bridges + overlays)
- ACCEPT depuis `100.64.0.0/10` (Tailscale CGNAT)
- DROP tout le reste

Le script `secure-host.sh` cleanup les vieilles règles DOCKER-USER aussi.

### Vérification post-fix

```
# Depuis Internet (PC local) — TOUS BLOQUÉS :
nc -zv 51.210.7.44 2377  → CLOSED ✅
nc -zv 51.210.7.44 7946  → CLOSED ✅
nc -zv 37.187.199.185 2377  → CLOSED ✅
nc -zv 37.187.199.185 7946  → CLOSED ✅

# Depuis Tailscale (100.88.202.29) — OPEN si jamais on veut un node distant :
nc -zv 100.88.202.29 2377  → OPEN ✅

# Intégrité Swarm + Dokploy : intacts
docker node ls  → Leader OK
docker service ls  → 3 services UP
endpoints HTTPS  → 200/307 (aucun impact)
```

### Script

`grafana/scripts/secure-host.sh <ssh-target>` — couvre :
- 4317/4318 (Alloy OTLP)
- 2377 (Swarm management)
- 7946 TCP+UDP (Swarm gossip)
- 4789 UDP (VXLAN overlay)

Idempotent. À relancer pour tout nouveau VPS au monitoring.

## Fix Alloy OTLP (4317/4318)

### Problème

Lors du setup tracing Traefik le 2026-05-12, j'ai configuré Alloy pour recevoir
OTLP sur `0.0.0.0:4317/4318`. Confirmation depuis Internet :
```
nc -zv 51.210.7.44 4317  → Connection succeeded
nc -zv 51.210.7.44 4318  → Connection succeeded
```

**Risques** :
1. Quota burning : attaquant balance 50 GB de traces bidon → free tier saturé
2. Pollution observabilité : fake traces dans Tempo, debug compromis
3. DoS Alloy : flood gRPC → OOM

### Tentative 1 (échec) : bind sur 10.0.1.1 (gateway dokploy-network)

L'IP gateway du réseau dokploy-network apparaît dans `docker network inspect`
(10.0.1.1) mais **n'est PAS bindable sur l'host** parce que dokploy-network
est un réseau **Docker Swarm overlay**, pas un bridge classique. Erreur :
```
listen tcp 10.0.1.1:4317: bind: cannot assign requested address
```

### Solution retenue : iptables drop from WAN

Alloy bind sur `0.0.0.0` (nécessaire pour réseaux overlay Docker Swarm).
iptables INPUT filtre :
- ACCEPT depuis `127.0.0.0/8` (loopback)
- ACCEPT depuis `172.16.0.0/12` (toutes plages Docker)
- ACCEPT depuis `100.64.0.0/10` (CGNAT, dont Tailscale)
- DROP tout le reste

Règles sauvegardées dans `/etc/iptables/rules.v4` via `iptables-persistent`
→ persistent au reboot.

### Vérification post-fix

```
# Depuis Internet (mon PC) :
nc -zv 51.210.7.44 4317  → BLOQUÉ ✅
nc -zv 51.210.7.44 4318  → BLOQUÉ ✅

# Depuis container Traefik :
nc -zv 51.210.7.44 4317  → OPEN ✅ (matche 172.16.0.0/12 source via masquerade)

# Spans à Tempo : 198 envoyés en 30s ✅
```

### Script de reproduction

`grafana/scripts/secure-alloy.sh <ssh-target>` — idempotent, à relancer si
on ajoute un VPS au monitoring.

```bash
./grafana/scripts/secure-alloy.sh prod-pub
./grafana/scripts/secure-alloy.sh dev-pub
```

## Best practices à retenir

1. **Toujours auditer les ports LISTEN après avoir installé un agent**.
   `sudo ss -tlnp` + scan externe `nc -zv <pub-ip> <port>` pour confirmer.
2. **Réseaux Docker Swarm overlay ne sont pas bindables côté host** — utiliser
   iptables ou containeriser l'agent.
3. **iptables-persistent obligatoire** pour que les règles survivent reboot.
4. **Documenter dans `runbooks/incidents/` ou audit** chaque ouverture de port.
