# Infra — TODO

> Worktree : `~/Bureau/veridian-platform-infra/` (branche `work/infra`)
> Agent dédié : Ops (cf. `~/Bureau/cc-saas/prompts/infra/`)
>
> Source de vérité de tous les chantiers transverses : monitoring, backups, sécurité op, tests cross-app, runbooks.
>
> Tu n'es pas un team lead app. Tu ne touches pas au code des apps. Si un fix requiert du code dans une app, tu ouvres un ticket dans `todo/apps/<app>/TODO.md` section "Tickets infra".

## P0 — risques business critiques

À attaquer en priorité absolue. Chaque P0 ouvert = un risque non couvert.

### P0.0 — ✅ RÉSOLU 2026-05-11 16:35 : conflit Traefik dual-router hub

**Statut** : ✅ résolu — `/pricing` répond 200/10 sur 10 requêtes, `check-traefik-unique-host.sh app.veridian.site` retourne OK 1 host.

**Cause profonde identifiée** : la stack Dokploy legacy `dashboard` (composeId `Rnt_Jz4BhkcyEJ2D6Bugb`, dir `compose-parse-digital-bandwidth-xfd9mu`) n'a jamais été supprimée après la migration Auth.js du 2026-05-09. Elle gardait ses labels Traefik `Host(app.veridian.site)` dans son `docker-compose.yml`. Tout redeploy Dokploy ressuscitait le bug. Le 2026-05-11 09:48, un redeploy a effectivement relancé la stack → 10/10 requêtes `/pricing` en 500.

**Fix appliqué** :
1. Snapshot forensique : `/home/ubuntu/forensics/2026-05-11-cleanup/compose-parse-digital-bandwidth-xfd9mu/`
2. Delete via Dokploy API : `POST /api/trpc/compose.delete {"composeId":"Rnt_Jz4BhkcyEJ2D6Bugb","deleteVolumes":true}`
3. Vérif post-fix : 10/10 200 OK + script check-traefik OK

**Anti-récidive shippé** (commit `3402e08`) :
- `infra/scripts/check-traefik-unique-host.sh` : détecte les dual-routers, exit 1 si collision
- DNS wildcard `*.green.app.veridian.site` + cert Let's Encrypt en place (plus d'excuse "j'ai pris le Host prod pour tester 5 min")
- Prompt `cc-saas/prompts/applicatif/06-blue-green-procedure.md` réécrit en v3 : procédure unique, rollback en miroir détaillé, anti-pièges checklist
- Standards documentés : `runbooks/standards/{docker-image-tags,dokploy-naming,docker-healthchecks}.md`
- Rapport audit complet : `runbooks/audits/2026-05-11-clean-by-design.md`

**Stacks zombies aussi supprimées dans la foulée** :
- `J2f9wtBnrAO-86DE3_WMS` (prospection-greenauthjs idle depuis 2026-05-10)
- `xelXB17eNlesUlHqHJCtY` (prospection-saas créée 2026-05-11 10:13 = bombe DB collision)

**Historique** : bug actif depuis 6h+ au 2026-05-11, détecté par e2e regression.spec.ts:170 (Pricing page loads)

**Symptôme** :
- 2 containers Hub avec label `Host(app.veridian.site)` tournent en parallèle
- Traefik route en round-robin → ~50% des requêtes hub tombent sur l'ancien container
- L'ancien container ne sait pas répondre Auth.js → 500 sur `/pricing` (et autres pages auth-aware)

**Containers concernés** :
| Container | Image | Statut |
|---|---|---|
| `compose-back-up-online-pixel-nl2k9p-hub-authjs-1` | `:hub-authjs-staging` | ✅ le bon (Auth.js) |
| `compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1` | `:latest` (legacy) | ❌ doit être neutralisé |

**Vérifié dans logs Traefik** (2026-05-11) :
- `18:53:13` : `/pricing` → ServiceURL 10.0.1.215:3000 → **500** (mauvais conteneur)
- `18:54:44` : `/pricing` → ServiceURL 10.0.1.209:3000 → **200** (bon conteneur)

**Référence historique** : incident report `6f5a2cf` daté du 2026-05-09 documente exactement ce bug. Soit le fix n'a jamais été appliqué, soit l'ancien container a été ressuscité (cron Dokploy ou redeploy malencontreux) — **à investiguer pour comprendre la cause profonde et empêcher la récidive**.

**Action — procédure stricte** (cf. `~/Bureau/cc-saas/prompts/applicatif/06-blue-green-procedure.md`) :

1. **Snapshot forensique AVANT toute action** :
   ```bash
   ssh prod-pub "docker inspect compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1 > /tmp/web-dashboard-snapshot-$(date +%Y%m%d-%H%M).json"
   ssh prod-pub "docker logs --tail 500 compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1 > /tmp/web-dashboard-logs.txt"
   ssh prod-pub "docker ps --format '{{.Names}}\t{{.Status}}\t{{.Labels}}' | grep app.veridian.site > /tmp/dual-router-state.txt"
   ```

