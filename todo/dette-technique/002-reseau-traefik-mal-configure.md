# DETTE-002 — Réseau Traefik / dokploy-network mal configuré

**Sévérité** : 🟠 haute (impact sécurité, pas de breakage)
**Découvert** : 2026-05-08 pendant session migration Twenty v2.2
**Affiné** : 2026-05-08 14:00 après fix DETTE-001 — vraie cause identifiée

## Vraie cause root (mise à jour 2026-05-08 14:00)

**Traefik n'est pas configuré pour faire confiance aux upstream proxies (Cloudflare).**

Inspecté `dokploy-traefik:/etc/traefik/traefik.yml` :

```yaml
entryPoints:
  web:
    address: :80
  websecure:
    address: :443
    # ← MANQUE: forwardedHeaders.trustedIPs avec les CIDR Cloudflare
```

**Conséquence** : quand une requête arrive via Cloudflare → Traefik considère
que l'IP source = l'interface réseau immédiate (gateway docker0 = 172.17.0.1)
au lieu de lire le `X-Forwarded-For` de Cloudflare. Cette IP est ensuite
forwardée au bouncer CrowdSec via `X-Real-Ip`.

C'est confirmé par `docker inspect dokploy-traefik` : `gateway=172.17.0.1`.
User-agent du bouncer log = `Go-http-client/1.1` = Traefik lui-même.

**Doc CrowdSec officielle** (`unversioned/bouncers/traefik.mdx`) le dit
explicitement :

> When Traefik operates behind a load balancer, CDN, or any intermediate proxy,
> proper forwarding and trust of client IP information is required for CrowdSec
> to apply decisions accurately. Traefik must first be configured to trust the
> upstream IP ranges via `forwardedHeaders.trustedIPs`.

## Impact sécurité

- **CrowdSec ne voit jamais les vraies IPs des attaquants** — toutes les
  requêtes arrivent en tant que `172.17.0.1` du POV bouncer. Donc :
  - Les scénarios CrowdSec (bruteforce, scan, etc.) déclenchent sur
    `172.17.0.1`, IP qu'on ne peut pas bannir (allowlistée + trafic légitime
    interne y passe aussi)
  - Les bans de la communauté CrowdSec (CAPI) ne servent à rien car les IPs
    arrivent masquées
  - On a un IPS aveugle qui consomme du CPU pour rien
- L'allowlist LAPI Veridian (mise en place pour DETTE-001) masque ce problème
  côté disponibilité, mais le trou de sécurité reste

**Impact 2026-05-07 verger-shop** : ce trou n'a probablement PAS aidé
l'attaquant directement (entrée par CVE Next.js, pas par bypass CrowdSec),
mais il aurait pu masquer les IPs scanner pré-attaque.

**Impact disponibilité** : nul depuis fix DETTE-001 (allowlist LAPI absorbe).

## Symptômes observés (historiques pré-fix DETTE-001)

### Symptôme 1 : `172.17.0.1` (host docker0 bridge) leak

Le bouncer CrowdSec reçoit régulièrement des requêtes pour vérifier l'IP `172.17.0.1` :

## Symptômes observés

### Symptôme 1 : `172.17.0.1` (host docker0 bridge) leak

Le bouncer CrowdSec reçoit régulièrement des requêtes pour vérifier l'IP `172.17.0.1` :
```
{"level":"warn","status":403,"method":"GET","path":"/api/v1/forwardAuth","ip":"172.17.0.1",...}
```

`172.17.0.1` = passerelle docker0 (host bridge default). **Ne devrait jamais apparaître** dans une requête Traefik si le réseau est bien configuré (les containers devraient atteindre Traefik via `dokploy-network` 10.0.1.x).

Apparait quand un container fait une requête sortante via une route docker0 au lieu de via le réseau interne dokploy. Vu sur tous les composes Twenty (prod, fresh, v2-staging).

### Symptôme 2 : cert wildcard ne couvre que 1 niveau

Twenty v2.2 redirige `twenty-v2.app.veridian.site/welcome` vers `app.twenty-v2.app.veridian.site/welcome` (DEFAULT_SUBDOMAIN=app). Le wildcard cert Let's Encrypt sur `*.twenty-v2.app.veridian.site` couvre `app.*`, MAIS pour les sous-domaines workspace `<workspace>.twenty-v2.app.veridian.site` ET le `app.<workspace>...` ça commence à devenir tordu.

### Symptôme 3 : routers @docker conflictuels avec routers @file

