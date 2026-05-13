# Twenty — TODO detaille

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
>
> **Twenty = hands-off**. On ne fork PAS. On utilise l'image upstream comme une boite noire,
> pilotee via l'API GraphQL publique depuis le Hub. Toutes les custom features vivent dans le Hub.
>
> **Ce fichier** : note les quirks API GraphQL rencontres, les updates version, les problemes
> d'integration avec le reste de la stack. Pas de code, juste du suivi operationnel.

## ⚰️ Etat actuel — TWENTY MORT EN PROD (2026-05-09)

**Statut** : 🔴 **mort en prod, on reprendra plus tard**.

- **Version image prod** : `twentycrm/twenty:v1.19.1` (bumpée 2026-05-08 depuis v1.16.7)
- **URL prod** : https://twenty.app.veridian.site
- **Compose** : `compose-parse-optical-array-lvh5md` (composeId Dokploy `8zdqAAD1lkZFVAwuZ5USv`)
- **Containers** : 4 up depuis 22h (server + worker v1.19.1, postgres + redis Up 7 days)
- **Healthz HTTP** : 200 OK (l'API repond)
- **Mais** : UI/flows metier casses cote utilisateur (Robert constat live 2026-05-09)
- **Decision** : on laisse en l'etat, **PAS de session diag/fix prevue**, on reprendra plus tard
  quand on aura du temps ou quand on remplacera Twenty par autre chose.

## Historique session 2026-05-08 — bump v1.16.7 → v1.19.1

Bump effectue pour patcher 3 CVE :
- **CVE-2026-44729** (XSS HIGH 8.7) — Stored XSS via Unsanitized File Serving
- **CVE-2026-33975** (SSRF) — bypass via IPv6-mapped
- **CVE-2026-27023** (SSRF) — bypass via HTTP redirect

Chain incrementale validee : `v1.16.7 → v1.17.4 → v1.18.1 → v1.19.1`. Choix de s'arreter
a v1.19.1 car v1.20+ introduit la limite **5 workspaces sans Enterprise key** (PR #19036
mergee 2026-03-27, bloquante pour modele multi-tenant).

Backups conserves sur VPS prod :
- `/tmp/twenty-prod-prebump-20260508-2110.sql` (DB 15MB)
- `/tmp/twenty-prod-prebump-20260508-2110.tar.gz` (storage 357KB)

## Strategie (revisee 2026-05-09)

- **NE PAS forker** — pas de patch maison
- **NE PAS bumper au-dela de v1.19.1** — limite enterprise v1.20+ = bloquant
- **NE PAS deboguer le state mort actuel** sans session dediee
- **A terme** : remplacer Twenty par alternative CRM headless (NocoDB / Baserow / Apppsmith
  / autre) car l'evolution upstream est hostile au SaaS multi-tenant selfhost
- Le Hub continue d'utiliser l'API GraphQL si elle repond, sinon degrader gracefully

## Pour reprendre la session diag (futur)

1. Login UI sur https://twenty.app.veridian.site avec creds Robert et identifier le bug exact
   (page blanche ? skeleton loader figé ? erreur visible ?)
2. Capturer console messages browser + GraphQL responses
3. Comparer `core.navigationMenuItem` + `core.commandMenuItem` avec un fresh install v1.19.1
   pour voir s'il manque des migrations data
4. Si vraiment cassé, rollback via backup pg_dump :
   ```bash
   ssh prod-pub "docker stop compose-parse-optical-array-lvh5md-twenty-server-1 \
     compose-parse-optical-array-lvh5md-twenty-worker-1"
   ssh prod-pub "docker exec -i compose-parse-optical-array-lvh5md-twenty-postgres-1 \
     psql -U twenty -d postgres -c 'DROP DATABASE IF EXISTS twenty WITH (FORCE); CREATE DATABASE twenty OWNER twenty;'"
   ssh prod-pub "docker exec -i compose-parse-optical-array-lvh5md-twenty-postgres-1 \
     psql -U twenty -d twenty < /tmp/twenty-prod-prebump-20260508-2110.sql"
   # + bump image back to v1.16.7 dans le compose
   ```

## Sprint en cours

_(rien — projet en pause, reprise sans timeline)_

### Surveillance / maintenance (a quand on reprendra)
- [ ] Diag du state mort post-bump v1.19.1
- [ ] Decision finale : reparer ou remplacer Twenty
- [ ] Si remplacement : evaluer NocoDB / Baserow / Apppsmith / SuiteCRM / EspoCRM headless
- [ ] Pinner la version image dans `infra/docker-compose.yml` (actuellement v1.19.1 hardcoded ?)

### P1.6 (via Hub admin unifie — P3.6 en realite) — annule tant que Twenty mort
- ~~Bloc Twenty dans la vue workspace du Hub~~
- ~~Nombre de workspaces, activite recente, derniers contacts~~
- ~~Action "Force sync Twenty" depuis le Hub~~

## API GraphQL — quirks connus

_(a enrichir au fil des integrations)_

- L'API GraphQL Twenty est accessible sur `https://twenty.app.veridian.site/graphql`
- Auth via JWT Twenty (distinct du JWT Hub)
- Les workspaces Twenty ne sont **pas** alignes automatiquement sur les tenants Veridian
  → le Hub doit maintenir un mapping `veridian_tenant_id → twenty_workspace_id`

## Bugs connus

_(aucun identifie — a documenter au fil des integrations)_

## Decisions techniques

- **Zero fork** : decision explicite de Robert. Toute tentative de fork serait une derive.
- **API GraphQL uniquement** : si l'API manque une feature, on la demande a l'upstream ou
  on la fait dans le Hub. Jamais de modif direct du code Twenty.
- **Updates = bump d'image** : zero friction pour suivre les versions.
- **Mapping tenant → workspace** : maintenu cote Hub dans la table `tenants.twenty_workspace_id`.

## Notes agents (chantiers en cours)

_(vide)_

## Recently shipped

_(aucun — app stable en prod, pas de modif recente)_