2. **Identifier qui/quoi a relancé le container** (pourquoi il est revenu) :
   ```bash
   ssh prod-pub "docker inspect compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1 --format '{{.Created}} {{.State.StartedAt}}'"
   ssh prod-pub "journalctl --since '24h ago' | grep -iE 'web-dashboard|xfd9mu' | head -50"
   ssh prod-pub "ls -la /etc/dokploy/compose/compose-parse-digital-bandwidth-xfd9mu/"
   ```

3. **Neutraliser proprement l'ancien container** :
   ```bash
   ssh prod-pub "sudo docker stop compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1"
   ssh prod-pub "sudo docker update --restart=no compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1"
   # Retirer les labels Traefik du compose Dokploy
   ssh prod-pub "sudo sed -i.bak '/traefik\./d' /etc/dokploy/compose/compose-parse-digital-bandwidth-xfd9mu/code/docker-compose.yml"
   ```

4. **Vérifier qu'il n'y a plus qu'UN router pour `app.veridian.site`** :
   ```bash
   ssh prod-pub "docker ps --format '{{.Names}}' | xargs -I {} docker inspect {} --format '{{json .Config.Labels}}' | grep -c 'rule=Host(\`app.veridian.site\`)'"
   # attendu : 1
   ```

5. **Vérifier que `/pricing` répond 200 de manière déterministe** (10 curl successifs, tous doivent être 200) :
   ```bash
   for i in 1 2 3 4 5 6 7 8 9 10; do
     curl -sf -o /dev/null -w "%{http_code} " https://app.veridian.site/pricing
   done
   echo
   # attendu : 200 200 200 200 200 200 200 200 200 200
   ```

6. **Garder l'ancien container 24-48h** pour rollback (stoppé, sans labels, sans restart auto), puis `docker rm` définitif après validation.

7. **Post-mortem** : pourquoi le container est-il revenu malgré le fix du 2026-05-09 ? Écrire `runbooks/incidents/2026-05-11-hub-traefik-collision-recidive.md`.

**Préalable** : demander accord explicite Robert avant toute manip prod (règle CLAUDE.md "JAMAIS modifier la PROD OVH sans accord explicite").

**Test de non-régression** : le test e2e `regression.spec.ts:170 Pricing page loads` a détecté le bug, **ne pas le modifier**. Au contraire, il faut un test infra qui détecte directement le dual-router (compte des containers prod ayant label Host prod doit être == 1).

**Lien avec P0.2** : si Grafana+Loki était en place, on aurait vu la moitié des `/pricing` retourner 500 dès la première heure au lieu de découvrir le problème via une CI flaky 6h plus tard. **Renforce l'urgence du P0.2 observabilité**.



### P0.1 — ✅ RÉSOLU 2026-05-12 : Backups DB testés et runbook restore

- [x] Inventaire toutes les DBs critiques (prospection, veridian-core/Hub/Analytics, cms, notifuse, supabase, twenty, verger-shop)
- [x] Vérifier rclone backup R2 — **trou découvert** : prospection, veridian-core, verger-shop absents !
- [x] Script `infra/scripts/backup-postgres.sh` générique + `/etc/cron.d/veridian-backups` (04:00/04:10/04:20 UTC) → 3 DBs manquantes maintenant backupées
- [x] Script `infra/scripts/restore-db.sh <app> [date]` qui restore dans un Postgres temporaire sur localhost:15999 — validé sur verger-shop et prospection (490MB)
- [x] Cron mensuel local : `infra/scripts/test-restore-monthly.sh` (1er du mois 03:00) + alert Telegram
- [x] Runbook `runbooks/disaster-recovery.md` avec scénarios A (DB corrompue), B (volume perdu), C (VPS HS), D (compromission)
- [x] RPO (24h) et RTO (30 min A/B / 2-4h C) documentés

**Commit** : `2c2ee0e` sur `work/infra`.

**Déclencheur** : incident 2026-05-08 — j'ai cassé la DB prospection avec un `docker compose up`, sauvée par chance par le volume historique. Plus jamais ça.

### P0.2 — Observabilité minimale (Grafana + Loki + Promtail)

- [ ] Monter la stack monitoring sur dev server via Dokploy
  - Loki : agrège logs Docker
  - Promtail : streame `/var/lib/docker/containers/*/`
  - Grafana : dashboards
- [ ] Configurer scrape sur tous les containers prod (datasource Docker)
- [ ] Dashboard par app (latence, erreurs, throughput)
- [ ] Healthcheck externe : cron sur dev server qui ping `/api/health` des 5 apps prod toutes les 60s, ping Telegram si down
- [ ] Documentation `runbooks/monitoring-access.md` (URLs, comptes, comment lire les dashboards)

**Déclencheur** : aujourd'hui un client se plaint que c'est lent → on n'a aucun moyen de savoir où.

### P0.3 — Tests cross-app — 5 parcours business critiques

- [ ] Setup `infra/tests/cross-app/` (playwright.config dédié)
- [ ] Spec 01 : provision tenant complet (Hub → Prospection + Twenty + Notifuse)
- [ ] Spec 02 : magic-link rotation (Hub → Prospection)
- [ ] Spec 03 : Stripe webhook update plan (Stripe TEST → Hub → Prospection voit le plan)
- [ ] Spec 04 : Notifuse invitation (Hub → Notifuse → email Brevo → magic link)
- [ ] Spec 05 : Twenty workspace création (Hub → Twenty)
- [ ] CI workflow `.github/workflows/cross-app-nightly.yml` qui lance contre dev server
- [ ] Endpoint admin `/api/admin/test-cleanup` dans Hub pour cleanup post-test (ouvrir ticket pour team lead Hub)
- [ ] Comptes test stables documentés dans `runbooks/cross-app-test-fixtures.md`

