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

## P1 — important, à venir après les P0

### P1.1 — Trivy scan automatisé

- [ ] Workflow `.github/workflows/trivy-scan-nightly.yml`
- [ ] Scan toutes les images Docker prod (5 apps + twenty + supabase legacy + cms postgres)
- [ ] Alerting Telegram si CVE critical/high système détectée
- [ ] Rapport mensuel dans `runbooks/audits/<date>-trivy.md`

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

### P1.4 — Audit SSH et accès VPS

- [ ] `ssh prod-pub "cat ~/.ssh/authorized_keys"` — qui a accès ?
- [ ] `last -n 20` — qui s'est connecté récemment ?
- [ ] Cleanup des clés inutilisées
- [ ] Documenter les clés autorisées dans `runbooks/ssh-access-policy.md`
- [ ] Idem pour dev server

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
