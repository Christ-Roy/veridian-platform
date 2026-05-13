# Postmortem — Migration bouncer CrowdSec fbonalair → plugin Traefik

> **Date** : 2026-05-13 (matinée)
> **Durée fix** : 1h12 (10:13 audit → 10:21 prod up nouvelle config + 1h follow-ups)
> **Downtime ressenti** : ~10s (le restart Traefik) + ~30s de 404 entre l'écriture
> du middleware nouveau format et le restart effectif
> **Impact** : 0 user impacté (heure creuse 10h, sites response 200 OK immédiat post-restart)

## Contexte

Pentest manuel du 2026-05-12 23:15 a démontré **DoS trivial** sur la prod
Veridian via fail-closed du bouncer CrowdSec :
- 80 req/s nuclei depuis 1 IP → LAPI CrowdSec sature (sqlite contention)
- Bouncer ForwardAuth Traefik répond **403 fail-closed** avec timeout 5s
- **53.7% des requêtes legit retournent 403, p95 = 5.6s** sous attaque
- Toutes les apps Veridian impactées simultanément (Traefik partagé)

## Root cause

Bouncer en place = `fbonalair/traefik-crowdsec-bouncer:v0.5.0` :
- Image **2022**, abandonware
- Mode **live-only** : chaque requête HTTP → 1 query HTTP vers LAPI
- Pas de cache local, pas de fail-open natif
- Sous concurrence, sqlite LAPI verrouille → timeout en cascade

## Fix

Migration vers **plugin Traefik officiel `maxlerebourg/crowdsec-bouncer-traefik-plugin v1.6.0`** en **mode stream** :
- Plugin embarqué dans Traefik (pas de container séparé)
- Stream : poll LAPI 1x/60s, cache mémoire local
- `updateMaxFailure: -1` = fail-open explicite
- `clientTrustedIPs` : Tailscale + RFC1918 = bypass natif
- `forwardedHeadersTrustedIPs` : CF v4/v6 + Tailscale CGNAT 100.64/10

### Étapes chronologiques

| Heure | Action |
|---|---|
| 10:13 | Audit Traefik config + bouncer fbonalair v0.5.0 identifié |
| 10:15 | Découverte plugin officiel CrowdSec v1.6.0 + doc options |
| 10:17 | Backup forensique `/home/ubuntu/forensics/2026-05-13-bouncer-plugin/` |
| 10:18 | Création staging `/tmp/veridian-traefik-fix/{traefik,crowdsec-middleware}.yml` |
| 10:19 | Dry-run Traefik container temp → plugin télécharge + handleStreamCache OK |
| 10:20 | `cp` configs en place (Traefik watch=true reload dynamic, mais middleware crash : "plugin: unknown plugin type: bouncer") |
| 10:20:30 | **TOUS LES SITES EN 404** ~30s (Traefik écrit le nouveau middleware mais plugin pas encore chargé) |
| 10:20:45 | `docker restart dokploy-traefik` → plugin télécharge github + démarre |
| 10:21:00 | Tous sites 200, latence 200ms ✅ |
| 10:22 | Burst 100 req // : 100% 200, 150ms ✅ |
| 10:23 | `obs pentest deep --background` lancé |
| 10:27 | Pentest deep DONE — pas de finding bouncer |
| 10:29 | `docker stop` fbonalair + restart=no (keep 24h pour rollback) |
| 10:31 | Allowlist Veridian via parser `s02-enrich/whitelists.yaml` + SIGHUP |
| 10:35 | DoS test manuel 50 conn × 30s : 700 req, 100% 200, 0% 403, p95 2.43s ✅ |
| 10:38 → 10:55 | 3 doomsday consécutifs : 1001/1001 OK chaque fois |

### Diff config

```diff
# /etc/dokploy/traefik/traefik.yml
+ experimental:
+   plugins:
+     bouncer:
+       moduleName: github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin
+       version: v1.6.0
  entryPoints:
    web:
      forwardedHeaders:
        trustedIPs:
          - ...  # CF v4/v6 + RFC1918 inchangé
+         - 100.64.0.0/10  # Tailscale CGNAT ajouté

# /etc/dokploy/traefik/dynamic/crowdsec-middleware.yml
- # Ancien : forwardAuth vers fbonalair
- crowdsec:
-   forwardAuth:
-     address: http://crowdsec-traefik-bouncer:8080/api/v1/forwardAuth
-     trustForwardHeader: true
+ # Nouveau : plugin embarqué mode stream
+ crowdsec:
+   plugin:
+     bouncer:
+       enabled: true
+       crowdsecMode: stream
+       crowdsecLapiHost: crowdsec:8080
+       crowdsecLapiKey: ${CROWDSEC_BOUNCER_API_KEY_PROD}
+       updateIntervalSeconds: 60
+       updateMaxFailure: -1
+       defaultDecisionSeconds: 60
+       forwardedHeadersTrustedIPs: [CF v4/v6, RFC1918, 100.64/10]
+       clientTrustedIPs: [RFC1918, Tailscale]
```

