# Sécurité — TODO post-incident verger-shop (2026-05-07)

> Suite à la compromission `verger-shop` du 2 au 7 mai 2026 (CVE Next.js
> 15.1.6 RCE flight protocol, mineur XMRig 5 jours, ENV exfiltrées dont
> Stripe sk_live), inventaire des actions à mener pour durcir l'infra.
>
> Doc complet de l'incident : `~/Bureau/INCIDENT-VERGER-2026-05-07.md`
> Snapshot forensique : `/home/ubuntu/forensics-verger-shop-20260507-110951/`
> sur le VPS prod.

---

## P0 — À régler IMMÉDIATEMENT

### Boxtal — révocation credentials API
- [ ] Téléphoner Boxtal au **01 75 77 37 97** (lun-ven 9h-18h) pour révoquer la clé `J7ODQZC...` du compte 914224 (Vergers de Faverolles)
- [ ] Demander à Thomas (client) de checker son dashboard Boxtal "Mes envois" du 2 au 7 mai pour identifier d'éventuels bordereaux frauduleux
- [ ] Demander à Thomas son relevé bancaire (débits Boxtal anormaux entre le 2 et le 7 mai)
- [ ] Une fois révoquée, émettre nouvelle clé API et la stocker dans `~/credentials/.all-creds.env` + Dokploy verger-shop

### Stripe — rotation manuelle dashboard
- [x] Roll `STRIPE_SECRET_KEY` (ancienne `…sNqllCS` révoquée 2026-05-09, nouvelle `…b6Rlk` déployée — propagée sur 13 composes Dokploy + redeploy hub-authjs/twenty-server/twenty-worker, validée HTTP 200 Stripe API)
- [ ] Roll `STRIPE_WEBHOOK_SECRET` (whsec_u8XYa...) sur https://dashboard.stripe.com/webhooks
- [ ] Vérifier les Stripe logs depuis le 6 mai pour activité suspecte (refunds, payouts, transferts)
- [ ] Mettre à jour les nouvelles clés dans Dokploy verger-shop ENV avant redeploy

### Telegram bot Verger
- [ ] Sur Telegram → DM `@BotFather` → `/revoke` → choisir le bot Verger Faverolles
- [ ] Récupérer nouveau token + mettre à jour Dokploy

### PR asset-bank Next 15.5.14
- [ ] Merger https://github.com/Christ-Roy/asset-bank/pull/1 (CI build OK, low-risk)
- [ ] Vérifier que le redeploy automatique se déclenche correctement

---

## P1 — Cette semaine (sécurité plateforme)

### CrowdSec — ✅ FIXED 2026-05-08 17:55 — l'IPS voit enfin les logs HTTP

**Problèmes constatés (avant fix)** :
- CrowdSec ne lisait AUCUN log HTTP : `acquis.yaml` pointait sur `/var/log/nginx/*.log` et `/var/log/apache2/*.log` qui n'existent pas (on a Traefik, pas nginx/apache)
- Traefik n'avait pas d'accessLog activé → aucun log HTTP n'était généré côté reverse proxy
- Bouncer Traefik avait des timeouts 5s vers CrowdSec API (résolu via DETTE-001, bump v1.7.7)
- Les scénarios HTTP CVE étaient installés (log4j, http-admin-probing, http-backdoors, etc.) mais **inutiles tant que les logs HTTP n'étaient pas consommés**

**Fix appliqué (2026-05-08 17:55)** : datasource Docker plutôt que fichier
log. CrowdSec lit `docker logs dokploy-traefik` directement via socket
Docker — pas besoin de bind-mount path log, plus propre.

- [x] Activer `accessLog: format: json` dans `/etc/dokploy/traefik/traefik.yml`
- [x] Ajouter `/var/run/docker.sock:/var/run/docker.sock:ro` au compose CrowdSec
- [x] Créer `/etc/crowdsec/acquis.d/traefik-docker.yaml` :
  ```yaml
  source: docker
  container_name:
    - dokploy-traefik
  labels:
    type: traefik
  ```
- [x] Vérifier que la collection `crowdsecurity/traefik` est bien chargée — auto-installée par CrowdSec au boot via `COLLECTIONS` env
- [x] Recreate CrowdSec + restart Traefik
- [x] Tester avec `curl -sI https://app.veridian.site/.env` etc. — confirmé : scénarios `http-crawl-non_statics`, `http-probing`, `http-sensitive-files`, `http-wordpress-scan` se déclenchent (pas d'overflow car IP testeur whitelistée, mais c'est OK le mécanisme tourne)
- [x] Logs CrowdSec confirment : `docker:dokploy-traefik | Lines read=20 | Lines parsed=20`

**Backups avant modif** :
- `/etc/dokploy/compose/compose-program-digital-application-vb1x5n/code/docker-compose.yml.bak-20260508-175526-pre-acquis`
- `/etc/dokploy/traefik/traefik.yml.bak-20260508-175526-pre-accesslog`

