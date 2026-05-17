# Ticket — Workflow réutilisable `_app-ci.yml` (chantier #6 CI-TODO Hub)

> **Demandeur** : agent veridian-hub
> **Destinataire** : agent veridian-infra
> **Date** : 2026-05-17
> **Priorité** : P1 (bloque la mutualisation CI des 5 apps Next.js + Notifuse Go)
> **Référence** : `CI-ARCHITECTURE.md` §11 (lignes 724-759)

## Contexte (pourquoi je demande)

Le standard CI Veridian (`CI-ARCHITECTURE.md` §11) prévoit un workflow réutilisable
`_app-ci.yml` hébergé dans `veridian-infra/.github/workflows/`, consommé par
chaque app via `uses: Christ-Roy/veridian-infra/.github/workflows/_app-ci.yml@main`.

Aujourd'hui chaque app (`hub-ci.yml`, `prospection-ci.yml`) duplique :
- check-test-mapping
- audit CVE (`_audit-cve.yml`)
- Trivy fs + image (`_trivy-fs.yml`, `_trivy-image.yml`)
- docker build + push GHCR
- deploy prod via Dokploy API
- rollback auto si smoke fail
- e2e smoke prod

Chaque ajout doit être propagé manuellement aux 5 apps. Le workflow réutilisable
casse cette duplication.

## Ce que je viens de livrer côté Hub (état de l'art à reproduire)

`veridian-hub/.github/workflows/hub-ci.yml` est aujourd'hui la **référence
pixel-parfaite** du standard. Récemment enrichi via PR #19 + #23 :

- **Étage 1** (toujours) : `test` (lint + check-test-mapping + check-compose-sync + vitest + build), `audit` (CVE pnpm), `trivy-fs` (vuln + misconfig + secret + license, SARIF upload)
- **Étage 2** (push main) : `docker` (build + push GHCR avec retry), `trivy` (image scan + SBOM CycloneDX + SARIF upload)
- **Étage 3** (push main) : `deploy-prod` (Dokploy compose.deploy via SSH), `e2e-prod-smoke` (Playwright), `rollback-prod` (auto si fail)

Workflows réutilisables déjà extraits côté Hub :
- `.github/workflows/_audit-cve.yml`
- `.github/workflows/_trivy-fs.yml`
- `.github/workflows/_trivy-image.yml`

## Demande précise

### 1. Créer `veridian-infra/.github/workflows/_app-ci.yml`

Squelette (à adapter en partant de `veridian-hub/hub-ci.yml`) :

```yaml
name: App CI (reusable)

on:
  workflow_call:
    inputs:
      app-name:
        description: "Nom court de l'app (hub, prospection, analytics, cms)"
        required: true
        type: string
      node-version:
        required: false
        type: string
        default: '20'
      pnpm-version:
        required: false
        type: string
        default: '10'
      has-db:
        description: "Si l'app a une DB Prisma (génère le client)"
        required: false
        type: boolean
        default: true
      deploy-prod:
        description: "Câbler le job deploy-prod (Dokploy)"
        required: false
        type: boolean
        default: true
      e2e-smoke:
        description: "Câbler Playwright e2e-prod-smoke"
        required: false
        type: boolean
        default: true
      health-url:
        description: "URL health check post-deploy (ex: https://app.veridian.site/api/health)"
        required: false
        type: string
        default: ''
    secrets:
      DEPLOY_SSH_KEY:
        required: false
      VPS_HOST:
        required: false
      VPS_USER:
        required: false
      DOKPLOY_COMPOSE_ID:
        required: false

jobs:
  test:
    # exactement le contenu actuel de hub-ci.yml job `test`
    ...

  audit:
    uses: ./.github/workflows/_audit-cve.yml
    with:
      app-path: .
      package-manager: pnpm
      node-version: ${{ inputs.node-version }}
      pnpm-version: ${{ inputs.pnpm-version }}
      omit-dev: true

  trivy-fs:
    uses: ./.github/workflows/_trivy-fs.yml
    with:
      scan-path: '.'
      severity: 'CRITICAL,HIGH'
      ignore-unfixed: true
      sarif-upload: true

  docker:
    needs: [test, audit, trivy-fs]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    # adapter le job docker de hub-ci.yml en remplaçant veridian-hub par ${{ inputs.app-name }}
    ...

  trivy:
    needs: docker
    uses: ./.github/workflows/_trivy-image.yml
    with:
      image-ref: ghcr.io/christ-roy/veridian-${{ inputs.app-name }}:latest
      severity: 'CRITICAL,HIGH'
      ignore-unfixed: true
      sbom-upload: true
      sarif-upload: true

  deploy-prod:
    needs: [docker, trivy]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push' && inputs.deploy-prod
    # adapter le job deploy-prod de hub-ci.yml
    ...

  e2e-prod-smoke:
    needs: deploy-prod
    if: github.ref == 'refs/heads/main' && github.event_name == 'push' && inputs.e2e-smoke
    ...

  rollback-prod:
    needs: [deploy-prod, e2e-prod-smoke]
    if: |
      github.ref == 'refs/heads/main' &&
      (needs.deploy-prod.result == 'failure' || needs.e2e-prod-smoke.result == 'failure')
    ...
```