## Résultats mesurés

| Métrique | Avant (2026-05-12) | Après (2026-05-13) | Delta |
|---|---|---|---|
| % 200 sous 50 conn // 30s | 46.3% | 100% | +53.7pp |
| % 403 sous 50 conn // 30s | 53.7% | 0% | -53.7pp |
| p95 latence | 5.6s | 2.4s | -57% |
| Latence moyenne | ~5s | 1.6s | -68% |
| LAPI contacted per request | 1 | 0 (cache local) | n/a |

3 doomsday consécutifs validés post-fix : 1001+1101+1001 req tous 200 OK.

## Découvertes pendant le fix

1. **Compose CrowdSec en `.disabled`** depuis 2026-05-10 : les containers
   tournent en `unless-stopped` (survivent reboot) mais Dokploy ne les manage
   plus. Restera à ré-onboarder proprement.
2. **Drift `CROWDSEC_BOUNCER_API_KEY_PROD`** entre `~/credentials/.all-creds.env`
   et `.env` runtime prod — corrigé sur valeur prod (`eW0y4IFm...`).
3. **`cscli decisions add` ne supporte pas `--type whitelist/bypass`** —
   l'allowlist effective doit passer par `clientTrustedIPs` du plugin OU
   par le parser `s02-enrich/whitelists.yaml` (collection `crowdsec/whitelist-good-actors`).
4. **Faux positif nuclei CVE-2024-34351** : signe le simple fait que
   `/_next/image` existe + callback OAST, sans valider que le proxy fetch
   vraiment. Hub en Next.js 15.5.18 patched, test manuel → 400 Bad Request.
5. **Pentest `deep` n'inclut PAS `dos_bouncer`** (preset doomsday-only) — à
   savoir pour futurs tests régression bouncer.
6. **Doomsday termine en 4-5 min** (vs 1-3h annoncés) — probable timeout
   silencieux après nuclei. À investiguer dans `pentest.py`.

## Anti-récidive

### En place
- ✅ Plugin Traefik officiel mode stream (cache local, fail-open)
- ✅ Allowlist IaC versionnée : `infra/crowdsec/whitelists.yaml` +
  `infra/scripts/crowdsec-apply-allowlist.sh` + SIGHUP
- ✅ Traefik trustedIPs avec 100.64/10 Tailscale
- ✅ `obs check security` : `bouncer_health` updated + nouveau `traefik_real_ip`
- ✅ IaC Traefik versionné : `infra/traefik/` + `apply-traefik.sh` (envsubst secrets, dry-run, backup)

### À faire (P0.4 follow-ups, cf TODO)
- [ ] Ré-onboarder compose CrowdSec dans Dokploy (`.disabled` → propre)
- [ ] `docker rm` fbonalair après 24h rollback window
- [ ] Migrer LAPI sqlite → Postgres (élimine cause root, moins urgent)

## Lessons learned

1. **Toujours utiliser un dry-run container temp avant restart Traefik** —
   le `docker run --rm traefik:v3.6.7 --configFile=... --help` valide la
   syntaxe statique + télécharge les plugins. Ça m'a évité un crash boot.
2. **Le provider file watch=true est dangereux** : modifier dynamic/*.yml
   reload **instantanément** avant que le plugin soit téléchargé → toute
   la prod en 404 30s. Solution : restart Traefik EN PREMIER, ensuite
   modifier dynamic. OU : utiliser `traefik.yml.bak` + restart atomique.
3. **`clientTrustedIPs` bypass le bouncer** : pratique pour les internes
   mais attention au scope. Mettre `0.0.0.0/0` = désactiver le bouncer
   complètement. RFC1918 + Tailscale = sain.

## Liens

- Commit `8e9b906` — fix bouncer
- Commit `707f5bd` — IaC Traefik + fail2ban draft
- TODO P0.4 (✅ résolu) dans `todo/infra/TODO.md`
- `runbooks/incidents/2026-05-13-pentest-manuel.md` — pentest source
- Doc plugin : https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin
