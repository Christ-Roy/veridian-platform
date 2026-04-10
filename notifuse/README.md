# Notifuse (fork Veridian)

Fork leger de [Notifuse/notifuse](https://github.com/Notifuse/notifuse) pour le
rendre "SaaS-ready" selon le standard Veridian (voir `docs/saas-standards.md`
quand il sera ecrit en P1.1).

## Repos

- **Upstream** : https://github.com/Notifuse/notifuse (branche `main`)
- **Fork Veridian** : https://github.com/Christ-Roy/notifuse-veridian
- **Branche Veridian** : `veridian` (a creer, contient nos modifs)
- **Image custom** : `ghcr.io/christ-roy/notifuse-veridian:latest`
  (buildee par le self-hosted runner sur le dev server)

## Ce dossier (`notifuse/` dans le monorepo)

Ce dossier **ne contient pas le code Notifuse** — il contient uniquement :

- `README.md` — ce fichier
- `MERGING-UPSTREAM.md` — procedure rebase `veridian` sur `main` upstream
- `.upstream-version` — version (tag ou commit) upstream suivie actuellement
- (a venir) `Dockerfile` custom Veridian qui wrap l'image upstream + patches
- (a venir) overlays de config / scripts de provisioning

Le code Notifuse vit dans le repo `Christ-Roy/notifuse-veridian` sur la branche
`veridian`. Le monorepo ne contient que les artefacts d'integration Veridian
pour pouvoir builder une image custom sans dupliquer tout l'upstream.

## Statut

- **Sprint en cours** : P1.3 (voir `../todo/apps/notifuse/TODO.md`)
- **Fork upstream** : fait (2026-01-02)
- **Branche `veridian` sur le fork** : **a creer**
- **Image custom** : **a creer**
- **CI** : `.github/workflows/notifuse-ci.yml` (squelette placeholder, a compléter en P1.3)

## ⚠️ Retard upstream critique (2026-04-10)

- **Prod actuelle** : `notifuse/notifuse:v27.0` (pin dans `infra/docker-compose.yml`
  et `infra/docker-compose.staging.yml`)
- **Dernier stable upstream** : `v29.2` publie le 2026-04-09
- **Retard** : ~15 releases en 2 mois (v27.1 → v29.2). Deux versions majeures de
  retard (v27 → v29), il peut y avoir des breaking changes.
- **Action** : a traiter dans le sprint P1.3. Avant le fork, verifier le changelog
  upstream, tester `v29.2` en staging, appliquer en prod avec validation Robert.
  C'est probablement la premiere tache du sprint P1.3 (on part d'une base a jour).

## Philosophie

**Boite noire API-only**. Pilotable exclusivement via HTTP depuis le Hub
Veridian. Aucune integration directe DB cote Hub. Le Hub parle aux endpoints
standard (`POST /api/tenants/provision`, etc.), point.

**Minimal diff avec upstream** : tous nos changements vivent sur la branche
`veridian` pour pouvoir suivre les updates upstream facilement. On NE merge
JAMAIS nos changements sur `main` upstream — on reste sur une branche dediee.

## TODO

Voir `../todo/apps/notifuse/TODO.md` pour la liste detaillee des taches du
sprint P1.3.
