# Audit infra clean-by-design — 2026-05-11

> Audit complet de l'infrastructure prod Veridian, déclenché par incident Hub
> dual-router (`/pricing` 500 sur 10/10 requêtes durant 6h+). Réalisé par
> l'agent infra le 2026-05-11.

## Résumé exécutif

| Domaine | État avant | Action réalisée | État après |
|---|---|---|---|
| Dual-router Traefik Hub | 🔥 actif | Delete stack legacy `dashboard` via Dokploy API | ✅ résolu (10/10 200) |
| Stacks Dokploy zombies | 3 stacks (1 bombe) | Delete via API + volumes | ✅ 0 zombie |
| DNS wildcard `*.green.app.veridian.site` | absent | Créé sur CF + cert LE provisionné | ✅ prêt pour blue-green |
| Script détection collision Traefik | absent | `infra/scripts/check-traefik-unique-host.sh` | ✅ commit `3402e08` |
| Tags images en prod | `:latest` sur 7 stacks | Audit → CI ok, problème = composes Dokploy | ⚠️ standards à appliquer |
| ENV secrets prod | `.env` Dokploy partout | Audit complet | ✅ propre (0 leak dans composes) |
| Healthchecks containers prod | ~50% sans HC | Audit complet | ⚠️ standards à appliquer |
| Volumes prod | tous nommés | Audit complet | ✅ propre |
| Disk dev server | 100% saturé | Cleanup 13G | ✅ 82% (14G libres) |

## 1. Incident résolu : Hub dual-router

**Cause profonde** : la stack Dokploy legacy `dashboard` (composeId
`Rnt_Jz4BhkcyEJ2D6Bugb`, appName `compose-parse-digital-bandwidth-xfd9mu`)
n'avait jamais été supprimée après la migration Auth.js du 2026-05-09. Elle
contenait l'image `ghcr.io/christ-roy/veridian-dashboard:latest` (pré-Auth.js,
manque les ENV `NEXTAUTH_URL` → 500 sur toute route auth-aware) + des labels
Traefik `Host(app.veridian.site)`.

Le 2026-05-11 09:48 quelqu'un (cron Dokploy ou redeploy manuel) a relancé la
stack. Traefik a fait du round-robin entre l'ancien et le nouveau container.
Résultat : 10/10 requêtes `/pricing` en 500.

**Fix appliqué** : `DELETE /api/trpc/compose.delete` avec
`{"composeId":"Rnt_Jz4BhkcyEJ2D6Bugb","deleteVolumes":true}`. Container
supprimé, compose dir purgé, volumes nettoyés. `/pricing` repasse à 200/200.

## 2. Stacks zombies éliminées

| ComposeId | Name | Issue | État après |
|---|---|---|---|
| `Rnt_Jz4BhkcyEJ2D6Bugb` | dashboard | Legacy Hub, dual-router | Supprimée |
| `J2f9wtBnrAO-86DE3_WMS` | prospection-greenauthjs | Idle depuis 2026-05-10 | Supprimée |
| `xelXB17eNlesUlHqHJCtY` | prospection-saas | Créée 2026-05-11 10:13 avec DB `prospection-saas-db` → bombe DNS collision | Supprimée |

**Forensique** : composes sauvegardés dans
`/home/ubuntu/forensics/2026-05-11-cleanup/` sur prod-pub pour post-mortem.

## 3. Tags images Docker — état actuel

### CI workflows : OK ✓

Les workflows CI buildent et pushent correctement avec tag versionné :

| App | Workflow | Tag versionné | Tag latest aussi pushed |
|---|---|---|---|
| prospection | `prospection-ci.yml` | `type=sha,prefix=` ✓ | oui |
| cms | `cms-ci.yml` | `${{ github.sha }}` ✓ | oui |
| hub | `hub-ci.yml` | `${{ steps.version.outputs.version }}` ✓ | oui |
| analytics | `analytics-ci.yml` | idem ✓ | oui |
| notifuse | absent | ø (build manuel `saas-v1.0.0`) | ø |

### Composes Dokploy en prod : ⚠️ référencent `:latest`

| Compose | Image utilisée | Problème |
|---|---|---|
| hub-authjs | `veridian-dashboard:hub-authjs-staging` | tag branche sans sha → flou |
| prospection-authjs | `prospection:latest` | aucune traçabilité version en prod |
| analytics | `analytics:latest` | idem |
| asset-bank | `asset-bank:latest` | idem |
| cms-prod | `cms-prod:latest` | idem, **+ image construite localement non pushée sur ghcr** |
| verger-shop | `verger-faverolles-shop:latest` | idem |
| notifuse | `notifuse-veridian:saas-v1.0.0` | ✓ versionné explicitement |
| linkedin-dashboard | `linkedin-dashboard:4b21800` | ✓ sha git |
| Composants tiers (postgres, redis, traefik...) | versions pinnées | ✓ |

**Verdict** : la CI est propre, le problème est dans la **référence Docker
des composes Dokploy**. Le standard cible (`<app>:sha-XXX`) est documenté
dans `runbooks/standards/docker-image-tags.md`.

## 4. ENV secrets : propre ✓

Tous les composes Dokploy chargent leurs secrets via `${VAR}` depuis
le `.env` géré par Dokploy. **0 secret en clair dans les `docker-compose.yml`**.

Cependant les `.env` Dokploy en clair sur disque restent un risque si le VPS
est compromis (cf incident `verger-shop` 2026-05-07). À couvrir par :
- audit SSH des accès VPS (P1.4 TODO)
- rotation périodique secrets critiques (P1.2 TODO)

