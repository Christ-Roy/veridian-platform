# Postmortem — CrowdSec aveugle aux logs HTTP suite à accessLog.otlp

> **Date** : 2026-05-13, 10:21 → 11:31 (1h10 de cécité partielle)
> **Sévérité** : HAUTE — CrowdSec ne pouvait pas détecter de nouvelles attaques HTTP
> **Impact** : 0 user direct, mais protection HTTP en veille pendant cette fenêtre
> **Détecté par** : Robert pendant audit "le DDoS ban après combien de temps ?"

## Contexte

Pendant le fix du SPOF bouncer (P0.4, voir `2026-05-13-bouncer-fix.md`),
plusieurs modifications successives de `traefik.yml` ont introduit un bug
silencieux : `accessLog.otlp.grpc` était configuré pour envoyer les access
logs vers Tempo/Mimir Grafana Cloud.

## Root cause

**Traefik v3 : `accessLog.otlp` désactive automatiquement l'écriture sur
stdout/filePath**. Documentation Traefik confirme ce comportement (et l'a
pas changé depuis v3.0). Donc :

- ✅ Tracing + metrics OTLP : continuaient à fonctionner correctement
- ❌ Access logs HTTP : **n'apparaissaient PAS dans stdout du container**
- ❌ CrowdSec datasource docker container_name=dokploy-traefik : **rien à lire**

Conséquence : `cscli metrics` montrait `docker:dokploy-traefik 108.11k Lines
read` **figé depuis 10:21** (snapshot du moment où Traefik a été restart
avec la nouvelle config). Le bouncer plugin pollait toujours LAPI, mais
les scenarios HTTP ne créaient plus de nouvelles décisions.

## Symptômes observés

1. Le pentest manuel `obs pentest doomsday` ne générait aucune nouvelle alerte
   `crowdsecurity/http-*` malgré 1000+ requêtes vers paths sensibles
2. Spoof X-Forwarded-For depuis dev-pub → 0 alerte
3. Spam direct paths `.env`, `wp-admin`, `wp-login.php`, etc. depuis Robert
   non-whitelisté → 0 alerte
4. **Bouncer Metrics Total dropped = 0** sur les nouveaux bouncer plugins
5. **`Lines read` figé** dans `cscli metrics`

## Fix

**Retirer `accessLog.otlp` du traefik.yml** :

```diff
 accessLog:
   format: json
   bufferingSize: 0  # flush immédiat
   filters:
     statusCodes:
       - "200-599"
     retryAttempts: true
-  otlp:
-    grpc:
-      endpoint: 51.210.7.44:4317
-      insecure: true
-    serviceName: traefik
-    resourceAttributes:
-      deployment.environment: prod
-      host.name: vps-10f2bc7c
```

Sans `accessLog.otlp`, Traefik écrit le JSON sur stdout par défaut.

**Tracing OTLP gardé** (un section `tracing:` séparée) → Grafana Cloud reçoit
toujours les traces complètes avec TraceId présent dans le JSON stdout pour
corrélation manuelle.

## Validation post-fix

```bash
# Lines read continue d'augmenter en temps réel après requêtes
$ ssh prod-pub "docker exec code-crowdsec-1 cscli metrics show acquisition"
docker:dokploy-traefik | 114.12k | 112.36k | ... | 51.09k

# Mes requêtes correctement whitelistées (Robert dans whitelists.yaml)
# +6000 lines parsed depuis le fix = pipeline complet OK
```

## Trade-off accepté

| Composant | Avant fix | Après fix |
|---|---|---|
| Access logs Grafana Cloud | ✅ OTLP gRPC | ❌ Perdus |
| Tracing Grafana Cloud | ✅ | ✅ Gardé |
| Metrics Grafana Cloud | ✅ Prometheus | ✅ Gardé |
| CrowdSec scenarios HTTP | ❌ Aveugle | ✅ Actifs |
| Bouncer plugin | ✅ Pollait quand même | ✅ Reçoit nouvelles décisions |

**Perdre l'access log détaillé dans Grafana est acceptable** : le tracing OTLP
contient déjà la majeure partie des infos utiles (latence, status, route).
La sécurité prime.

## Anti-récidive

1. **Check `obs check security`** : surveiller `Lines read` de la datasource
   docker dokploy-traefik. Si figé > 5 min → CrowdSec aveugle.
2. **Toujours tester l'enchainement complet** quand on touche à `accessLog` :
   `curl https://app.veridian.site/test-$RANDOM` puis vérifier que
   `cscli metrics` incrémente `Lines read`.
3. **Documentation Traefik v3** à lire avant chaque modif accessLog/tracing/metrics.
4. **Idéalement (futur)** : monter un volume `/var/log/traefik` dans le container
   Traefik via Dokploy UI + utiliser `accessLog.filePath` + double-output
   (filePath ET OTLP — à vérifier si Traefik le supporte vraiment).

## Lessons learned

1. **`accessLog.otlp` n'est pas additif** — il REMPLACE l'output stdout. Comportement
   non documenté explicitement, découvert par expérimentation.
2. **`cscli metrics` est cumulatif depuis le start CrowdSec** — il faut comparer
   2 snapshots (avant/après) pour voir si quelque chose bouge, pas regarder
   les valeurs absolues.
3. **Toujours valider en bout-en-bout** : envoyer une requête, vérifier qu'elle
   apparaît dans les logs Traefik stdout, puis dans CrowdSec acquisition.

## Liens

- Commit `52ad584` — fix
- TODO P0.4 mention "follow-ups accesslog"
- `runbooks/incidents/2026-05-13-bouncer-fix.md` — incident parent
