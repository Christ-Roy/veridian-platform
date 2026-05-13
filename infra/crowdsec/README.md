# CrowdSec — IaC stack

## Structure

- `compose.yml` — service `crowdsec` v1.7.7 (LAPI + agent). **PAS encore
  géré par Dokploy** (cf restant TODO P0.4).
- `whitelists.yaml` — parser `s02-enrich/whitelists.yaml` : IP/CIDR jamais
  bannies (Robert, dev server, Tailscale, Better Uptime, RFC1918).
- `acquis.yaml` (TODO) — datasource Docker pour parser logs Traefik.

## Mécanisme allowlist

CrowdSec n'a pas de "decision type whitelist". L'allowlist passe par un
**parser** dans `/etc/crowdsec/parsers/s02-enrich/whitelists.yaml`.

Ce parser whitelist est lu par tous les scenarios → ne crée jamais de
décision `ban` pour les IPs whitelistées. La collection
`crowdsec/whitelist-good-actors` est installée (env `COLLECTIONS=...`)
pour bénéficier des whitelist DNS publics/CDN automatiques en plus.

## Apply

```bash
# Sync infra/crowdsec/whitelists.yaml → prod + SIGHUP reload
infra/scripts/crowdsec-apply-allowlist.sh

# Dry-run :
infra/scripts/crowdsec-apply-allowlist.sh --dry-run
```

Le script copie le yaml dans le container CrowdSec et envoie SIGHUP pour
hot-reload (pas de restart container). Test 2026-05-13 : OK.

## Bouncer

Depuis 2026-05-13, le bouncer Traefik est **intégré dans Traefik** via
le plugin officiel `maxlerebourg/crowdsec-bouncer-traefik-plugin v1.6.0`
(mode stream, cache local 60s, fail-open).

Voir `infra/traefik/dynamic/crowdsec-middleware.yml` + commit `8e9b906`.

## Re-onboarding Dokploy (TODO)

Le compose `compose-program-digital-application-vb1x5n` est en `.disabled`
sur prod. Plan :
1. Dokploy UI → supprimer la stack zombie (composeId à identifier)
2. Créer nouvelle stack "crowdsec" pointant sur ce dossier git
3. `--no-recreate` au premier deploy pour préserver le container actuel

Détaillé dans `todo/infra/TODO.md` P0.4 restants.

## Sanity checks

```bash
# Container up + healthy
ssh prod-pub "docker ps --filter name=crowdsec --format '{{.Names}}\t{{.Status}}'"

# Décisions actives
ssh prod-pub "docker exec code-crowdsec-1 cscli decisions list 2>&1 | head"

# Bouncers enregistrés
ssh prod-pub "docker exec code-crowdsec-1 cscli bouncers list 2>&1 | head"

# Collections installées
ssh prod-pub "docker exec code-crowdsec-1 cscli collections list 2>&1 | head"
```