Dokploy applique les domains via labels Docker → router `@docker`. Quand on crée un fichier dynamique Traefik (`/etc/dokploy/traefik/dynamic/*.yml`) avec une rule plus complète (HostRegexp + wildcard SAN), on a 2 routers actifs simultanément avec priority différente. Source de confusion et de cert non-wildcard servi parfois.

## Diagnostic

### Pourquoi 172.17.0.1 leak

Hypothèse : les containers Twenty staging on un réseau `_default` créé automatiquement par Docker (172.28.x ou 172.26.x). Les containers ont 3 networks : `_default`, `_twenty-internal`, `dokploy-network`.

Quand un container fait sa healthcheck `curl http://localhost:3000/healthz` ou un appel sortant vers Traefik via le DNS `dokploy-traefik`, Docker peut router via la mauvaise interface (docker0 → `172.17.0.1`).

```bash
# Compose prod twenty-server :
ssh prod-pub "docker inspect compose-parse-optical-array-lvh5md-twenty-server-1 --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} ip={{\$v.IPAddress}}/{{\$v.IPPrefixLen}} gateway={{\$v.Gateway}}{{println}}{{end}}'"
# compose-parse-optical-array-lvh5md_default ip=172.26.0.2/16 gateway=172.26.0.1
# compose-parse-optical-array-lvh5md_twenty-internal ip=172.20.0.5/16 gateway=172.20.0.1
# dokploy-network ip=10.0.1.22/24 gateway=invalid IP
```

Le `gateway=invalid IP` sur dokploy-network est suspect — peut-être lié.

### Pourquoi cert wildcard limité

Let's Encrypt n'émet qu'un wildcard `*.X` (1 niveau). Pour `*.*.twenty-v2.app.veridian.site` faudrait soit 2 wildcards séparés, soit éviter les sous-sous-domaines.

Twenty multi-tenant utilise `<workspace>.<base>` (1 niveau OK), mais le `DEFAULT_SUBDOMAIN=app` ajoute un niveau supplémentaire qui complique tout en staging quand `<base>` est déjà multi-niveau (`twenty-v2.app.veridian.site`).

## Comment reproduire / tester

```bash
# 1. Vérifier les networks d'un container
ssh prod-pub "docker inspect <container> --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} ip={{\$v.IPAddress}}{{println}}{{end}}'"

# 2. Vérifier que les requêtes sortantes ne passent pas par docker0
ssh prod-pub "docker exec <container> ip route show"
# La route default ne devrait PAS pointer vers 172.17.0.1

# 3. Vérifier les routers Traefik en double
ssh prod-pub "docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers 2>/dev/null | python3 -c \"
import sys,json
d = json.load(sys.stdin)
hosts = {}
for r in d:
    rule = r.get('rule','')
    for h in rule.split('||'):
        if 'Host(' in h:
            host = h.split('\`')[1] if '\`' in h else h
            hosts.setdefault(host,[]).append(r['name'])
for h, rs in hosts.items():
    if len(rs) > 1:
        print(f'CONFLICT {h}: {rs}')\""

# 4. Tester wildcard cert depuis l'extérieur
echo | openssl s_client -connect 51.210.7.44:443 -servername sub.host.veridian.site 2>/dev/null | openssl x509 -noout -ext subjectAltName
```

## Avancement 2026-05-08 14:15

### Étape 1 : ✅ DONE — `forwardedHeaders.trustedIPs` ajouté

Modifié `/etc/dokploy/traefik/traefik.yml` (backup `.bak-20260508-140154`),
ajouté CIDR Cloudflare IPv4/IPv6 + réseaux Docker internes dans
`entryPoints.web.forwardedHeaders.trustedIPs` ET `entryPoints.websecure...`.
Restart Traefik clean, prod tourne. Maintenant pour les **visiteurs externes
réels**, CrowdSec voit la vraie IP via le `X-Forwarded-For` Cloudflare.

### Étape 2 : ✅ FIX SHIPPÉ EN PROD — Notifuse scheduler self-call (2026-05-08 14:45)

**Mesures avant/après confirmées** :

| Métrique | Avant fix (60s) | Après fix (60s) |
|---|---|---|
| Hits bouncer 172.17.0.1 | **224** (97% du trafic) | **0** (0%) |
| Total lignes bouncer | 230 | 6 |
| IPs externes vues | masquées | 78.x.x.x (visiteur réel), Better Uptime, IPv6 légitime |

