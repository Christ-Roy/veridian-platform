# Incident 2026-05-10 — Hub /api/auth/* HTTP 500 (collision Traefik)

> Statut : **résolu** (workaround). Cause racine = bug architectural Dokploy/Traefik à fixer durablement.
> Détecté : 2026-05-10 ~12:55 par Robert. Résolu : 13:05.
> Impact : login impossible sur app.veridian.site pendant ~3h (depuis 10:05 quand le compose fantôme a été redémarré).

## Symptôme

Tous les endpoints `/api/auth/*` du Hub répondaient HTTP 500 :
```json
{"message":"There was a problem with the server configuration. Check the server logs for more information."}
```

Endpoints affectés : `/providers`, `/csrf`, `/session`, `/signin`, `/signup`. Donc **personne ne pouvait se logger sur le Hub**.

Le reste fonctionnait (home, /pricing, /api/health, container `Up 26h healthy`). C'était silencieux : aucune alerte, aucun log d'erreur Auth.js dans le container.

## Diagnostic (étapes parcourues)

1. Vérification ENV (`AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `DATABASE_URL`, `GOOGLE_OAUTH_*`) → toutes présentes et valides
2. Vérification DB (`hub_app.users` 19 rows, schema match Prisma) → OK
3. Vérification connexion DB depuis container (`net.Socket` test) → OK
4. Reproduction locale (`docker pull` même image + ENV bidons) → **fonctionne en local** !
5. Test interne au network Dokploy depuis un alpine sidecar :
   ```bash
   docker run --rm --network=dokploy-network alpine \
     wget -qO- --header="Host: app.veridian.site" http://hub-authjs:3000/api/auth/providers
   ```
   → **Retourne le bon JSON** ! Donc le hub fonctionne.
6. Lecture des logs Traefik :
   ```
   "ServiceAddr":"10.0.1.203:3000"
   "ServiceName":"compose-parse-digital-bandwidth-xfd9mu-1-websecure@docker"
   ```
   Traefik routait vers un AUTRE container que `hub-authjs`.

## Cause racine

**Deux containers prétendaient servir `app.veridian.site`** :

| Container | Status | Image | Labels Traefik |
|---|---|---|---|
| `compose-back-up-online-pixel-nl2k9p-hub-authjs-1` (le bon) | Up 26h healthy | `:hub-authjs-staging` | `Host(app.veridian.site)` |
| `compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1` (FANTÔME) | Up 3h healthy (started 10:05) | `:latest` (ancien web-dashboard pre-Auth.js) | `Host(app.veridian.site)` |

Quand 2 routers Traefik ont la même règle Host, c'est l'**ordre alphabétique des noms de routers** qui décide. `compose-parse-digital-bandwidth-xfd9mu-1-websecure` < `hub-authjs-websecure` → l'ancien gagnait.

L'ancien container web-dashboard pointait vers une IP fantôme (`10.0.1.203:3000`) qui n'avait plus de service Auth.js fonctionnel post-migration → renvoyait 500 sur `/api/auth/*` (Auth.js v5 avec ENV partiellement compatibles mais code obsolète).

**Comment c'est arrivé** : pendant le blue/green Hub Auth.js (2026-05-08), on a déployé le NOUVEAU compose `nl2k9p` à côté de l'ANCIEN compose `xfd9mu`. La bascule a juste stoppé le container ancien, **mais sans modifier ses labels Traefik ni le compose Dokploy**. Le compose Dokploy ancien existait toujours, avec `restart: always` configuré. À 10:05 ce matin, quelque chose a redémarré le container fantôme (probablement Dokploy au reboot ou sync, ou un agent qui a cliqué Deploy par erreur).

## Workaround appliqué (immédiat)

```bash
ssh prod-pub "docker stop compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1
docker update --restart=no compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1"
```

Vérifié : tous endpoints `/api/auth/*` redeviennent 200 immédiatement.

## Découverte étendue 2026-05-10 13:11 — bug propagé sur prospection AUSSI

Pendant l'audit des autres composes carcasses, **prospection était dans le même état** depuis ~3h :

```
RouterName="prospection-saas@docker"  ← l'ANCIEN
ServiceURL="http://10.0.1.205:3000"
```

Le compose `compose-index-solid-state-card-d7uu39` (ancien prospection-saas pre-Auth.js, container `Up 3 hours` avec `restart=unless-stopped`) capait `Host(prospection.app.veridian.site)` et gagnait sur le routeur `prospection-authjs@docker` actuel par ordre alphabétique.

`prospection-saas` < `prospection-authjs` en lexicographique → bingo, on prend l'ancien.

Workaround : stop + restart=no sur l'ancien container. Prospection rétabli.

**Conclusion** : ce n'était pas un coup isolé sur le hub. Tous les anciens composes des migrations blue/green sont des bombes à retardement.

## Cleanup massif 2026-05-10 13:15

Audit complet des 5 composes carcasses identifiés :

| Compose | Hosts captés | État pre-cleanup | Action |
|---|---|---|---|
| `compose-parse-digital-bandwidth-xfd9mu` (ancien web-dashboard hub) | `app.veridian.site` | container exited+restart=no (déjà fix) | YAML renommé `.disabled-2026-05-10-collision-fix` |
| `compose-index-solid-state-card-d7uu39` (ancien prospection-saas) | `prospection.app.veridian.site` | **container UP 3h (restart=unless-stopped)** ⚠️ | container stop+restart=no, YAML renommé |
| `compose-input-back-end-application-t364gq` (prospection-fr) | `prospection.internal.veridian.site` | aucun container | YAML renommé |
| `compose-copy-mobile-card-hy9a9f` (multi assets/linkedin/prospection internal) | `assets.internal`, `linkedin.internal`, `prospection.internal` | aucun container | YAML renommé |
| `compose-program-digital-application-vb1x5n` (CrowdSec doublon historique) | aucun | aucun container, déjà 3 backups `.bak-*` | YAML renommé |

**Backups** : `/home/ubuntu/dokploy-carcasses-backup-20260510-1511/` sur prod-pub.

## Bug architectural Hub : ENV utilisaient noms de containers internes

Au passage, découvert un anti-pattern dans le compose Hub Dokploy :

```yaml
# AVANT (compose-back-up-online-pixel-nl2k9p)
PROSPECTION_API_URL: http://compose-connect-redundant-firewall-l5fmki-prospection-authjs-1:3000
PROSPECTION_INTERNAL_URL: http://compose-connect-redundant-firewall-l5fmki-prospection-authjs-1:3000
```

Le Hub appelait prospection via le **nom de container Docker** au lieu de l'URL publique. Conséquences :
- Si le compose prospection est recréé (blue/green, refacto Dokploy), le nom change, le Hub appelle dans le vide
- Aucune cohérence avec les autres apps (Twenty, Notifuse étaient déjà en URL publique)
- Pas testable depuis un agent QA externe

**Fix appliqué** : modif compose Dokploy via API (`compose.update` puis `compose.deploy`) pour pointer sur `https://prospection.app.veridian.site`. Container hub-authjs recréé proprement, ENV vérifiées.

**À noter** : pendant le fix j'ai d'abord essayé `docker compose up -d hub-authjs` direct depuis `/etc/dokploy/compose/.../code/`. **Erreur** : ça crée un container avec project=`code` (le nom du dossier parent), pas le nom Dokploy attendu. Résultat = 2 containers hub-authjs en parallèle, tous deux avec les mêmes labels Traefik. Heureusement Traefik n'a qu'un service mais c'était dangereux. **La règle CLAUDE.md "JAMAIS docker compose up sur compose Dokploy" est confirmée — toujours passer par l'API Dokploy `compose.update` + `compose.deploy`**.

## Dette résiduelle après cleanup

- DB postgres carcasse `compose-index-solid-state-card-d7uu39-prospection-saas-db-1` reste UP (pas stoppée par précaution car contient peut-être des data tenants legacy). Squatte le DNS Docker `prospection-saas-db` mais Docker DNS résout vers la bonne DB (`code-prospection-saas-db-1` via IP `10.0.1.81`). À auditer + dump avant suppression.
- Les composes carcasses restent visibles côté Dokploy UI (juste avec YAML disabled). Robert peut les supprimer définitivement via l'UI quand il aura validé qu'on n'en a plus besoin.

## ⚠️ TODO PROCHAINE SESSION — Causes racines à fixer durablement

### 1. Carcasses composes Dokploy post blue/green non nettoyées

Le workflow blue/green documenté (`project_blue_green_pattern.md`) dit "ne JAMAIS modifier le compose legacy" pour rollback rapide. **MAIS il manque la phase 11 : suppression définitive du compose legacy après stabilisation** (typiquement 7 jours).

**À faire** :
- [ ] Auditer tous les composes Dokploy "carcasses" (containers stoppés mais compose YAML toujours présent + labels Traefik conflictuels)
- [ ] Lister identifiés : `compose-parse-digital-bandwidth-xfd9mu` (web-dashboard ancien Hub), `compose-index-solid-state-card-d7uu39` (prospection-saas ancien), `compose-input-back-end-application-t364gq` (prospection-fr), `compose-copy-mobile-card-hy9a9f` (multi), `compose-program-digital-application-vb1x5n` (CrowdSec doublon, déjà bak)
- [ ] **Décision pour chaque** : soit supprimer du Dokploy via API (`compose.delete`), soit modifier labels Traefik pour qu'ils pointent vers un Host inexistant (ex `legacy-DELETED.veridian.site`)
- [ ] Ajouter dans `project_blue_green_pattern.md` une **Phase 11 obligatoire** "Cleanup compose legacy" avec checklist (containers stop+restart=no, labels modifiés ou compose supprimé, vérification Traefik n'a plus de doublon de Host).

### 2. CI / monitoring : pourquoi ça a passé sans alerte ?

**À faire** :
- [ ] **Smoke test prod hub** dans la CI : ajouter un job qui curl `https://app.veridian.site/api/auth/providers` et fail si != 200. Aujourd'hui le smoke test prod existe pour prospection (PR #16 récent ci-warden) mais PAS pour hub. À aligner.
- [ ] **Monitoring Telegram** : `/opt/veridian/monitoring/` doit ping app.veridian.site sur les routes critiques `/api/auth/providers` et `/api/health`, pas juste l'URL racine. Aujourd'hui le `prod-healthcheck.sh` du dev server check juste HTTPS 200 racine — ce qui passait pendant les 3h d'incident. Élargir aux routes critiques métier.
- [ ] **Alerte Traefik dual-router** : ajouter au monitoring un check qui parse les routers Traefik (`docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers`) et **alert si 2 routers sur le même Host**.

### 3. Auth.js v5 : silence sur erreur de config

L'erreur `"There was a problem with the server configuration"` était silencieuse (aucun log dans le container hub-authjs car Traefik routait ailleurs). Mais **même sur le container fantôme**, on n'a pas vu l'erreur dans les logs. Auth.js v5 catch et n'imprime que si `AUTH_DEBUG=true`.

**À faire** :
- [ ] Activer `AUTH_DEBUG=true` en permanence en prod sur les apps Hub/Prospection/Analytics — peu de coût, beaucoup de signal en cas d'incident
- [ ] Ou ajouter un wrapper `logger.error` custom dans `auth.config.ts` qui force `console.error` même sans debug

### 4. Documentation blue/green à compléter

Ajouter dans `project_blue_green_pattern.md` :
- [ ] Section "Pièges connus" : **collision de routers Traefik si deux composes captent le même Host** → 1 router gagne par ordre alpha sans warning
- [ ] Phase 11 cleanup décrit ci-dessus
- [ ] Checklist post-bascule : `docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers | jq '.[] | select(.rule | contains("app.veridian.site"))'` pour vérifier qu'il n'y a qu'UN router par Host