**Validation finale** : `cscli metrics show scenarios` montre 4 scénarios HTTP
qui pour la première fois ont des compteurs > 0. Avant : 0 partout.

**Pourquoi ça aurait évité l'incident verger** : un POST avec payload flight protocol exploit serait probablement matché par `http-bad-user-agent` ou `http-backdoors-attempts` ou `http-crawl-non_statics`, et l'IP de l'attaquant aurait été bannie avant qu'il dépose le miner.

### CVE actives dans la stack — à patcher

**Audit fait le 7 mai 2026** sur tous les containers Next.js de prod :

| Service | Version actuelle | CVE | Action |
|---|---|---|---|
| `verger-shop` (DOWN) | Next 15.1.6 | 🚨 RCE flight (exploitée) | Bumper 15.5.14+ avant redeploy |
| `app.veridian.site` (web-dashboard / hub) | Next 14.2.35 | DoS only (pas RCE) | Issue ouverte https://github.com/Christ-Roy/app.veridian/issues/1 — upgrade Next 14→15 + React 18→19 = breaking, planifier session dédiée |
| `asset-bank` | Next 15.2.4 | RCE flight | PR #1 ouvert, merger |
| `analytics`, `prospection-authjs` | Next 15.5.14 | DoS only | OK |
| `linkedin-dashboard` | Next 16.1.6 | DoS only | OK |
| `veridian-cms-prod` | Next 16.2.3 | RAS | OK |

**Autres images vulnérables** (pas Next.js) :

| Service | Version | Risque | Action |
|---|---|---|---|
| `twenty.app.veridian.site` | Twenty CRM **v1.16.7** | 🚨 **CVE-2026-26720 RCE** (workflow serverless functions) | Upgrade vers v2.2.0 (déjà déployé en parallèle sur `twenty-green-direct`) |
| `api.app.veridian.site` | Kong **2.8.5** | Très vieux (2022), CVE inconnues mais probables | Upgrade Kong 3.x |
| `notifuse.app.veridian.site` | Notifuse v27.0 | À auditer | Vérifier dernière stable |

**Process à mettre en place** :
- [ ] Job CI (Dokploy Schedule) hebdomadaire qui lance `npm audit` sur chaque app du monorepo et alerte Telegram si CVE critical/high
- [ ] Script `ci/check-oss-versions.sh` (déjà mentionné dans TODO infra) à étendre pour Twenty/Notifuse/Kong
- [ ] Convention : avant chaque push prod = `npm audit` obligatoire, 0 critical/high toléré
  (cf. règle ajoutée dans `~/.claude/CLAUDE.md` section "Sécurité — règles non négociables")

### Secrets management

**Constat** : tous les secrets sont en `process.env` du container. Une RCE = exfiltration intégrale via `digest` des erreurs Next.js (vu dans les logs forensique : Stripe sk_live, Brevo, Boxtal, AUTH_SECRET tous décodés en clair en HEX).