**Déclencheur** : la majorité des bugs business viennent de la jonction entre apps, mais aucun test ne les couvre.

### P0.4 — ✅ RÉSOLU 2026-05-13 10:21 : CrowdSec bouncer fail-closed sur LAPI timeout

**Statut** : ✅ résolu — migration `fbonalair/traefik-crowdsec-bouncer:v0.5.0` (live, abandonware 2022) → **plugin officiel `maxlerebourg/crowdsec-bouncer-traefik-plugin v1.6.0`** en **mode stream** (poll LAPI 1x/60s, cache local mémoire, fail-open via `updateMaxFailure: -1`).

**Fix appliqué** :
- [x] `/etc/dokploy/traefik/traefik.yml` : ajout `experimental.plugins.bouncer` + `100.64.0.0/10` Tailscale CGNAT dans `trustedIPs` (déjà avait CF v4/v6 + RFC1918 + Docker overlays)
- [x] `/etc/dokploy/traefik/dynamic/crowdsec-middleware.yml` : remplacé `forwardAuth` → `plugin.bouncer` avec `crowdsecMode: stream`, `updateIntervalSeconds: 60`, `updateMaxFailure: -1` (fail-open), `httpTimeoutSeconds: 5`, `defaultDecisionSeconds: 60`, ranges trustés CF + Tailscale dans `forwardedHeadersTrustedIPs`, `clientTrustedIPs: 100.64/10 + RFC1918`
- [x] Restart `dokploy-traefik` : downtime ~10s, plugin téléchargé depuis GitHub, `handleStreamCache:updated` confirme le sync LAPI
- [x] Backup forensique : `/home/ubuntu/forensics/2026-05-13-bouncer-plugin/` (traefik.yml.bak, crowdsec-middleware.yml.bak, crowdsec-compose.yml.bak)
- [x] Allowlist Veridian versionnée : `infra/crowdsec/whitelists.yaml` + `infra/scripts/crowdsec-apply-allowlist.sh` (Robert + dev-server + Tailscale 100.64/10 + RFC1918 + 6 IPs Better Uptime). Mécanisme = parser CrowdSec `/etc/crowdsec/parsers/s02-enrich/whitelists.yaml` (collection `crowdsecurity/whitelist-good-actors` déjà installée). Script idempotent + SIGHUP reload. Testé live 2026-05-13 10:31.
- [x] Vérif : burst 100 req parallèles → 100/100 en 200 (vs 53% en 403 hier), latence 153-200ms stable
- [x] Vérif : `obs pentest deep` lancé sur app.veridian.site, monitoring en cours (run `20260513-102318-deep`)

**Découvertes pendant l'audit** :
- Le compose Dokploy CrowdSec (`compose-program-digital-application-vb1x5n`) est en état `.disabled-2026-05-10-collision-fix` — les containers tournent en `unless-stopped` (survivent reboot) mais Dokploy ne les manage plus. À ré-onboarder proprement (sans le service `crowdsec-traefik-bouncer` désormais inutile)
- Drift de credentials : `CROWDSEC_BOUNCER_API_KEY_PROD` diffère entre `~/credentials/.all-creds.env` (`6e4d89...`) et le `.env` du compose prod (`eW0y...`). Source de vérité = le `.env` runtime. À synchroniser
- Aucun bouncer firewall CrowdSec sur la prod (`ipset` pas installé) — seul le bouncer HTTP via Traefik filtre. Cohérent avec les 403 observés pendant le pentest (pas des DROP réseau)
- fail2ban actuel = jail `sshd` uniquement (cf P0.5). Pendant le pentest, aucune interception réseau n'a eu lieu, c'était bien le bouncer fbonalair qui répondait fail-closed

**Restant pour fermer définitivement P0.4** :
- [x] ~~Stopper le container fbonalair~~ → fait 2026-05-13 10:29 (stopped + restart=no, kept 24h pour rollback)
- [ ] `docker rm code-crowdsec-traefik-bouncer-1` après 2026-05-14 (rollback window 24h dépassée)
- [ ] Ré-onboarder le compose CrowdSec dans Dokploy proprement → **chantier non trivial** : le compose actuel `compose-program-digital-application-vb1x5n` a un `.env` orphelin avec des creds d'autres services (Supabase/Twenty) + `COMPOSE_FILE=...:docker-compose.prod.yml:docker-compose.resources.yml` pointant sur des fichiers absents. Brouillon ready : `/etc/dokploy/compose/compose-program-digital-application-vb1x5n/code/docker-compose.yml.draft-2026-05-13-needs-dokploy-recreate`. **Action propre** = supprimer la stack zombie via Dokploy API + recréer une nouvelle stack "crowdsec" dédiée. À faire en session dédiée, hors fenêtre prod chargée.
- [ ] Vérifier résultat `obs pentest deep` complet (run `20260513-102318-deep`) — phase 6 (DoS bouncer) doit passer cette fois
- [x] ~~Refaire le script `crowdsec-apply-allowlist.sh`~~ → fait 2026-05-13 10:31 (parser `s02-enrich/whitelists.yaml` + SIGHUP)
- [x] ~~Ajouter check `obs check security` real-IP cassée~~ → fait 2026-05-13 10:34. Nouveaux checks `security_traefik_real_ip` + bouncer_health updated pour plugin. Best-effort (Traefik utilise OTLP pas Loki pour access logs, le check lit stdout via SSH). Pas de finding = OK.
- [ ] Migrer LAPI sqlite → Postgres (cf doc CrowdSec) — moins urgent maintenant que le bouncer ne tape plus LAPI à chaque req