CrowdSec voit enfin les vraies IPs externes et peut faire son travail (ban
des scanners, scénarios bruteforce, etc.) au lieu d'être noyé par 96% de
trafic auto-référent.

**Trafic Cloudflare sortant** : ~480k req/jour vers Cloudflare → ~0
(scheduler reste 100% local container via `localhost:8081`).

**Latence cron interne** : 50-100ms (RTT public) → <1ms (loopback).



**Découvert** : 2026-05-08 14:10, en activant les accessLog Traefik 20s pour
identifier la source des hits 172.17.0.1.

**Constat** : sur 20 secondes, **112 requêtes sur `notifuse.app.veridian.site/api/tasks.execute`
viennent de 172.17.0.1**. Soit ~5-6 req/sec, ~336/min. C'est 96% du trafic
qui passe par le bouncer CrowdSec.

**Mesure baseline confirmée 2026-05-08 14:30** : 224 hits/60s = 224/min
sur le bouncer = 97% du trafic CrowdSec (224/230 lignes).

**Cause** : `compose-transmit-open-source-microchip-k9lvap-notifuse-1` a
`API_ENDPOINT=https://notifuse.app.veridian.site` dans son env. Le cron
interne Notifuse s'auto-appelle via cette URL publique → outbound HTTPS via
docker0 → Cloudflare → revient sur Traefik. Traefik voit l'IP TCP source
(`172.17.0.1` = gateway docker0) et la forwarde au bouncer.

**Conséquences** :
- ~330 req/min de trafic interne sortant inutilement vers Cloudflare puis
  rebrousse chemin (latence, bande passante, pollution logs)
- 96% du trafic CrowdSec est ce trafic auto-référent
- Empêche CrowdSec de voir la vraie répartition des visiteurs externes (les
  vraies IPs sont noyées dans le bruit)

**Fix appliqué** (2026-05-08 14:30, commit `57df7c42` branche veridian) :

Audit du code Go fork a confirmé que `API_ENDPOINT` sert à 2 usages
incompatibles :
1. **Self-call HTTP scheduler** (`internal/service/task_service.go:330` →
   `POST ${apiEndpoint}/api/tasks.execute`) — devrait pointer en interne
2. **URLs publiques dans les emails** (`pkg/notifuse_mjml/template_compilation.go`
   → click tracking `/r/<token>` et open pixel `/t/<token>`) — DOIT rester
   public sinon les emails envoyés aux destinataires sont cassés

**Patch fork** : ajout d'une nouvelle var `INTERNAL_API_ENDPOINT` + helper
`Config.SchedulerEndpoint()` qui retourne `InternalAPIEndpoint` si défini,
sinon fallback sur `APIEndpoint` (compat upstream préservée).
`internal/app/app.go` passe désormais `SchedulerEndpoint()` au TaskService.
Tests: `./internal/service/...` 27s, 0 régression.

**Compose Dokploy prod** : ajouter
`INTERNAL_API_ENDPOINT=http://localhost:8081` dans le compose Notifuse
(`localhost:8081` = self-call dans le même container, 0 hop réseau).
Une fois la nouvelle image GHCR build par la CI, redeploy = fix prod
immédiat.

**Lien session** : voir `~/.claude/projects/-home-brunon5-Bureau-veridian-platform/memory/session_2026-05-08_*.md`.

### Étape 2bis : 🟡 NEW — Supabase Auth fait le même bug auto-référent

**Découvert** : 2026-05-08 17:15, après bump Notifuse + cleanup hits 172.17.0.1
post-fix-Notifuse — il restait ~30 hits/min sur le bouncer. Investigation
Traefik logs : 100% des hits restants sont sur
`api.app.veridian.site/auth/v1/user` (= Supabase Auth, container
`compose-parse-digital-alarm-974mhw`).

C'est exactement le même pattern que Notifuse : container Supabase
s'appelle lui-même via l'URL publique au lieu du DNS Docker interne.
Probablement un cron de rotation token + un service interne qui tape
`SUPABASE_URL=https://api.app.veridian.site` au lieu de `http://kong:8000`.

**À traiter** :
1. `docker exec compose-parse-digital-alarm-974mhw-* env | grep SUPABASE_URL`
2. Identifier quel service précisément fait l'appel (probablement supabase-rest, supabase-auth, ou un autre)
3. Ajouter une variable interne similaire à ce qu'on a fait pour Notifuse, ou re-router via le réseau dokploy