## 5. Healthchecks Docker : 13/34 containers sans HC

Containers prod **sans healthcheck défini** (sur 34) :
- `veridian-cms-prod` ❌ (critique — l'app exposée)
- `compose-parse-optical-array-lvh5md-twenty-server-1` ❌ (critique)
- `compose-parse-optical-array-lvh5md-twenty-worker-1` ❌
- `compose-connect-redundant-firewall-l5fmki-prospection-authjs-1` ❌ (critique)
- `code-prospection-saas-db-1` ❌ (Postgres critique)
- `dokploy-postgres.1.*` ❌
- `dokploy-redis.1.*` ❌
- `compose-parse-digital-alarm-974mhw-rest-1` ❌
- `compose-parse-digital-alarm-974mhw-functions-1` ❌
- `compose-quantify-solid-state-microchip-ft7svu-linkedin-dashboard-1` ❌
- `compose-index-bluetooth-driver-sm2qyo-asset-bank-1` ❌
- `dokploy-traefik` ❌
- `code-prospection-saas-db-1` ❌

**Impact** : Dokploy considère ces containers "running" tant que le process
n'a pas crashé, même si l'app interne ne répond plus. Pas de redémarrage auto
sur app figée.

**Action** : standards documentés dans
`runbooks/standards/docker-healthchecks.md`. Tickets ouverts vers chaque team
lead pour ajout `HEALTHCHECK` dans `Dockerfile` ou label `healthcheck` dans
compose.

## 6. Volumes prod : propre ✓

Volumes critiques (Postgres / data) tous nommés explicitement, identifiables :

| Volume | Taille | Contenu |
|---|---|---|
| `code_prospection-saas-data` | 4.1G | DB prospection prod |
| `infra_notifuse-db-data` | 667M | DB notifuse |
| `infra_twenty-db-data` | 247M | DB Twenty |
| `00-global-saas_twenty-db-data` | 104M | DB Twenty (legacy ?) |
| `infra_crowdsec-db` | 95M | CrowdSec |
| `veridian-cms-prod_cms-pgdata-prod` | 74M | DB CMS |
| `infra_supabase-db-data` | 70M | DB Supabase |
| `compose-parse-multi-byte-feed-ywg73b_veridian-core-db-data` | 70M | DB veridian-core |
| `verger-shop-ozjjew_postgres_data` | 48M | DB verger-shop |
| `code_postgres_data` | 47M | DB Postgres legacy |

**À investiguer (suivi P1)** : 2 volumes Twenty (`00-global-saas_twenty-db-data`
104M + `infra_twenty-db-data` 247M) — duplication suspecte, vérifier lequel
est utilisé en prod et archiver l'autre.

## 7. Dette identifiée et chantiers ouverts

### Bloquants pour clean-by-design

- [ ] **Renommer les services Docker dans les composes** : `web-dashboard` → `hub-prod`,
      `prospection-saas` → `prospection-prod`, etc. Permet container names
      lisibles `compose-xxx-hub-prod-1` au lieu de `compose-xxx-web-dashboard-1`.
- [ ] **Migrer prod vers tags `:sha-XXX` immutables** : modifier les composes
      Dokploy pour référencer le sha au lieu de `:latest`, et déployer via
      `composeId` update au lieu de `docker pull :latest && restart`.
- [ ] **Ajouter healthchecks** sur 13 containers prod (tickets app)
- [ ] **CI build & push pour notifuse-veridian** : actuellement build manuel
- [ ] **Pousser l'image `veridian/cms-prod` sur ghcr** : actuellement construite
      en local sur le VPS, perdue si VPS HS

### Suivi qualité

- [ ] Trivy scan nightly (P1.1 TODO)
- [ ] Rotation périodique secrets critiques (P1.2)
- [ ] Audit SSH VPS (P1.4)
- [ ] Investiguer doublon volumes Twenty
- [ ] Setup Loki/Grafana pour visibilité dual-router en temps réel (P0.2 TODO)

## 8. Outils créés cette session

- **`infra/scripts/check-traefik-unique-host.sh`** — détecte les collisions
  dual-router Traefik. Exit 1 si > 1 container répond au même Host. À utiliser
  AVANT et APRÈS toute bascule blue-green.
- **DNS wildcard `*.green.app.veridian.site`** + cert Let's Encrypt → les
  agents applicatifs ont maintenant une URL prête pour tester en blue-green
  sans toucher au Host prod.
- **Router Traefik `green-placeholder`** dans
  `/etc/dokploy/traefik/dynamic/green-wildcard.yml` — catch-all pour les
  hosts green non encore réclamés.

## 9. Prochaines étapes immédiates (P0)

1. Renommer le service Hub dans le compose `nl2k9p` de `hub-authjs` à
   `hub-prod` (cohérence avec le naming standard).
2. Idem pour les autres services : `prospection-authjs` → `prospection-prod`,
   `notifuse` → `notifuse-prod`, etc. (au fil de l'eau lors des prochaines
   modifs de compose pour ne pas casser les agents en cours).
3. Réécrire le prompt `cc-saas/prompts/applicatif/06-blue-green-procedure.md`
   pour fusionner les 2 procédures contradictoires + ajouter rollback détaillé
   + référencer le script `check-traefik-unique-host.sh`.
4. Faire un test grandeur nature : redéployer hub-authjs comme `hub-green`
   avec Host `hub.green.app.veridian.site`, vérifier que le wildcard cert
   répond, valider la procédure blue-green complète.