**Référence pentest** : `runbooks/incidents/2026-05-13-pentest-manuel.md`

---

### P0.4 — historique (avant fix)

**Bug actif depuis au moins 2026-05-08** (déjà documenté dans `memory/project_infra_pieges.md` : « ForwardAuth = SPOF »). Confirmé en prod par pentest manuel du **2026-05-12 23:15**.

**Preuves brutes (logs prod) `bouncer` :**
```
{"level":"warn","error":"Get \"http://crowdsec:8080/v1/decisions?type=ban&ip=78.112.59.120\":
 context deadline exceeded (Client.Timeout exceeded while awaiting headers)",
 "message":"An error occurred while checking IP \"\""}

{"level":"warn","status":403,"path":"/api/v1/forwardAuth","latency":5001.520425,
 "user_agent":"Mozilla/5.0 (CentOS; ...) Chrome/137.0.0.0","message":"Request"}
```

**Symptôme** : sous charge légère (80 req/s nuclei depuis **une seule IP**) :
- LAPI CrowdSec sature → 500 `context canceled` après 5s
- Bouncer ForwardAuth Traefik répond **403 fail-closed** pendant le timeout
- Comportement non-déterministe (200 OK et 403 alternent sur la même IP au même moment)
- Latence par requête : **2-5 secondes** ajoutées partout
- Quand l'utilisateur essaye `https://app.veridian.site/` legit pendant ce temps : **403 5s** au lieu de 200

**Impact business :**
- **DoS trivial** : 80 req/s = ~1 nœud résidentiel = peut faire tomber la prod (toutes apps simultanément, car Traefik = ForwardAuth pour tout)
- Aucun bannissement effectif : LAPI n'a pas le temps de prendre une décision, donc l'attaquant n'est jamais banni → boucle infinie « je tape → bouncer répond 500 → tu vois 500 mais moi je continue »
- **Stack `obs` détecte bien** (`code-crowdsec-traefik-bouncer-1` à 34.9% logs erreur en alerte CRIT, `dokploy-traefik` à 100%) mais **aucune action automatique**

**Cause profonde probable** (à confirmer) :
1. CrowdSec LAPI sqlite par défaut → contention sous concurrence
2. Timeout bouncer côté Traefik à 5s = trop long, devrait être 200-500ms avec fail-**open** par défaut (au lieu de fail-closed)
3. Pas de cache local côté bouncer (chaque requête = 1 query LAPI = effondrement quand LAPI lent)
4. Pas d'allowlist IP locale (mon IP `78.112.59.120` aurait dû être whitelistée → 0 query LAPI)

**Plan de fix (ordonné par urgence) :**

1. **[QUICK WIN]** Passer le bouncer Traefik en `forwardedHeadersTrustedIPs` + mode `none` au lieu de `live` (=cache 60s + fallback IP non-checkée = passe) :
   ```yaml
   # dokploy-traefik labels du middleware crowdsec :
   forwardAuth.address: http://crowdsec-traefik-bouncer:8080/api/v1/forwardAuth
   forwardAuth.tls.insecureSkipVerify: true
   # + bouncer env :
   CROWDSEC_BOUNCER_API_KEY: ...
   CROWDSEC_MODE: stream    # au lieu de live → poll LAPI 1x/min, cache local
   CROWDSEC_UPDATE_INTERVAL: 60s
   ```
   → la requête utilisateur n'attend plus LAPI, elle consulte un cache local en mémoire. LAPI peut crever, l'app reste up.

2. **[QUICK WIN 2]** Ajouter une **allowlist permanente** des IPs Veridian (Robert local, dev server, CI runner, bots Better Uptime) directement dans CrowdSec :
   ```bash
   ssh prod-pub "docker exec code-crowdsec-1 cscli decisions add \
     --ip 78.112.59.120 --duration 100y --type whitelist --reason 'robert-local'"
   ```
   Idem pour Better Uptime, GitHub Actions, dev.veridian.site.

3. **[MEDIUM]** Migrer LAPI de sqlite vers Postgres (peut réutiliser `dokploy-postgres`) — sqlite verrouille la DB sur écritures concurrentes, c'est la cause #1 des timeouts. Doc : https://docs.crowdsec.net/u/user_guides/database/