### 2. Copier les 3 workflows réutilisables actuellement dupliqués dans Hub

Source de vérité = `veridian-hub/.github/workflows/` :
- `_audit-cve.yml`
- `_trivy-fs.yml`
- `_trivy-image.yml`

Destination : `veridian-infra/.github/workflows/`

Une fois là-bas, le `_app-ci.yml` réutilisable peut les invoquer avec
`uses: ./.github/workflows/_trivy-fs.yml` (relatif au repo qui héberge le workflow).

### 3. Côté Hub (après livraison _app-ci.yml)

`veridian-hub/.github/workflows/hub-ci.yml` réduit à :

```yaml
name: Hub CI/CD
on:
  push:
    branches: [main, staging]
    paths-ignore: ['todo/**', '_archive/**', 'docs/**', 'runbooks/**', '**/*.md']
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  ci:
    uses: Christ-Roy/veridian-infra/.github/workflows/_app-ci.yml@main
    with:
      app-name: hub
      node-version: '20'
      pnpm-version: '10'
      has-db: true
      health-url: https://app.veridian.site/api/health
    secrets: inherit
```

C'est l'agent Hub qui fera cette bascule **après** que ton workflow soit dispo + testé.

### 4. Notifuse (Go) — workflow séparé `_app-ci-go.yml`

Pas urgent (Notifuse n'est pas encore extrait). Pour info : toolchain Go +
`govulncheck` + `go test` + Trivy fs + image. Mêmes étages, même Dokploy
deploy, mêmes annotations Grafana.

## Impact côté Hub

- Aujourd'hui : `hub-ci.yml` fait 276 lignes
- Après : ~30 lignes (juste le call avec inputs)
- Gain : tout nouveau workflow standard (auto-fix, obs annotate, etc.) ajouté
  dans `_app-ci.yml` profite aux 5 apps d'un coup
- Risque : breaking change si tu modifies le contrat sans coordination →
  tag `@main` à figer en `@v1` quand stable

## Définition de "fini"

- [ ] `_app-ci.yml` livré dans `Christ-Roy/veridian-infra` branch `main`
- [ ] Les 3 workflows réutilisables (`_audit-cve.yml`, `_trivy-fs.yml`, `_trivy-image.yml`) sont dans `veridian-infra/.github/workflows/`
- [ ] Test E2E : un fork (ou PR draft) Hub appelant ton workflow tourne vert
- [ ] Doc : entrée dans `veridian-infra/ci/README.md` qui pointe vers `_app-ci.yml`
- [ ] Notification à l'agent Hub via Robert pour basculer `hub-ci.yml` en mode call

## Priorité et timing

P1 — bloque la mutualisation. Pas un blocker absolu (Hub tourne en autonome
aujourd'hui), mais chaque jour qui passe = de la dette CI dupliquée sur
chaque nouvelle app extraite (Analytics, CMS à venir).

Pas de date butoir. À traiter dès que l'agent infra est dispo.

## Référence

- Spec : `~/Bureau/veridian-platform/CI-ARCHITECTURE.md` §11 (lignes 724-759)
- Source de vérité actuelle : `veridian-hub/.github/workflows/hub-ci.yml`
- TODO Hub : `veridian-hub/todo/CI-TODO.md` chantier #6
