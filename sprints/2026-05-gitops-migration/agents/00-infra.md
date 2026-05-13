# Agent Infra — fiche de mission sprint GitOps

> Agent : Claude (rôle infra unique)
> Worktree : `~/Bureau/veridian-platform-infra/` (branche `work/infra`)
> Démarré : 2026-05-13

## Scope global

Tout ce qui n'est PAS une app SaaS Veridian individuelle. En particulier :

- **Infra commune** : Traefik, CrowdSec, fail2ban, monitoring `/opt/veridian/`, backups, Dokploy core (mais pas modifier Dokploy lui-même)
- **Observabilité** : Grafana Cloud, Alloy, Loki, Mimir, Tempo, CLI `obs`
- **Sécurité op** : Trivy (compose + scans), CI security templates, audits CVE
- **Cleanup prod** : zombies, volumes orphelins, decision Supabase
- **Documentation transverse** : runbooks, standards, pattern GitOps

**Hors scope** : tout ce qui est code applicatif Next.js/Node/Payload de Hub, Prospection, Analytics, CMS, Notifuse, Twenty, sites tertiaires. Si je dois toucher une app pour fixer un truc infra, j'ouvre un ticket dans `todo/apps/<app>/TODO.md` section "Tickets infra".

## État au démarrage du sprint

### Déjà livré pendant la session du 2026-05-13

- ✅ Bump Traefik v3.6.7 → v3.6.17 prod + dev (`grafana/scripts/bump-traefik.sh` idempotent)
- ✅ Compose Trivy ephemeral dans `grafana/trivy/` (déployé prod, base CVE cachée)
- ✅ Audit Trivy global des 28 images prod → [prod-inventory-audit.md](../prod-inventory-audit.md)
- ✅ Plan cleanup rédigé → [cleanup-plan.md](../cleanup-plan.md)
- ✅ P0.8 inscrit dans `todo/infra/TODO.md`
- ✅ Mémoires : `project_traefik_bump.md`, `project_dokploy_gitops_migration.md`

### En attente go Robert

- ⏸ Décisions cleanup (5 décisions dans `cleanup-plan.md`)
- ⏸ Pilot Notifuse en GitOps (sera mon premier vrai test du pattern)
- ⏸ Suite scans Trivy KO (traefik:v3.6.17, supabase/storage-api, supabase/postgres-meta)

## Mes chantiers du sprint (par ordre de priorité)

### Chantier 1 — Pilot Notifuse en GitOps (Phase 0c)

**Objectif** : valider que le pattern "Dokploy provider Git" marche réellement, sans casser
Notifuse en prod. Si ça marche, on a un runbook reproductible pour les agents applicatifs.

**Étapes** :

1. **Snapshot complet Notifuse actuel**
   ```bash
   mkdir -p tmp/dokploy-snapshot-notifuse-$(date +%Y%m%d-%H%M)
   ssh prod-pub 'sudo cat /etc/dokploy/compose/compose-transmit-open-source-microchip-k9lvap/code/docker-compose.yml' \
     > tmp/dokploy-snapshot-notifuse-*/docker-compose-live.yml
   ssh prod-pub 'docker inspect $(docker ps -q -f name=notifuse-prod)' \
     > tmp/dokploy-snapshot-notifuse-*/containers-inspect.json
   ssh prod-pub 'docker exec dokploy-traefik wget -qO- http://localhost:8080/api/http/routers 2>/dev/null' | \
     jq '.[] | select(.service | contains("notifuse"))' \
     > tmp/dokploy-snapshot-notifuse-*/traefik-routers.json
   ```

