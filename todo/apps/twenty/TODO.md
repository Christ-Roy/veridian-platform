# Twenty — TODO detaille

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
>
> **Twenty = hands-off**. On ne fork PAS. On utilise l'image upstream comme une boite noire,
> pilotee via l'API GraphQL publique depuis le Hub. Toutes les custom features vivent dans le Hub.
>
> **Ce fichier** : note les quirks API GraphQL rencontres, les updates version, les problemes
> d'integration avec le reste de la stack. Pas de code, juste du suivi operationnel.

## Etat actuel

- **Version image** : voir `infra/docker-compose.yml` (tag `twenty-crm/twenty:latest` ou pin)
- **URL prod** : https://twenty.app.veridian.site
- **Sante** : 🟢 (boite noire qui tourne)
- **Containers** : 4 (server, worker, db, redis)

## Strategie

- **NE PAS forker** — updates = simple bump d'image dans `docker-compose.yml`
- **Utiliser uniquement l'API GraphQL** — le Hub consomme via un client GraphQL
- **Pas de customisation code** — si besoin d'une feature custom, la faire dans le Hub
- **Surveiller les updates upstream** via `ci/check-oss-versions.sh`

## Sprint en cours

### Surveillance / maintenance
- [ ] Pinner la version image dans `docker-compose.yml` (actuellement `latest` ?)
- [ ] Script `ci/check-oss-versions.sh` : alerte sur bump Twenty
- [ ] Tester les updates en staging avant prod (pull nouvelle image, bump compose, restart)

### P1.6 (via Hub admin unifie — P3.6 en realite)
- [ ] Bloc Twenty dans la vue workspace du Hub (appel API GraphQL)
- [ ] Nombre de workspaces, activite recente, derniers contacts
- [ ] Action "Force sync Twenty" depuis le Hub (webhook ou API call)

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