**Impact** : ~30 hits/min vs ~336 avant fix Notifuse. Beaucoup moins critique
mais à fixer pour la cohérence + clarté logs CrowdSec.

À traiter dans une session dédiée Supabase (pas en scope Notifuse).

### Étape 3 : reliquat — composes parasites avec `_default` network

Les composes Twenty / Notifuse / verger-shop / cms ont chacun un réseau
`<compose>_default` qui n'est pas `dokploy-network`. C'est moins urgent
maintenant que (1) le bouncer ne plante plus, (2) Traefik trust Cloudflare,
(3) Notifuse pollution sera fixée. Reporter à une session de cleanup compose.

## Fix proposé

### A. PRIORITÉ — Configurer `forwardedHeaders.trustedIPs` côté Traefik ✅ DONE 2026-05-08 14:15

C'est le fix de fond, à faire en premier. Ajouter dans
`dokploy-traefik:/etc/traefik/traefik.yml` (ou via le fichier dynamique
Dokploy) :

```yaml
entryPoints:
  websecure:
    address: :443
    forwardedHeaders:
      trustedIPs:
        # CIDR Cloudflare IPv4 (à mettre à jour depuis https://www.cloudflare.com/ips-v4)
        - 173.245.48.0/20
        - 103.21.244.0/22
        - 103.22.200.0/22
        - 103.31.4.0/22
        - 141.101.64.0/18
        - 108.162.192.0/18
        - 190.93.240.0/20
        - 188.114.96.0/20
        - 197.234.240.0/22
        - 198.41.128.0/17
        - 162.158.0.0/15
        - 104.16.0.0/13
        - 104.24.0.0/14
        - 172.64.0.0/13
        - 131.0.72.0/22
        # Réseaux Docker internes (pour les containers qui appellent Traefik
        # depuis dokploy-network ou docker0)
        - 10.0.0.0/8
        - 172.16.0.0/12
        - 192.168.0.0/16
        - 127.0.0.1/32
```

**Effet** : Traefik lit le `X-Forwarded-For` de Cloudflare → vraie IP client
forwardée au bouncer → CrowdSec ban des vraies IPs attaquantes.

**Dokploy spécifique** : ne pas éditer le fichier de Dokploy à la main, regarder
si la config Dokploy expose un override pour `forwardedHeaders` dans son UI.
Sinon mettre dans `/etc/dokploy/traefik/traefik.yml` (en dur). Vérifier que
Dokploy ne réécrase pas le fichier au prochain rebuild de l'instance.

**Risque** : aucun pour la prod, c'est purement améliorant. Test : après modif
+ reload Traefik, regarder les logs bouncer → l'IP devrait être l'IP Cloudflare
ou la vraie IP visiteur, plus 172.17.0.1.

### B. Court terme — composes parasites

1. **Documenter dans CLAUDE.md** : pour tout nouveau compose Dokploy avec Traefik, **forcer le réseau `dokploy-network` comme default** :
   ```yaml
   networks:
     default:
       name: dokploy-network
       external: true
   ```
   Comme ça les containers n'ont pas de `_default` parasite et atteignent Traefik via 10.0.1.x.

2. **Pour les multi-tenant à >1 niveau de redirect** (Twenty avec `DEFAULT_SUBDOMAIN`), soit :
   - Désactiver le redirect (`DEFAULT_SUBDOMAIN: ''`)
   - Soit utiliser un domaine plat (sans `.app.` au milieu) : `twenty-v2.veridian.site` au lieu de `twenty-v2.app.veridian.site`
   - Soit gérer le cert wildcard en multi-domaines explicites dans Traefik file config

### B. Moyen terme

3. **Audit complet des composes Dokploy** : lister tous les composes qui ont un `_default` parasite, ajouter `default: dokploy-network` quand c'est attendu.

4. **Standardiser les Traefik file configs** : éviter le mix `@docker labels` + `@file rule`. Choisir un mode et s'y tenir par compose.

5. **Tester depuis un container DANS dokploy-network** que le routing vers Traefik passe bien par 10.0.1.x et pas par 172.17.0.1.

### C. Long terme

6. **Migrer vers Traefik 3 native multi-domain** : Traefik 3 supporte natifvement des cert wildcard multi-niveaux via `tls.domains[].sans` complets. À explorer.

## Liens

- [DETTE-001](./001-crowdsec-bouncer-saturation.md) — conséquence du leak 172.17.0.1