2. **Vérifier `infra/services/notifuse/` existe ou créer** avec :
   - `docker-compose.yml` Git-clean (images SHA-pinned)
   - `.env.example` (sans secrets, juste les noms d'env vars)
   - `README.md` : healthcheck endpoint, où sont les secrets (Dokploy ENV), procédure rollback

3. **Pinning SHA** :
   ```bash
   # Récupérer le SHA actuel des images Notifuse
   ssh prod-pub 'docker images --digests | grep -E "notifuse|postgres:17"'
   ```

4. **PR sur main** : compose + workflow CI YAML lint + tests verts

5. **Une fois mergé, bascule Dokploy UI** :
   - Project → Notifuse → Settings → Provider : **Raw → Git**
   - URL : `git@github.com:christ-roy/veridian-platform.git`
   - Branche : `main`
   - Path : `infra/services/notifuse/docker-compose.yml`
   - Activer "Auto Deploy" → noter l'URL webhook
   - GitHub repo settings → Webhooks → Add → coller URL

6. **Test deploy** :
   - Monitor 5 min sur `https://notifuse.app.veridian.site`
   - Push commit no-op (espace dans le README) → vérifier que Dokploy redeploy
   - Vérifier que les certs Traefik tiennent (labels dans le compose Git)

7. **Test rollback** : `git revert` → push → Dokploy redeploy l'état précédent

8. **Rédiger [gitops-pattern.md](../gitops-pattern.md)** avec :
   - Procédure standard step-by-step (15 étapes max)
   - Pièges trouvés pendant le pilot
   - Checklist avant/pendant/après bascule
   - Recovery si ça casse

**Définition de done** :
- [ ] Notifuse en mode Git Dokploy, deploy auto via webhook
- [ ] Compose `infra/services/notifuse/docker-compose.yml` SHA-pinned dans main
- [ ] 7 jours sans incident sur Notifuse
- [ ] Runbook `gitops-pattern.md` validé

### Chantier 2 — Cleanup prod (Phase 0b)

Exécuter [cleanup-plan.md](../cleanup-plan.md) après validation Robert des 5 décisions.

Ordre : Étape 1 (zombies safe) → Étape 2 (images mortes) → Étape 3 (volumes orphelins
backup+kill) → Étape 4 (DB prospection-saas) → Étape 5 (Supabase si KILL) → Étape 6
(CrowdSec reconstruct — chantier 3 ci-dessous).

**Définition de done** :
- [ ] Étapes 1-5 exécutées avec test prod entre chaque
- [ ] `/tmp/forensics/2026-05-13-cleanup/` archivé
- [ ] Métriques cleanup : RAM libérée, disk libéré, images dégagées (à reporter dans
      `sprints/2026-05-gitops-migration/status.md`)

### Chantier 3 — CrowdSec reconstruct (Étape 6 cleanup)

**Contexte** : `code-crowdsec-1` tourne en orphelin (compose Dokploy `.disabled`/`.bak`).
Le bouncer (`code-crowdsec-traefik-bouncer-1`) a crashé sans relance. Migration plugin Traefik
faite récemment (cf mémoire `project_infra_pieges.md`).

**Cas spécial** : reconstruire **directement en mode GitOps** (pas la peine de passer par Raw).
Première vraie démo du pattern Git pour Dokploy après le pilot Notifuse.

**Étapes** :

1. Snapshot CrowdSec actuel + récupérer LAPI key, scenarios installés, decisions
   ```bash
   ssh prod-pub 'docker exec code-crowdsec-1 cscli decisions list -o json > /tmp/crowdsec-decisions.json'
   ssh prod-pub 'docker exec code-crowdsec-1 cscli collections list -o json > /tmp/crowdsec-collections.json'
   ssh prod-pub 'docker exec code-crowdsec-1 cscli bouncers list -o json > /tmp/crowdsec-bouncers.json'
   ssh prod-pub 'docker exec code-crowdsec-1 cat /etc/crowdsec/local_api_credentials.yaml > /tmp/crowdsec-lapi-creds.yaml'
   ```

2. Créer `infra/services/crowdsec/docker-compose.yml` propre :
   - Service `crowdsec` (LAPI) avec image `crowdsecurity/crowdsec:v1.7.7` SHA-pinned
   - Pas de bouncer container — on utilise déjà le plugin Traefik (cf middleware `crowdsec@file`)
   - Volumes nommés `crowdsec-config`, `crowdsec-db` pour persistance
   - Healthcheck explicite
   - Mount socket Docker pour acquisition logs (`docker:dokploy-traefik` datasource)

3. PR + review

4. Bascule en mode Git Dokploy : créer **nouvelle stack** Compose en mode Git (ne pas
   essayer de récupérer l'ancien compose Dokploy mort)

5. Deploy → restore LAPI key + decisions snapshot

6. Vérifier que le middleware `crowdsec@file` Traefik trouve toujours le LAPI à
   `http://crowdsec:8080` (dépend du nom de service Docker — bien le nommer `crowdsec`
   dans le nouveau compose)

7. Supprimer l'ancien dossier `compose-program-digital-application-vb1x5n` une fois la
   nouvelle stack stable 24h.

**Définition de done** :
- [ ] CrowdSec en mode Git Dokploy
- [ ] Bouncer Traefik (plugin) talk à la nouvelle LAPI
- [ ] `obs check security` → `security_crowdsec_blind` clean
- [ ] CVE Trivy CrowdSec : pas pire qu'aujourd'hui (8 CRIT actuels, peut difficilement
      mieux tant qu'upstream n'a pas patché)
- [ ] Ancien dossier Dokploy `compose-program-digital-application-vb1x5n` archivé puis supprimé

### Chantier 4 — Supabase decision execution (Étape 5 cleanup)

Dépend de la décision Robert (KILL / KEEP / KEEP+patch).

Si **KILL** :
- 5 sous-étapes documentées dans `cleanup-plan.md` Étape 5
- Coordination avec ticket dans `todo/apps/hub/TODO.md` + `todo/apps/prospection/TODO.md`
  pour leur dire de retirer leurs env vars Supabase obsolètes

Si **KEEP+patch** :
- Bump toutes les images Supabase upstream (12 containers)
- Migrer toute la stack en GitOps `infra/services/supabase/`
- Estimer downtime + scheduler en heure creuse

### Chantier 5 — Étendre `obs check`

L'audit Trivy de cette session m'a montré que `obs check security` doit gagner :

- [ ] **`security_image_cve`** : pour chaque container running, scan Trivy + report CRIT/HIGH.
      Cache 6h. Drill-down : `obs security images <container>`.
- [ ] **`security_image_outdated`** : pour chaque image, check Docker Hub / GHCR si tag plus
      récent disponible. Cache 6h.
- [ ] Compléter `CHECK_TOPICS` dans `obs/main.py` — 8 checks security existants ne remontent
      pas dans le summary par topic (bug latent).
- [ ] Sous-commande `obs security images` pour vue détaillée par container.
- [ ] Tests unitaires : mocks SSH/HTTP, golden tests parsing Trivy JSON.

**Définition de done** :
- [ ] `obs check security` montre les 50+ CRIT actuelles avant cleanup
- [ ] Après cleanup Supabase : `obs check security` montre << 20 CRIT/HIGH
- [ ] Tests `pytest tests/test_trivy.py` verts

### Chantier 6 — Templates CI security à partager

Préparer un dossier `runbooks/templates/ci/` avec :

- [ ] `security-cve.yml` — workflow GitHub Actions générique (Trivy bloquant CRIT/HIGH)
- [ ] `dependabot.yml` — config Dependabot npm + docker
- [ ] `renovate.json` — config Renovate avec auto-merge patches Trivy-clean
- [ ] `README.md` template "Security policy app Veridian"

Les agents applicatifs copient ces fichiers dans leur worktree et les adaptent à leur app.

## Pièges connus pour mon scope

Lire avant toute manip :
- Mémoire `project_infra_pieges.md` — **OBLIGATOIRE** avant toucher CrowdSec/Traefik/Dokploy
- Mémoire `feedback_compose_jamais_recreate_aveugle.md` — `docker compose up` aveugle = mort
- Mémoire `feedback_traefik_experimental_features.md` — features experimental.* Traefik bloquantes
- Mémoire `project_traefik_bump.md` — script idempotent, modèle pour les autres bumps

## Coordination avec les agents applicatifs

**Quand j'ai besoin qu'un agent applicatif fasse quelque chose** :
- J'ouvre un ticket dans `todo/apps/<app>/TODO.md` section "Tickets infra"
- Je ne touche PAS leur code, ils le font

**Quand un agent applicatif a besoin de moi** :
- Il ouvre un ticket dans `todo/infra/TODO.md` ou m'envoie un SendMessage
- Je traite dans MON worktree, je ne touche pas le leur

**Coordination sprint** : on synchronise via le tableau dans [README.md](../README.md) mis à jour
au fil de l'eau (qui a fait quoi, qui attend qui).

## Status courant

| Chantier | État |
|---|---|
| 1 — Pilot Notifuse | en attente go Robert |
| 2 — Cleanup prod | plan rédigé, en attente décisions Robert |
| 3 — CrowdSec reconstruct | dépend chantier 1 et 2 |
| 4 — Supabase decision | dépend décision Robert |
| 5 — Étendre obs check | doable maintenant en parallèle |
| 6 — CI templates | doable maintenant en parallèle |

## Définition de done du sprint (côté infra)

- [ ] CrowdSec, Notifuse, Supabase (kill ou GitOps) tous traités
- [ ] Trafik continue de bumper via script existant (pas migrable en GitOps facilement —
      lancé directement par Dokploy)
- [ ] `obs check security` couvre CVE images + outdated images
- [ ] Templates CI security publiés dans `runbooks/templates/ci/`
- [ ] Runbook `gitops-pattern.md` validé
- [ ] `prod-inventory-audit.md` re-run montre situation propre
- [ ] Métriques sprint : moins de 20 CRIT cumulées en prod, < 100 HIGH
