# Notifuse — TODO detaille

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
>
> Fork leger de Notifuse OSS pour le rendre SaaS-ready. Boite noire API-only,
> pilotee par le Hub. Integration Stripe native, limites par plan, soft delete.
> Stack : Go (inchange upstream), tests natifs Notifuse + nos specs Veridian.

## Etat actuel

- **Fork** : a creer (`Christ-Roy/notifuse-veridian`, branche `veridian`)
- **Dossier monorepo** : a creer (`notifuse/`)
- **URL prod actuelle** : https://notifuse.app.veridian.site (image upstream)
- **Sante** : 🟡 (fonctionnel mais pas SaaS-ready, pas de paywall, pas de soft delete)

## Sprint en cours

### P1.3 — Notifuse fork boite noire

**🚨 Bloquant zero — rattraper le retard upstream (2026-04-10)**
- [ ] Prod actuelle : `notifuse/notifuse:v27.0` (pin `infra/docker-compose.yml:491` et `infra/docker-compose.staging.yml:433`)
- [ ] Dernier stable upstream : `v29.2` publie le 2026-04-09 (confirme via Docker Hub API)
- [ ] ~15 releases de retard en 2 mois (v27.1 → v29.2), **deux majors** (v27 → v29)
- [ ] Lire le changelog v28.0 et v29.0 (breaking changes probables)
- [ ] Tester `v29.2` en staging : bump image, restart, verifier API + envoi email test
- [ ] Bumper en prod (accord Robert, backup DB Notifuse avant)
- [ ] **Partir d'une base a jour** avant d'attaquer le fork lui-meme — sinon on fork v27
  et on paie le merge upstream deux fois

**Setup fork**
- [ ] Fork GitHub : `Christ-Roy/notifuse-veridian` avec branche `veridian`
- [ ] Dossier `notifuse/` dans le monorepo (Dockerfile custom, compose entry, CI dediee)
- [ ] Image custom : `ghcr.io/christ-roy/notifuse-veridian:latest` buildee self-hosted runner
- [ ] Script `ci/check-oss-versions.sh` etendu pour alerter sur upstream bump
- [ ] Doc `notifuse/MERGING-UPSTREAM.md` : procedure rebase `veridian` sur `main` upstream
  **(point critique — sans ca on n'arrivera pas a suivre les updates)**

**Reutiliser CI + tests upstream**
- [ ] NE PAS remplacer les tests e2e natifs Notifuse (Go)
- [ ] Etendre avec nos specs Veridian : provisioning API, paywall, limites plan
- [ ] Reutiliser le workflow GitHub Actions upstream + ajouter nos jobs
- [ ] A chaque merge upstream : verifier que les tests upstream passent toujours

**Appliquer le standard P1.1**
- [ ] Endpoints provisioning (contrat standard cross-SaaS) :
  - [ ] `POST /api/tenants/provision` — cree workspace pour un tenant Hub
  - [ ] `POST /api/tenants/update-plan` — applique plan Stripe
  - [ ] `POST /api/tenants/suspend` — suspend envoi (paywall)
  - [ ] `DELETE /api/tenants/:id` — soft delete, purge cron 30j
  - [ ] `GET /api/tenants/:id/status` — usage mois en cours, quota restant
- [ ] Soft deletion sur tenants + workspaces + templates
- [ ] Stripe paywall : middleware bloque l'envoi si plan suspendu / trial expire
- [ ] Limites par plan (aligne sur les products Stripe existants) :
  - [ ] Freemium : 500 emails/mois
  - [ ] Pro 29EUR : 10k emails/mois
  - [ ] Business 49EUR : 50k emails/mois
- [ ] Integration Stripe directe : webhook local `/api/webhooks/stripe`, source de verite = Stripe
- [ ] Audit log sur actions sensibles (suspend, delete, change plan)
- [ ] Health check `/api/health` conforme au standard

## Backlog Notifuse-specific

- [ ] Nettoyage workspaces orphelins : cron detecte sans activite 90j + flag Hub
- [ ] Metrics d'envoi par tenant (bounce rate, open rate, click rate)
- [ ] Dashboard tenant : consommation mois en cours vs quota
- [ ] Templates emails Veridian par defaut (logo, couleurs, footer legal)

## Bugs connus

_(aucun identifie — app pas encore forkee)_

## Decisions techniques

- **Fork vs image upstream** : on fork pour ajouter Stripe + standard SaaS. Upstream
  Notifuse n'est pas "SaaS-ready" (pas de paywall, pas de soft delete propre).
- **Branche dediee `veridian`** : minimise le diff avec upstream pour faciliter les merges.
  Tous nos changements dans cette branche, jamais sur `main`.
- **Garder la CI upstream** : leurs tests valident que nos modifs ne cassent pas le coeur.
  On ajoute nos specs par-dessus, on ne remplace pas.
- **Boite noire** : aucun appel direct DB Notifuse depuis l'exterieur. Hub parle HTTP, point.

## Notes agents (chantiers en cours)

_(vide — fork pas encore fait)_

## Recently shipped

_(rien — app a creer)_
