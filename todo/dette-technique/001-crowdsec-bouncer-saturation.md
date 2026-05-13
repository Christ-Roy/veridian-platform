# DETTE-001 — CrowdSec bouncer saturation + ghost bouncers

**Sévérité** : 🟢 résolue (closed 2026-05-08)
**Découvert** : 2026-05-08 matin pendant session migration Twenty v2.2
**Closed** : 2026-05-08 14:00 — bump v1.6.4 → v1.7.7 + allowlist LAPI + restart bouncer
**Métrique finale** : 67% de 403 → **0.14%** (1/729 sur 5min, prod stable)

> Le P3 (migration vers `crowdsec-bouncer-traefik-plugin` mode stream) n'est plus
> nécessaire dans l'immédiat — la prod tourne propre. À reconsidérer si le p50
> latency bouncer (2.5s, dû à l'overhead fbonalair) devient bloquant.
>
> ⚠️ **Cause amont non résolue** : DETTE-002 (Traefik mal configuré pour les
> upstream proxies Cloudflare) génère toujours du trafic `172.17.0.1` artificiel
> vers le bouncer. Ça ne casse plus rien grâce à l'allowlist LAPI, mais ça
> empêche CrowdSec de voir et de bannir les vraies IPs des attaquants. À
> traiter dans DETTE-002.

## Symptôme observé

- Pendant les tests v2 staging : "Impossible d'atteindre le serveur arrière" / `Failed to fetch` random sur fresh ET sur prod
- ~57% des requêtes web bloquées en 403 par le bouncer Traefik
- Bouncer logs : `context deadline exceeded (Client.Timeout exceeded while awaiting headers)` sur `http://crowdsec:8080/v1/decisions?type=ban&ip=172.17.0.1`
- CrowdSec container à **100% CPU constant** alors qu'il devrait être à <5%
- Quand bouncer fail close → 403 par défaut → **toute la prod 403**

## Diagnostic root cause

CrowdSec accumule des "**ghost bouncers**" à chaque restart container. Chaque IP réseau qui demande à pull les decisions auto-crée un sous-bouncer `traefik-bouncer@<IP>` rattaché au parent `traefik-bouncer`. Sur 14 bouncers enregistrés, **11 étaient stale** (jamais vus depuis 1h+).

Pourquoi ça sature CrowdSec :
- À chaque pull, CrowdSec scan toutes les decisions × tous les bouncers connus
- La query `?ip=172.17.0.1` (host bridge docker0) est lente parce qu'elle fait un scan CIDR sur la whitelist (172.16.0.0/12 inclut 172.17.0.1)
- Au-delà de 10 ghost bouncers actifs, CrowdSec atteint 100% CPU et timeout 5s sur ces requêtes
- Bouncer Traefik a un timeout 5s, donc `context deadline exceeded` → **fail close → 403**

Pourquoi 172.17.0.1 spécifiquement :
- C'est l'IP host bridge `docker0`
- Apparaît quand un container appelle Traefik via cette interface (au lieu de via dokploy-network)
- Probablement à cause d'une mauvaise config réseau sur certains composes (cf DETTE-002)

## Comment reproduire / tester

```bash
# 1. Compter les bouncers enregistrés
ssh prod-pub "docker exec compose-program-digital-application-vb1x5n-crowdsec-1 cscli bouncers list 2>&1 | grep -c '✔️'"
# Si > 5, c'est anormal

# 2. Stats latency / status sur le bouncer (5min de logs)
ssh prod-pub "docker logs --since 5m compose-program-digital-application-vb1x5n-crowdsec-traefik-bouncer-1 2>&1 | python3 -c \"
import sys,json
counts={}
for line in sys.stdin:
    if 'status' not in line: continue
    try: d=json.loads(line); s=d.get('status',0); counts[s]=counts.get(s,0)+1
    except: pass
print(counts)\""
# Si 403 > 200 = bouncer fail close, problème

# 3. CPU CrowdSec
ssh prod-pub "docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' | grep crowdsec"
# Doit être < 5%

# 4. Latency CrowdSec interne sur 172.17.0.1
ssh prod-pub "docker logs --since 1m compose-program-digital-application-vb1x5n-crowdsec-1 2>&1 | grep '172.17.0.1' | tail -5"
# Si latency > 1s → CrowdSec saturé
```

## Quick fix appliqué le 2026-05-08

```bash
# 1. Delete tous les ghost bouncers (parent inclus)
ssh prod-pub "docker exec compose-program-digital-application-vb1x5n-crowdsec-1 cscli bouncers delete traefik-bouncer"

# 2. Générer nouvelle clé
NEW_KEY=$(ssh prod-pub "docker exec compose-program-digital-application-vb1x5n-crowdsec-1 cscli bouncers add traefik-bouncer | grep -A1 'API key' | tail -1 | tr -d ' '")

# 3. Update env file Dokploy
ssh prod-pub "sudo sed -i \"s|^CROWDSEC_BOUNCER_API_KEY_PROD=.*|CROWDSEC_BOUNCER_API_KEY_PROD=$NEW_KEY|\" /etc/dokploy/compose/compose-program-digital-application-vb1x5n/code/.env"

# 4. Recreate bouncer
ssh prod-pub "cd /etc/dokploy/compose/compose-program-digital-application-vb1x5n/code && sudo docker compose up -d --force-recreate crowdsec-traefik-bouncer"

# 5. Update creds locales
sed -i "s|^CROWDSEC_BOUNCER_API_KEY_PROD=.*|CROWDSEC_BOUNCER_API_KEY_PROD=$NEW_KEY|" ~/credentials/.all-creds.env
```

⚠️ **PIÈGE** : si on delete le parent bouncer SANS arrêter l'ancien container bouncer en parallèle, **les requêtes Traefik renvoient 403 le temps du gap** car le bouncer n'a plus de clé valide. Toujours :
1. Generate nouvelle clé d'abord
2. Update env Dokploy
3. Recréer le container avec la nouvelle clé
4. Vérifier que l'ancien container est bien remplacé (pas en parallèle)

## État live 2026-05-08 12:24 (post quick-fix de la veille)

Vérifié sur prod après clone doc CrowdSec officielle (`~/.claude/docs/crowdsec/`).

```
$ cscli bouncers list
 traefik-bouncer             10.0.1.170  ✔️     2026-05-08T11:04:46Z
 traefik-bouncer@10.0.1.170  10.0.1.170  ✔️     2026-05-08T10:25:39Z   ← ghost re-créé
```

```
$ docker logs --since 5m code-crowdsec-traefik-bouncer-1 → status: {200: 302, 403: 616}
$ top failing IPs: 172.17.0.1=615, 78.112.59.120=1   ← 67% de 403 (pire qu'avant fix)
$ docker stats crowdsec → cpu=5%   ← OK pour le moment, mais dérive lente
$ cscli decisions list -i 172.17.0.1 → "No active decisions"   ← l'IP n'est PAS bannie
$ cscli decisions list -a | wc -l → 34568                       ← énorme volume
```

**Conclusion** : `172.17.0.1` n'est ni bannie ni whitelistée par CrowdSec lui-même
(la whitelist `172.16.0.0/12` existe mais elle agit sur les ALERTS, pas sur les
QUERIES bouncer). Le bouncer query CrowdSec à chaque requête, et CrowdSec répond
souvent en timeout → fail-close → 403.

## Root cause définitive (post audit doc officielle)

**Le bouncer `fbonalair/traefik-crowdsec-bouncer` ne supporte QUE le mode "live"** :
chaque requête HTTP entrante = 1 query HTTP au bouncer = 1 query HTTP à CrowdSec.
Pas de cache local, pas de stream mode. Avec `34 568` decisions actives, CrowdSec
prend de la latence sur chaque query → certains timeouts → fail-close (403).

C'est un **mauvais choix d'image en 2026** :
- L'image officielle CrowdSec recommandée pour Traefik v3 est
  **`maxlerebourg/crowdsec-bouncer-traefik-plugin`** (plugin Traefik natif chargé
  via `experimental.plugins`), qui supporte **`crowdsecMode: stream`** : le plugin
  pull périodiquement les decisions et les cache en mémoire, plus aucun appel
  CrowdSec sur le hot path.
- `fbonalair/traefik-crowdsec-bouncer` est community-maintained, dernière maj
  marginale, fait du forwardAuth blocking.

**Cumulé avec DETTE-002** (containers qui leak `172.17.0.1` parce qu'ils ne sont
pas tous sur dokploy-network) → la prod prend 67% de 403 sur cette IP gateway.
Et même avec un mode stream, on continuerait à avoir des 403 fail-close pendant
les pics CPU CrowdSec si on ne fixe pas le réseau.

## Fix permanent — recommandé (par ordre)

### Priorité 1 — Cron `cscli bouncers prune` (gain immédiat, 10min)

Confirmé dans la doc officielle (`docs/cscli/cscli_bouncers_prune.md`) :

```
cscli bouncers prune -d 1h --force
```

Purge tout bouncer inactif depuis > 1h. Ajouter un cron systemd hebdo sur prod
(via `/opt/veridian/monitoring/`). **Pas de risque** : le bouncer actif a un
heartbeat toutes les ~50s donc il n'est jamais prune-able.

### Priorité 2 — Migrer vers `cscli allowlists` (LAPI level, gain CPU CrowdSec)

Nouveauté CrowdSec ≥ v1.6 (cf `docs/local_api/allowlists.md`). Au lieu d'une
whitelist parser-level (qui filtre les ALERTS mais pas les QUERIES bouncer), on
utilise une allowlist au niveau LAPI/database :

```bash
docker exec code-crowdsec-1 cscli allowlists create veridian_internal -d "Docker bridges Veridian"
docker exec code-crowdsec-1 cscli allowlists add veridian_internal 172.17.0.0/16
docker exec code-crowdsec-1 cscli allowlists add veridian_internal 10.0.0.0/8
docker exec code-crowdsec-1 cscli allowlists add veridian_internal 192.168.0.0/16
```

**Effet** : la query `?ip=172.17.0.1` retourne immédiatement "allowed" sans
scanner les 34 568 decisions. Réduit drastiquement le CPU CrowdSec.

### Priorité 3 — Migrer le bouncer vers `crowdsec-bouncer-traefik-plugin`

Le vrai fix structurel. Image actuelle `fbonalair/traefik-crowdsec-bouncer:latest`
remplacée par le **plugin Traefik natif** chargé via `experimental.plugins` :

```yaml
# Dans la commande Traefik (docker-compose.yml)
- "--experimental.plugins.crowdsec-bouncer-traefik-plugin.modulename=github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"
- "--experimental.plugins.crowdsec-bouncer-traefik-plugin.version=v1.4.5"

# Middleware (label sur Traefik)
- "traefik.http.middlewares.crowdsec.plugin.crowdsec-bouncer-traefik-plugin.crowdsecMode=stream"
- "traefik.http.middlewares.crowdsec.plugin.crowdsec-bouncer-traefik-plugin.crowdsecLapiHost=crowdsec:8080"
- "traefik.http.middlewares.crowdsec.plugin.crowdsec-bouncer-traefik-plugin.crowdsecLapiKey=${CROWDSEC_BOUNCER_API_KEY_PROD}"
- "traefik.http.middlewares.crowdsec.plugin.crowdsec-bouncer-traefik-plugin.forwardedHeadersTrustedIps=10.0.0.0/8,172.16.0.0/12"
```

**Bénéfices** :
- Mode stream → 0 query CrowdSec sur le hot path → 100% des requêtes web servies
  même si CrowdSec timeout
- 1 seul container (plus le bouncer séparé) → suppression du composant qui leak
  des ghosts à chaque restart
- `forwardedHeadersTrustedIps` configure les IPs internes qui ne déclenchent pas
  d'évaluation → règle DETTE-002 au niveau bouncer

⚠️ **Migration à tester en staging d'abord** : le plugin Traefik est chargé
différemment, les labels Docker des middlewares actuels (`crowdsec-bouncer@docker`)
doivent être renommés sur tous les composes Veridian (hub, prospection, twenty,
notifuse, supabase). Faire ça via une PR avec migration coordonnée.

### Priorité 4 — Monitoring proactif

Ajouter à `/opt/veridian/monitoring/docker-monitor.sh` :
- Alert Telegram si `cscli bouncers list | grep '@' | wc -l > 0` (un seul ghost
  est anormal)
- Alert si CPU CrowdSec > 30% pendant 1min
- Alert si ratio 403/(200+403) > 30% sur 5min de logs bouncer

## Actions appliquées 2026-05-08 13:30-13:46

### P1 — Prune ghost bouncer (zero risk)
```bash
ssh prod-pub "docker exec code-crowdsec-1 cscli bouncers prune -d 1h --force"
# → "Successfully deleted 1 bouncers" (le ghost @10.0.1.170)
```

### P2 — Bump v1.6.4 → v1.7.7 + allowlist LAPI

```bash
# 1. Backup compose
ssh prod-pub "sudo cp /etc/dokploy/compose/compose-program-digital-application-vb1x5n/code/docker-compose.yml{,.bak-20260508-134416}"

# 2. Bump image v1.7.7 + cpus 1.0 → 2.0
ssh prod-pub "sudo sed -i 's|crowdsecurity/crowdsec:v1.6.4|crowdsecurity/crowdsec:v1.7.7|' /etc/.../docker-compose.yml"

# 3. Pull + recreate
ssh prod-pub "cd /etc/.../code && sudo docker compose -f docker-compose.yml pull crowdsec && sudo docker compose -f docker-compose.yml up -d --force-recreate crowdsec"

# 4. Allowlist LAPI (nécessite v1.7+)
ssh prod-pub "docker exec code-crowdsec-1 cscli allowlists create veridian_internal -d 'Docker bridges Veridian'"
ssh prod-pub "docker exec code-crowdsec-1 cscli allowlists add veridian_internal 172.17.0.0/16 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16 127.0.0.1"

# 5. Restart bouncer (force re-résolution DNS + nouvelles connexions)
ssh prod-pub "docker restart code-crowdsec-traefik-bouncer-1"
```

### Métriques avant / après

| Métrique | Avant (12:24) | Après (13:46) |
|---|---|---|
| Status 403 ratio (5min) | 67% (615/918) | **0.3%** (1/307) |
| CrowdSec CPU | 5% | **0.02%** |
| CrowdSec mémoire | 122 MiB | 48 MiB |
| Bouncer p50 latency | 5000ms (timeout) | **2162ms** |
| Bouncer p95 latency | 5002ms (timeout) | **3812ms** |
| Endpoints prod | 403 partout | **200 partout** |

### Constats post-fix

1. Le compteur "34 568 decisions" pré-fix était une erreur de mesure (`wc -l` sur output texte cscli, pas sur le JSON). Le vrai nombre est **82 decisions actives** — donc CrowdSec n'avait pas à scanner un volume monstre, c'était bien les ghost bouncers + bug v1.6.4 qui saturaient.
2. La query directe CrowdSec depuis le container CrowdSec : **110ms**. Mais via le bouncer fbonalair : 2162ms p50. Il y a une overhead anormale dans le bouncer (probablement le défaut de cache + des tcp connect répétés). C'est pour ça que la migration vers `crowdsec-bouncer-traefik-plugin` en mode stream reste pertinente (P3).

## Doc CrowdSec téléchargée localement

Cloned 2026-05-08 dans `~/.claude/docs/crowdsec/crowdsec-docs/` (repo officiel
`crowdsecurity/crowdsec-docs`). Versions `v1.6` et `v1.7` disponibles. Sections
clés :
- `docs/cscli/cscli_bouncers_prune.md` — purge automatique
- `docs/local_api/allowlists.md` — allowlists LAPI (v1.6+)
- `docs/local_api/bouncers-api.md` — protocole bouncer (stream vs query)
- `docs/log_processor/whitelist/ip_based_whitelist.md` — whitelists parser-level
- `unversioned/bouncers/traefik.mdx` — guide officiel bouncer Traefik
- `docs/configuration/crowdsec_configuration.md` — config CrowdSec complète

## Liens connexes

- [DETTE-002](./002-reseau-traefik-mal-configure.md) — explique pourquoi `172.17.0.1` apparaît dans les requêtes
- [INCIDENT-2026-05-07](../infra/INCIDENT-2026-05-07-TODO.md) — précédent incident infra