4. **[MEDIUM]** Réduire le `forwardAuth` timeout côté Traefik de 5s à 500ms, avec **fail-open** explicite (mieux vaut laisser passer un attaquant 60s qu'avoir 100% de la prod en 403).

5. **[LONG TERME]** Ajouter un check `obs check security` qui mesure le **temps de réponse LAPI** et alerte si > 200ms moyen sur 5 min. Sans ça on ne sait pas que le SPOF se réveille avant que la prod tombe.

**Test de non-régression à inclure dans `obs pentest fast` (en cours de design)** :
- Spam 200 req/s pendant 30s depuis IP attaquant sur `app.veridian.site`
- Vérifier en parallèle qu'un curl legit (autre IP) reçoit 200 < 1s
- Si latence legit dépasse 2s OU si attaquant pas banni en 30s → **FAIL**

**Pourquoi ce P0.4 est ENFIN un P0** :
- C'est documenté depuis le 2026-05-08 dans la mémoire (`project_infra_pieges.md`)
- Confirmé exploitable en 2 min avec un nuclei standard et 1 seule IP
- Bloque même la détection : pendant l'attaque, **on ne peut pas voir qui attaque** car LAPI plante
- Si un attaquant lit ce repo (`runbooks/` est public dans les forks éventuels), il a la recette gratuite

**Lien session pentest** : `runbooks/incidents/2026-05-13-pentest-manuel.md` (à remplir)

### P0.5 — 🟡 fail2ban IaC stack draft 2026-05-13 — restant : deploy + cleanup apt

**Statut** : config IaC complète préparée dans `infra/fail2ban/` (commit `<TBD>`), pas encore déployée. Le fail2ban apt actuel reste actif (730 IPs bannies/semaine sur jail `sshd`). Plan de déploiement détaillé dans `infra/fail2ban/README.md`.

**Préparé (commitable, sans risque prod)** :
- [x] `infra/fail2ban/compose.yml` — container `linuxserver/fail2ban` en `network_mode: host`
- [x] `infra/fail2ban/jail.local` — 5 jails (sshd, sshd-aggressive, sshd-alt port 2222, traefik-auth, dokploy-login) + recidive 7j + allowlist (Robert + dev + Tailscale)
- [x] `infra/fail2ban/filter/traefik-auth.conf` — parse access logs JSON via `journalmatch CONTAINER_NAME=dokploy-traefik` (compatible accessLog.format=json déjà configuré)
- [x] `infra/fail2ban/filter/dokploy-login.conf` — match `/api/auth/sign-in*` 401 brute Better-Auth

**Restant (nécessite intervention prod, risque modéré)** :
- [ ] Vérifier que Docker logs vont dans journald (`journalctl CONTAINER_NAME=dokploy-traefik`). Si pas → ajouter `"log-driver": "journald"` dans `/etc/docker/daemon.json` = restart daemon = downtime stack entière
- [ ] Deploy via Dokploy UI (créer stack pointant sur `infra/fail2ban/`)
- [ ] Test SSH brute depuis dev (10 wrongpass) → vérifier ban < 30s
- [ ] Test HTTP brute Dokploy login → vérifier ban via `fail2ban-client status dokploy-login`
- [ ] Cleanup apt `sudo apt purge fail2ban` (le container reprend)

### P0.5-archive — état historique avant IaC

**Statut** : ouvert, **état clarifié pendant pentest 2026-05-12 23:25**. Contrairement à ce qu'on pourrait croire, `fail2ban` **EST installé et actif** (depuis 2026-05-02 18:11, soit 1 semaine 3 jours).

**État réel mesuré :**
```
$ ssh prod "sudo fail2ban-client status"
Status
|- Number of jail: 1
`- Jail list:      sshd

$ ssh prod "sudo fail2ban-client status sshd"
Status for the jail: sshd
|- Filter
|  |- Currently failed: 4
|  |- Total failed:     14013    ← 14k tentatives SSH en 1 semaine
|  `- Journal matches:  _SYSTEMD_UNIT=sshd.service + _COMM=sshd
`- Actions
   |- Currently banned: 1
   |- Total banned:     730      ← 730 IPs bannies en 1 semaine = ~104/jour
   `- Banned IP list:   78.112.59.120  ← Robert s'est fait bannir pendant le pentest
```

**Bonne nouvelle :** SSH brute fonctionne, fail2ban a banni 730 IPs en 1 semaine. Robert (IP `78.112.59.120`) s'est fait bannir en **10 tentatives SSH** pendant le pentest → réaction effective.

**Mauvaise nouvelle (le vrai problème) :**

1. **Aucun jail HTTP/Traefik** : nuclei à 80 req/s pendant 4 min depuis une seule IP = aucune action fail2ban. C'est pour ça que le DoS du bouncer (cf P0.4) a pu durer 4+ min sans bannissement.
2. **Le jail `sshd` couvre uniquement le port 22 standard** (parser `_SYSTEMD_UNIT=sshd.service`). Le port `2222` n'est pas couvert si c'est un sshd container Docker (logs pas dans systemd-journald de l'hôte).
3. **Pas de jail recidive** = bannissement temporaire (par défaut 10min). Une IP bannie 1×/h revient indéfiniment. À 104 IPs/jour, c'est du gaspillage.
4. **Pas dans IaC** : la config `/etc/fail2ban/jail.local` est installée à la main sur le VPS. Pas versionnée. Si on perd le VPS, on perd la config. Pas de revue de change possible.

**Surface réellement vulnérable (non couverte par fail2ban actuel) :**
- Brute sur `/api/auth/sign-in` Dokploy (cf P0.6)
- Brute sur `/api/auth/callback/credentials` Hub Auth.js
- Brute sur Twenty `/auth` (port 3000 derrière Traefik)
- Brute sur Notifuse `/console` login
- Spam de POST sur Stripe webhook endpoints (DoS apps + facture Anthropic API)
- Crawling agressif (cf nuclei à 80 req/s qui a fait tomber tout)
- Slowloris / TCP slow-read sur Traefik

**Approche IaC souhaitée** (cohérente avec le reste de la stack Docker/Dokploy) :

Plutôt que de garder `fail2ban` en paquet apt sur l'hôte (couplé au VPS, pas reproductible, pas versionné, config manuelle), on **migre vers un container Docker dédié** :

```yaml
# infra/compose/security/fail2ban.yml — à ajouter comme stack Dokploy
services:
  fail2ban:
    image: lscr.io/linuxserver/fail2ban:latest
    container_name: fail2ban
    cap_add:
      - NET_ADMIN
      - NET_RAW
    network_mode: host        # nécessaire pour iptables sur l'hôte
    environment:
      - PUID=0
      - PGID=0
      - TZ=Europe/Paris
      - VERBOSITY=-vv
    volumes:
      - ./fail2ban-config:/config
      - /var/log:/var/log:ro  # accès aux logs sshd hôte
      - /var/log/auth.log:/var/log/auth.log:ro
    restart: unless-stopped
```

**Avantages IaC :**
- Configuration `jail.local` versionnée dans `infra/compose/security/fail2ban-config/`
- Reproductible (clone + `docker compose up` = même état)
- Géré par Dokploy comme tout le reste → logs accessibles via `obs tail fail2ban`
- Backup via le même flow que les autres stacks

**Jails à activer (minimum vital) :**
1. **sshd** sur `:22` et `:2222` — bantime 1h, findtime 10m, maxretry 5
2. **sshd-aggressive** — bantime 24h, findtime 1h, maxretry 10 (couvre les distributed brute slow)
3. **traefik-auth** — parse les logs Traefik JSON et ban sur 401/403 répétés (utile pour Dokploy UI exposé publiquement, cf P0.6)
4. **dokploy-login** — ban sur les `/api/auth/*` qui répondent 401 en série (4-5 essais en 1 min depuis même IP)

**Plan de fix :**

1. **[QUICK]** Vérifier l'état réel sur prod : `ssh prod-pub "which fail2ban-client; systemctl status fail2ban; iptables -L -n | grep -i f2b"`. Mettre à jour CLAUDE.md global selon le résultat (ne plus dire « fail2ban actif » si c'est faux).
2. **[QUICK]** Créer `infra/compose/security/fail2ban.yml` + `fail2ban-config/jail.local` + `filter.d/` pour les jails custom (traefik-auth, dokploy-login)
3. **[MEDIUM]** Déployer comme nouvelle stack Dokploy. Vérifier que `iptables -L f2b-sshd` apparaît côté hôte.
4. **[MEDIUM]** Tester en lançant un brute SSH depuis dev server (10 essais wrongpass) → vérifier ban < 30s
5. **[MEDIUM]** Ajouter au `obs check security` un check « fail2ban container up + nombre d'IPs bannies actuelles » pour visibilité
6. **[LONG]** Intégrer dans `obs pentest fast` un test SSH brute qui valide que fail2ban réagit en < 30s sinon FAIL

**Pourquoi P0 et pas P1 :**
- Port 22 ouvert sur internet 24/7 avec auth password désactivée mais clé OpenSSH 9.6 = surface réelle (0-day OpenSSH possible)
- Le port `2222` n'est pas documenté dans CLAUDE.md → on ne sait pas ce qu'il fait. Si c'est Dokploy SSH git, un brute pourrait potentiellement viser des repos clients
- Combiné à P0.4 (bouncer down), un attaquant peut DoS le bouncer ET brute SSH en parallèle sans qu'aucun système ne réagisse

**Lien CrowdSec vs fail2ban — différence :**
- CrowdSec = community-driven, partage les IPs malveillantes, mais c'est aussi le composant qui plante en P0.4
- fail2ban = local, simple, fait son job sans dépendance réseau
- Les deux sont complémentaires : CrowdSec en première ligne (partagé), fail2ban en filet de sécurité local

**Connexe** : P1.4 (audit SSH) devient prérequis simple pour ce ticket — savoir qui a accès avant de durcir.

### P0.6 — 🔥 Dokploy admin UI exposé publiquement sur dokploy.veridian.site

**Statut** : ouvert, confirmé pendant pentest 2026-05-12 23:09. CLAUDE.md prétend « Dokploy UI port 3000 Tailscale-only » → **FAUX**. `https://dokploy.veridian.site/` répond `HTTP 200` avec page login depuis n'importe quelle IP du monde.

**Preuves :**
```bash
$ curl -sI https://dokploy.veridian.site/
HTTP/2 200
content-security-policy: frame-ancestors 'none'
x-frame-options: DENY
x-powered-by: Next.js
```

Login form HTML servi en clair, version Dokploy inconnue (pas exposée dans headers).

**Surface d'attaque :**
- Brute force admin login illimité (rien ne ban — cf. P0.5 et P0.4)
- Si CVE Dokploy auth bypass (cf. v0.29 a patché Pre-Auth Admin Takeover en mai 2026 — Robert vient d'upgrader, mais futures CVE arrivent)
- Toute la stack Veridian gouvernée depuis ce panel : compromise admin = game over total (secrets ENV de toutes les apps, accès SSH au VPS via Dokploy terminal, etc.)

**Plan de fix (3 options) :**

1. **[RECOMMANDÉ] Cloudflare Tunnel + Access** : Tunnel `dokploy.veridian.site` → seulement accessible via login Cloudflare Access (email magic link Robert + dev server). Zéro exposition publique. Coût : 0€ (CF Access gratuit jusqu'à 50 users). 30 min de setup.

2. **Tailscale only** : Retirer le DNS public + Traefik label, exposer seulement sur `100.88.202.29:3000` (Tailscale). Robert + dev server peuvent y accéder via VPN. Inconvénient : nécessite Tailscale ON tout le temps (le CLAUDE.md mentionne déjà que Tailscale est parfois idle).

3. **IP allowlist Traefik** : Middleware Traefik `ipAllowList` avec IP Robert + dev + CI. Plus simple mais Robert change d'IP en déplacement → galère.

**Action immédiate (cette nuit, avant fin pentest) :**
- Si CF Access est dispo : mettre en place + cleanup DNS public
- Sinon : ajouter middleware Traefik `ipAllowList` avec 78.112.59.120 + 37.187.199.185 en attendant

**Connexe :**
- P0.4 (bouncer fail-closed) : si on déplace Dokploy hors CrowdSec, on n'a plus le SPOF
- P0.5 (fail2ban) : si on garde Dokploy public, fail2ban-traefik-auth devient critique pour les `/api/auth/*` Dokploy

### P0.7 — ✅ FAUX POSITIF 2026-05-13 10:30 : CVE-2024-34351 Next.js SSRF (nuclei alarmiste)

**Statut** : ✅ non-issue après vérif — Next.js Hub en `15.5.18` (patché depuis 14.2.7), `next.config*` filtre les `remotePatterns`. Test manuel `curl /_next/image?url=https://example.com/...` → **400 Bad Request** côté Next.js, **404** sur path inattendu. Pas de SSRF exploitable.

**Origine du finding** : nuclei template `CVE-2024-34351` matche probablement le simple fait que `/_next/image` existe + OAST callback DNS, sans valider que le proxy fetch vraiment. À surveiller dans futurs runs mais pas de fix nécessaire.

**Action** : aucune. Garder en mémoire que nuclei flag ce path systématiquement sur tout Next.js exposé — c'est un piège.

### P0.7-archive — finding nuclei brut (référence)

**Preuve nuclei** :
```
[CVE-2024-34351] HIGH
https://app.veridian.site/_next/image?w=16&q=10&url=https://d823akq9dke6d3smi0c0c9wg8wah1aezz.oast.me
```

L'app a fetché l'URL OAST (out-of-band) externe via son `/_next/image` proxy → confirme SSRF exploitable. Next.js Image Optimization peut être abusé pour faire des requêtes serveur vers des cibles arbitraires (incluant le réseau interne Docker → autres containers Veridian).

**Surface concrète** :
- Scan du réseau interne `dokploy-network` depuis le container Hub
- Lecture metadata cloud (heureusement OVH = pas d'AWS IMDS, mais quand même)
- Exfiltration via DNS rebinding / TOCTOU

**Fix** :
- [ ] Vérifier la version Next.js du container Hub (`docker exec compose-back-up-online-pixel-nl2k9p-hub-authjs-1 cat /app/package.json | grep '"next"'`)
- [ ] Si < `14.2.7` ou `13.5.7` : bump immédiat
- [ ] Si version récente mais pas de `images.remotePatterns` strict configuré : ajouter dans `next.config.js` pour blacklister tout sauf domaines whitelistés
- [ ] Re-tester avec `obs pentest deep` après fix → finding doit disparaître

**Ticket vers team lead Hub** : à ajouter dans `todo/apps/hub/TODO.md` section "Tickets infra" — fix dans le code Next.js du Hub.

**Lien** : `runbooks/incidents/2026-05-13-pentest-manuel.md` à updater.

## P1 — important, à venir après les P0

### P1.1 — 🟡 Trivy scan automatisé : script prêt, scheduler à brancher

**Statut** : script `infra/scripts/trivy-scan-prod.sh` créé 2026-05-13, testé live OK (10+ images détectées : crowdsec, dokploy, imgproxy, hub, prospection, analytics, notifuse, twenty, verger-shop, etc.). Reste à le scheduler.

- [x] Script bash `infra/scripts/trivy-scan-prod.sh` (Trivy via docker run, --severity CRITICAL,HIGH, --ignore-unfixed, output JSON par image, alerte Telegram si crit > 0 ou high > 10)
- [x] Test live : scan tourne, mais script complet prend ~30 min sur ~15 containers (chaque image = vuln DB sync + scan layers)
- [ ] Décider scheduler : (a) Dokploy Schedule Jobs (nightly 03:00 UTC, recommended) (b) cron systeme `/etc/cron.d/veridian-trivy` (c) GitHub Actions self-hosted runner sur dev (~doublon avec _audit-cve.yml app-level)
- [ ] Brancher TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID dans Dokploy ENV
- [ ] Cron mensuel : rapport `runbooks/audits/<date>-trivy.md` (parse JSON + génère MD)

**Note** : le script est complémentaire de `_audit-cve.yml` (qui scan les deps npm app-level). Trivy ici scan les **images Docker complètes** (OS + libs système + dep npm pulled au build) — détecte les CVE qu'`npm audit` rate (vulns dans Alpine packages, openssl, etc.).

### P1.2 — Rotation périodique des secrets

- [ ] Inventaire des secrets critiques : `AUTH_SECRET`, `STRIPE_WEBHOOK_SECRET`, `TENANT_API_SECRET`, mots de passe DB, Brevo API key, Telegram bot token, etc.
- [ ] Procédure de rotation par secret dans `runbooks/secrets-rotation.md`
- [ ] Cron trimestriel : ping Robert "il est temps de roter X, Y, Z"
- [ ] Coordonner avec team leads apps quand la rotation impacte une app (ex: AUTH_SECRET hub = invalide les sessions existantes)

### P1.3 — Staging miroir prod

- [ ] Auditer l'état actuel des `*.staging.veridian.site` (combien existent vraiment)
- [ ] Décider : on monte un vrai staging miroir ou on assume dev → prod et on supprime staging ?
- [ ] Si miroir : configurer Dokploy pour que staging utilise les mêmes images Docker que prod (juste tags différents) avec ENV TEST
- [ ] Documenter le flow staging → prod (après dev → après green ?)

### P1.4 — ✅ RÉSOLU 2026-05-13 : Audit SSH et accès VPS

- [x] Audit prod : 4 clés actives (lab Robert + dokploy@veridian + 2 CI GitHub) — aucune zombie
- [x] `last -n 20` : seuls Robert (78.112.59.120 fibre + 80.214.215.165 Bouygues 4G occasionnel) + CI/Dokploy
- [x] Aucun cleanup nécessaire (4 clés toutes utilisées)
- [x] Documenté dans `runbooks/ssh-access-policy.md` + procédure ajout/retrait + audit mensuel
- [ ] Audit dev server (todo, lower priorité)

### P1.5 — Runbooks incidents typiques

- [ ] `runbooks/incidents/db-down.md` — basé sur incident 2026-05-08
- [ ] `runbooks/incidents/traefik-collision.md` — basé sur incident 2026-05-10
- [ ] `runbooks/incidents/container-OOM.md`
- [ ] `runbooks/incidents/cve-active-prod.md` — procédure quand une CVE high apparaît
- [ ] `runbooks/incidents/compromission.md` — basé sur audit verger-shop 2026-05-07

## P2 — nice to have, pas urgent

### P2.1 — Mesure des coûts

- [ ] Script qui parse les factures OVH + Cloudflare + Anthropic API
- [ ] Récap mensuel ping Telegram
- [ ] Dashboard Grafana coûts si possible

### P2.2 — WAF applicatif

- [ ] Étudier les scénarios CrowdSec applicatifs (rate limit, bot protection)
- [ ] Ou alternative : un middleware Next.js dans chaque app
- [ ] À cadrer avec team leads pour ne pas casser le legitimate trafic

### P2.3 — Documentation architecture

- [ ] `docs/ARCHITECTURE.md` — single source of truth
  - 1 page par app : description, dépendances, ENV critiques, URL prod/dev/staging
  - Diagramme des flows inter-apps
  - Règles de communication (URL publique cf. directive 07 cc-saas)
- [ ] À jour à chaque migration

### P2.4 — Audit logs applicatifs

- [ ] Vérifier que chaque app a une table `audit_log` Prisma
- [ ] Standardiser le schéma cross-app (si pertinent)
- [ ] Dashboard Grafana qui affiche l'activité audit

## Tickets ouverts vers les team leads d'app

(À remplir au fur et à mesure que tu détectes des bugs ou améliorations qui requièrent du code app)

| Date | App | Ticket | Statut |
|---|---|---|---|
| 2026-05-10 | hub | Ajouter endpoint `/api/admin/test-cleanup` pour cross-app tests | ouvert |
| 2026-05-10 | hub | Corriger ENV `PROSPECTION_API_URL` qui pointe vers nom container interne (cf. directive 07) | ouvert |

## Notes / décisions techniques

(Ajoute au fil de l'eau quand tu fais des choix archi importants)

---

**Quand tu attaques un chantier** :
1. Coche-le `[x]` quand fait
2. Note dans "Notes / décisions techniques" si arbitrage non évident
3. Si bloqué → escalade à Robert dans la section dédiée

**Format de ton reporting hebdomadaire** :

```
[INFRA] Weekly YYYY-MM-DD
✓ <ce qui a été shippé>
⚠ <warnings non bloquants>
🔥 <bloqueurs ou incidents>
→ next : <prochain chantier P0>
```