**Actions** :
- [ ] Évaluer migration vers un **secret manager** :
  - Option A : **Doppler** (SaaS, simple, $3/mois pour basic)
  - Option B : **Vault** auto-hébergé (gratuit mais lourd à maintenir)
  - Option C : **Cloudflare Workers secrets** (pour les apps qu'on migre serverless)
- [ ] Au minimum : utiliser **Stripe restricted keys** avec scopes minimaux au lieu de `sk_live` complet
- [ ] Rotation automatique des secrets DB toutes les 24h (Postgres `ALTER USER` + reload Dokploy ENV)
- [ ] **Secrets segmentés par client** : ne plus partager une clé Brevo entre 5 services (ce qui force à propager la rotation partout)

### Bouncer CrowdSec — connexions ESTAB en cascade — ✅ FIXED 2026-05-08

Voir [`../dette-technique/001-crowdsec-bouncer-saturation.md`](../dette-technique/001-crowdsec-bouncer-saturation.md)
pour le détail. Résolu via :
- [x] Bump CrowdSec v1.6.4 → v1.7.7 (la version v1.6.4 avait un bug ghost bouncers)
- [x] `cscli bouncers prune` pour purger les ghosts
- [x] Allowlist LAPI `veridian_internal` pour les CIDR Docker internes
- [x] Restart bouncer pour purger les connexions HTTP keep-alive cassées
- [x] CPU CrowdSec : 5% → 0.02%, 403 ratio : 67% → 0.14%
- [ ] Reste : migrer fbonalair vers `crowdsec-bouncer-traefik-plugin` mode stream (P3 non urgent — voir DETTE-001)

---

## P2 — Ce mois (prévention)

### Audit de surface d'attaque

**Inventaire fait le 7 mai 2026** des services exposés internet (DNS résolu) :

🌍 **Exposés direct (DNS → 51.210.7.44)** :
- analytics.app.veridian.site (Analytics Next 15.5.14 ✅)
- prospection.app.veridian.site (Prospection Next 15.5.14 ✅)
- twenty-green-direct.app.veridian.site (Twenty v2.2.0 ✅)
- app.veridian.site (Web-Dashboard Next 14.2.35 ⚠️)
- notifuse.app.veridian.site (Notifuse v27.0 ⚠️ audit)
- api.app.veridian.site (Kong 2.8.5 🚨)
- twenty.app.veridian.site (Twenty v1.16.7 🚨)

☁️ **Exposés via Cloudflare** :
- cms.veridian.site (Next 16.2.3 ✅)
- twenty-green.app.veridian.site (Twenty v2.2.0 ✅)

🔒 **Privés Tailscale** :
- linkedin.internal.veridian.site
- assets.internal.veridian.site

**Actions** :
- [ ] Mettre derrière Cloudflare proxy **TOUS** les domaines (au moins ceux avec services SaaS) → bénéfices : DDoS protection, WAF, IP réelle masquée
- [ ] Désactiver l'accès direct VPS public sur les ports 80/443 si tout passe par Cloudflare (ou whitelist CF IPs uniquement)
- [ ] Documenter dans `docs/` la matrice "service ↔ exposition" pour traçabilité

### Isolation réseau Docker
- [ ] Évaluer la séparation `dokploy-network` en plusieurs réseaux par sensibilité :
  - `public-network` : containers exposés web (Traefik + apps frontend)
  - `internal-network` : DB, Redis, Notifuse, services internes
  - Aujourd'hui : tout est sur `dokploy-network` donc une RCE dans n'importe quel container peut taper sur n'importe quel autre service interne TCP

### Logging et observabilité
- [ ] Centraliser les logs Docker dans Loki ou un equivalent (actuellement `docker logs` only, pas d'historique long-terme)
- [ ] Alertes Telegram sur :
  - Création de container Docker non-prévu
  - Modification fichier `/etc/passwd`, `/etc/shadow` sur l'hôte
  - Connexion SSH depuis IP externe inconnue
  - Process avec >50% CPU pendant >10min (détecter mining)
  - Connexion sortante vers IP non whitelist (catch C2 mining)
- [ ] Étendre le monitoring `/opt/veridian/monitoring/` (déjà alertes Telegram pour container down) avec ces nouveaux scénarios

### Backups
- [ ] Vérifier que la BDD `verger_shop` est bien dans le backup R2 quotidien
- [ ] Tester un restore complet du shop verger en preprod (pour valider la sauvegarde)
- [ ] Étendre le backup à TOUS les Postgres clients (verger, futur Morel boutique, etc.)

---

## P3 — Plus tard (chantiers structurants)

### Migration sites clients vers serverless
- [ ] Sites simples (vitrines + formulaire contact) → **Cloudflare Pages + Workers**
  - Élimine le risque mining (V8 isolate, pas de filesystem persistent)
  - Élimine le risque persistance d'attaque (stateless)
  - Réduit les coûts hosting (gratuit jusqu'à 100k req/mois)
- [ ] Boutiques e-commerce (Verger, futurs) : rester containerisé OU migrer vers Vercel pour le SSR/Server Actions
- [ ] Évaluation à faire app par app : Hub, Prospection, Analytics, etc.

### Plan de réponse à incident formalisé
- [ ] Créer `docs/SECURITY-INCIDENT-RUNBOOK.md` avec :
  - Étapes snapshot forensique avant kill
  - Liste des canaux de révocation par service (Stripe dashboard, Brevo dashboard, Boxtal téléphone, etc.)
  - Template email notification client
  - Template notification CNIL
  - Template message support tiers (Boxtal, Stripe)
- [ ] Drill annuel : simuler un incident sur un service de staging, vérifier que les procédures marchent

### CVE Twenty CRM 1.16.7 — upgrade urgent
- [ ] Backuper la BDD Twenty (peut-être plusieurs tenants dedans)
- [ ] Tester l'upgrade v1.16.7 → v2.2.0 sur un environnement de test
- [ ] Vérifier les migrations Postgres + le compatibility schéma
- [ ] Programmer fenêtre de maintenance + rollback plan
- [ ] Migration en prod avec downtime annoncé
- [ ] Une fois fait, supprimer l'instance v1.16.7 (le container `compose-parse-optical-array-lvh5md`)

---

## Annexe — IoC du miner XMRig

Pour future détection si le malware revient :

```
Hash sha256:
  fd11982f252c060a1372e81d5be57589647052b56281a5c54975ca22164f7726  systemd-logind (XMRig variant 1)
  b20f39fc00d242e706b6c30367ad811c676e0575050a4ec2f30104b696944b49  cpu-logind     (XMRig variant 2)

Pool C2: 185.132.53.73:443 (TLS RandomX, wallet "NEuFOFA22222k")
Bloquer cette IP dans iptables (déjà fait sur VPS prod)

Pattern process: .*-logind ./[bin] -c config.json (camouflage en daemon Linux)
Lieu de drop typique: /var/tmp/ dans containers Alpine
```
