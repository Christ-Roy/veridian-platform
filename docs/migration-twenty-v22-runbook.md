# Runbook migration Twenty v1.16.7 → v2.2.0

> **Document de reference** pour la prochaine session de migration. Tout ce qu'il faut
> savoir + commandes paste-ready + pieges identifies.
>
> Source : session 2026-05-08 (echec sur clone DB clonee dans Dokploy infra full).
> Auteur : Claude Code, en collaboration avec Robert.

## Etat de depart

| Element | Valeur |
|---|---|
| Version prod actuelle | `twentycrm/twenty:v1.16.7` |
| URL prod | https://twenty.app.veridian.site |
| ComposeId Dokploy prod | `8zdqAAD1lkZFVAwuZ5USv` |
| AppName prod (random Dokploy) | `compose-parse-optical-array-lvh5md` |
| Container server prod | `compose-parse-optical-array-lvh5md-twenty-server-1` |
| Container postgres prod | `compose-parse-optical-array-lvh5md-twenty-postgres-1` |
| Volumes externes | `infra_twenty-db-data`, `infra_twenty-redis-data`, `infra_twenty-storage` |
| Domain prod (file Traefik) | `/etc/dokploy/traefik/dynamic/twenty-wildcard.yml` |
| EnvId Dokploy SaaS | `KmNwdMqLi9ye4xZ57WsnC` |
| ProjectId Dokploy SaaS | `k1QH0C0d8T4EC23y4HBFI` |
| DB taille | 63 MB (workspaces: 19, users: 25) |
| Storage taille | ~488 KB (1 workspace dir) |

## Acces

```bash
# SSH
ssh prod-pub                  # → ubuntu@51.210.7.44 (PROD OVH VPS) ⚠️
ssh dev-pub                   # → ubuntu@37.187.199.185 (dev-server, OK pour tests)

# Dokploy API (clé dans ~/credentials/.all-creds.env → DOKPLOY_API_KEY)
KEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
curl -s -H "x-api-key: $KEY" https://dokploy.veridian.site/api/trpc/project.all
```

## Phase 1 — STANDALONE BOCAL sur dev-server

> **Objectif** : faire marcher Twenty v2.2.0 sans Traefik/CrowdSec/dokploy-network.
> Si ca marche en standalone, on a la preuve que la migration est saine.
> Si ca rate, le bug est cote Twenty et il faut isoler avec Phase 2.

### 1.1 Setup minimal sur dev-server

```bash
ssh dev-pub
sudo mkdir -p /opt/twenty-v22-test
cd /opt/twenty-v22-test

# Generer secrets dedies (jamais utiliser ceux de prod)
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" | sudo tee .env
echo "TWENTY_APP_SECRET=$(openssl rand -hex 32)" | sudo tee -a .env
echo "OPENAI_API_KEY=$(grep '^OPENROUTER_API_KEY=' /home/brunon5/credentials/.all-creds.env | cut -d= -f2)" | sudo tee -a .env
# Note: passer ta clé OpenRouter manuellement si dev-server n'a pas accès aux creds
sudo chmod 600 .env
```

### 1.2 docker-compose.yml standalone

Copier le contenu de [`docs/twenty-v22-standalone-compose.yml`](./twenty-v22-standalone-compose.yml)
dans `/opt/twenty-v22-test/docker-compose.yml`.

```bash
sudo curl -o /opt/twenty-v22-test/docker-compose.yml \
  https://raw.githubusercontent.com/Christ-Roy/veridian-platform/main/docs/twenty-v22-standalone-compose.yml
# OU scp depuis local :
scp docs/twenty-v22-standalone-compose.yml dev-pub:/tmp/ && \
  ssh dev-pub "sudo mv /tmp/twenty-v22-standalone-compose.yml /opt/twenty-v22-test/docker-compose.yml"
```

### 1.3 Premier boot fresh (DB vide)

```bash
ssh dev-pub
cd /opt/twenty-v22-test
sudo docker compose up -d
sudo docker compose logs -f twenty-server | grep -iE 'started|error|Successfully' | head -30
```

Attendre `Nest application successfully started` + `Successfully registered all background sync jobs!`.

### 1.4 Test UI fresh

Le port 3000 est expose sur dev-server. Tu peux y acceder via Tailscale :

```bash
# Depuis local
curl http://100.92.215.42:3000/healthz   # Tailscale IP de dev-server
# Ou ouvrir un tunnel SSH :
ssh -L 3000:localhost:3000 dev-pub
# Puis dans le browser : http://localhost:3000
```

**Resultat attendu** : ecran "Continuer avec le courriel" + sidebar People/Companies/Opportunities/Tasks/Notes.

### 1.5 Restaurer le dump de prod

```bash
# Sur la prod, dump frais
ssh prod-pub "docker exec compose-parse-optical-array-lvh5md-twenty-postgres-1 pg_dump -U twenty -d twenty --clean --if-exists --no-owner --no-acl > /tmp/twenty-prod-dump.sql; ls -lh /tmp/twenty-prod-dump.sql"

# Copier vers dev-server
scp prod-pub:/tmp/twenty-prod-dump.sql /tmp/
scp /tmp/twenty-prod-dump.sql dev-pub:/tmp/

# Sur dev-server, stop server (pas postgres/redis), wipe DB, restore
ssh dev-pub
cd /opt/twenty-v22-test
sudo docker compose stop twenty-server twenty-worker

sudo docker compose exec twenty-postgres psql -U twenty -d postgres -c "DROP DATABASE IF EXISTS twenty WITH (FORCE); CREATE DATABASE twenty;"
sudo docker compose exec -T twenty-postgres psql -U twenty -d twenty < /tmp/twenty-prod-dump.sql

# Verifier
sudo docker compose exec twenty-postgres psql -U twenty -d twenty -t -c "SELECT COUNT(*) FROM core.workspace;"
# Doit afficher 19
```

### 1.6 Copier le storage volume de prod (optionnel)

Si tu veux les avatars/uploads de prod :

```bash
# Dump storage prod en tarball
ssh prod-pub "docker run --rm -v infra_twenty-storage:/data -v /tmp:/backup alpine tar czf /backup/twenty-storage.tar.gz -C /data ."
scp prod-pub:/tmp/twenty-storage.tar.gz /tmp/
scp /tmp/twenty-storage.tar.gz dev-pub:/tmp/

# Restore sur dev-server
ssh dev-pub
sudo docker run --rm -v twenty-v22-test_twenty-storage:/data -v /tmp:/backup alpine tar xzf /backup/twenty-storage.tar.gz -C /data
```

### 1.7 Lancer les migrations critiques

```bash
ssh dev-pub
cd /opt/twenty-v22-test

# Restart server (qui va detecter DB v1.16.7)
sudo docker compose start twenty-server
sudo sleep 30  # attendre boot

# 1. Forcer les migrations TypeORM + instance commands (84 + 30+)
sudo docker compose exec -w /app/packages/twenty-server twenty-server \
  node dist/command/command run-instance-commands --force --include-slow

# 2. Fix RICH_TEXT_V2 (38 fields, breaking change non documente)
sudo docker compose exec twenty-postgres psql -U twenty -d twenty -c \
  "UPDATE core.\"fieldMetadata\" SET type='RICH_TEXT' WHERE type='RICH_TEXT_V2';"

# 3. Upgrade workspace (ID a recuperer dans la DB)
WORKSPACE_ID=$(sudo docker compose exec twenty-postgres psql -U twenty -d twenty -t -c \
  "SELECT id FROM core.workspace WHERE subdomain='veridian';" | tr -d ' ')
echo "Workspace: $WORKSPACE_ID"

sudo docker compose exec -w /app/packages/twenty-server twenty-server \
  node dist/command/command upgrade --workspace-id "$WORKSPACE_ID"

# 4. Flush cache + restart
sudo docker compose exec twenty-redis redis-cli FLUSHALL
sudo docker compose restart twenty-server twenty-worker
```

### 1.8 Test final UI sur DB clonee

```bash
# Tunnel
ssh -L 3000:localhost:3000 dev-pub
# Browser : http://localhost:3000
# Login avec robert.brunon@veridian.site + password prod
```

**Si UI marche → Phase 1 PASS**, on a la preuve que la migration est saine et que le bug
de la session du 2026-05-08 venait de l'infra (CrowdSec saturation + reseau Traefik).

**Si UI ne marche pas → Phase 2** ci-dessous.

## Phase 2 — Isoler le bug Apollo

### 2.1 Comparer schema GraphQL fresh vs cloned-then-migrated

```bash
# Sur le standalone, dumper le schema GraphQL public
sudo docker compose exec -w /app/packages/twenty-server twenty-server \
  curl -s -X POST http://localhost:3000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { types { name kind enumValues { name } } } }"}' \
  > /tmp/schema-cloned.json

# Refaire un fresh install ailleurs (DB vide)
# Et dumper son schema -> /tmp/schema-fresh.json

# Diff
diff <(jq -S . /tmp/schema-cloned.json) <(jq -S . /tmp/schema-fresh.json) | head -50
```

Chercher des **enum values residuelles** (comme RICH_TEXT_V2 ailleurs) qui apparaissent dans
le schema cloned mais pas fresh. C'est probablement la cause.

### 2.2 Test paliers (si Phase 2.1 ne donne rien)

Migrer DB v1.16.7 par etapes successives avec changement d'image entre chaque :

```
v1.16.7 (depart, dump prod)
  ↓ image v1.21.x — run migrations, verifier UI
v1.21.x
  ↓ image v1.22.x
v1.22.x
  ↓ image v1.23.x
v1.23.x
  ↓ image v2.0.x
v2.0.x
  ↓ image v2.1.x
v2.1.x
  ↓ image v2.2.0
v2.2.0
```

A chaque step, tester l'UI dans le browser. Quand ca casse, on sait quelle migration introduit
le bug. ~2h de boulot.

Versions disponibles : `docker pull twentycrm/twenty:v1.21` etc — verifier sur Docker Hub.

### 2.3 Issue GitHub Twenty

Si le bug est isolable et reproductible, ouvrir un issue sur https://github.com/twentyhq/twenty
avec :
- Steps to reproduce (commandes paste-ready)
- DB dump anonymise (juste le schema, pas les data)
- Logs server complets
- Reponses GraphQL fail vs OK

## Phase 3 — Integration progressive dans l'infra Veridian

> **Pre-requis** : Phase 1 ou Phase 2 est PASS, on sait que la migration est saine.

### 3.1 Pre-conditions infra (DETTE-001 + DETTE-002)

**OBLIGATOIRE avant de creer le compose Dokploy v2** :

1. Verifier que CrowdSec n'a pas accumule des ghost bouncers depuis la derniere session :
   ```bash
   ssh prod-pub "docker exec code-crowdsec-1 cscli bouncers list 2>&1 | grep -c '✔️'"
   # Doit etre <= 2. Si plus, faire le quick fix de DETTE-001.
   ```

2. Verifier qu'aucun container ne leak `172.17.0.1` :
   ```bash
   ssh prod-pub "docker logs --since 1m code-crowdsec-traefik-bouncer-1 2>&1 | grep '172.17.0.1' | wc -l"
   # Doit etre 0 ou tres bas.
   ```

3. Si DETTE-002 pas encore fixe : forcer le default network sur dokploy-network dans
   le compose v2 (cf section 3.3).

### 3.2 Creer le compose Dokploy v2-staging

```bash
KEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
ENV_ID="KmNwdMqLi9ye4xZ57WsnC"

# 1. Create empty compose
RESP=$(curl -s -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"json\":{\"name\":\"twenty-v22\",\"description\":\"Twenty v2.2.0 staging — clone prod pour migration\",\"environmentId\":\"$ENV_ID\",\"composeType\":\"docker-compose\"}}" \
  "https://dokploy.veridian.site/api/trpc/compose.create")
COMPOSE_ID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['json']['composeId'])")
APP_NAME=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['json']['appName'])")
echo "composeId=$COMPOSE_ID appName=$APP_NAME"
```

### 3.3 docker-compose v2 Dokploy avec reseau force

> Pieges decouverts en session du 2026-05-08 :
> - **NE PAS** utiliser `<sub>.app.veridian.site` (3 niveaux) → wildcard cert ne couvre que 1 niveau
> - **PRESERVE** `default: { name: dokploy-network, external: true }` pour eviter le leak 172.17.0.1
> - **DESACTIVER** `DEFAULT_SUBDOMAIN: ''` pour eviter le redirect vers `app.<host>`
> - **UTILISER** un fichier Traefik file dynamic separe (comme prod fait) pour gerer le HostRegexp + wildcard cert

Voir [`docs/twenty-v22-dokploy-compose.yml`](./twenty-v22-dokploy-compose.yml) — a creer.

### 3.4 DNS Cloudflare

```bash
# Choisir un domaine PLAT (1 niveau, pas multi-level)
DOMAIN="twenty22.veridian.site"  # PAS twenty-v2.app.veridian.site

# DNS principal
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/00dcfea11d890f3337f9f883fe930dd5/dns_records" \
  -H "Authorization: Bearer $(grep '^CF_API_TOKEN=' ~/credentials/.all-creds.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"A\",\"name\":\"$DOMAIN\",\"content\":\"51.210.7.44\",\"ttl\":120,\"proxied\":false}"

# DNS workspace (sub-domain plat OK car 2 niveaux total)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/00dcfea11d890f3337f9f883fe930dd5/dns_records" \
  -H "Authorization: Bearer $(grep '^CF_API_TOKEN=' ~/credentials/.all-creds.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"A\",\"name\":\"veridian.$DOMAIN\",\"content\":\"51.210.7.44\",\"ttl\":120,\"proxied\":false}"
```

### 3.5 Fichier Traefik dynamic

Creer `/etc/dokploy/traefik/dynamic/twenty22-staging.yml` (template existant dans
`docs/twenty-v22-traefik.yml`) avec wildcard cert `*.twenty22.veridian.site`.

### 3.6 Test browser

Aller sur `https://veridian.twenty22.veridian.site` directement (pas le main),
verifier UI marche apres restore DB + migrations.

## Phase 4 — Swap prod en blue/green

> **Pre-requis** : Phase 3 PASS, validation user complete.

Suivre le workflow officiel `docs/workflow-migration-prod.md` — 10 phases gravees :

1. **Backups frais OBLIGATOIRES** : `pg_dump` Twenty prod + snapshot volume `infra_twenty-storage`
2. **Compose green** : v2.2.0 deja deploye et valide en Phase 3
3. **Schema additif** : pas applicable ici (Twenty fait ses propres migrations)
4. **Migration data** : restaurer le dump fresh sur green + lancer commandes migration
5. **Recuperer la BONNE clé API Dokploy** : `DOKPLOY_API_KEY` (cf credentials)
6. **Nouveau compose** : c'est le `twenty-v22` cree en Phase 3
7. **Test sur sous-domaine GREEN** : `veridian.twenty22.veridian.site` valide
8. **Bascule labels Traefik** : modifier `/etc/dokploy/traefik/dynamic/twenty-wildcard.yml`
   pour pointer service `compose-<v22>-twenty-server-1` au lieu de prod actuelle
9. **Surveillance 24h** : logs server, errors users, latency
10. **Rollback ready** : garder le compose blue (v1.16.7) intact pendant 7 jours, puis
    seulement supprimer

## Pieges identifies (NE PAS REFAIRE)

### ❌ Erreurs commises 2026-05-08

1. **Suppression du parent bouncer CrowdSec sans coordination** :
   `cscli bouncers delete traefik-bouncer` revoke la cle ET fait que le bouncer Traefik
   actif renvoie 403 par default sur TOUTES les requetes prod le temps qu'on update sa cle.
   → **30 secondes de prod down**.
   **Fix** : toujours generer la nouvelle cle d'abord, update env, recreate, et SEULEMENT
   APRES delete les ghost bouncers.

2. **Bricolage CrowdSec en debug avec captcha sur l'IP de Robert** :
   `cscli decisions add --ip 78.112.59.120 --type captcha --duration 0s` a cree une decision
   permanente qui a fait que Twenty fail le `Failed to fetch` pendant des heures.
   → Ne JAMAIS toucher CrowdSec en debug pour exclure une IP. Si vraiment besoin, utiliser
   le fichier `whitelists.yaml` parser, pas une decision.

3. **Volumes nommes avec prefix Docker** :
   Quand on cree un compose Dokploy via API, les volumes prennent le prefix `<appName>_`.
   Pour copier d'un volume a l'autre :
   ```bash
   # WRONG : ne marche pas
   docker run --rm -v infra_twenty-storage:/from -v twenty-fresh-storage:/to alpine cp -a /from/. /to/

   # RIGHT : utiliser le nom complet docker
   docker run --rm -v infra_twenty-storage:/from -v compose-<appName>_<volname>:/to alpine cp -a /from/. /to/
   ```

4. **Cert wildcard limite a 1 niveau** :
   `*.twenty-v2.app.veridian.site` ne couvre PAS `app.twenty-v2.app.veridian.site`.
   → **Toujours utiliser un domaine plat** (`twenty22.veridian.site`) ou bien gerer
   plusieurs wildcards explicites.

### ⚠️ Decouvertes utiles

1. **`run-instance-commands` sans `--force`** verifie d'abord la table `core.upgradeMigration`,
   qui n'existe pas en v1.16.7. → toujours ajouter `--force` pour le premier run sur DB clonee.

2. **`OPENAI_API_KEY` accepte une clé OpenRouter** (`sk-or-v1-...`) si on configure
   `AI_CATALOG_STORAGE_PATH=ai-catalog.json` avec le `baseURL: https://openrouter.ai/api/v1`.
   Twenty v2.2 plante en `INTERNAL_SERVER_ERROR: No AI models are available` sans ca.

3. **`IS_MULTIWORKSPACE_ENABLED=true`** est critique en v2.2 : sans ca, le multi-tenant
   redirige vers un workspace par defaut au lieu de montrer la liste.

4. **Twenty redirige `/welcome` vers `<DEFAULT_SUBDOMAIN>.<host>`** par default (`app.<host>`).
   → soit ajouter le DNS pour ce sub, soit passer `DEFAULT_SUBDOMAIN: ''` en env.

## Cle creds + IDs critiques pour la prochaine session

```bash
# Tout dans ~/credentials/.all-creds.env (sync Syncthing)
DOKPLOY_API_KEY     # commence par 'claudenav...'  (rotated 2026-05-08)
CF_API_TOKEN        # commence par '4yRVgp...'
OPENROUTER_API_KEY  # commence par 'sk-or-v1-...'
TWENTY_APP_SECRET   # = celui de prod (à reutiliser pour que les sessions de robert.brunon@ marchent sur la migration)
POSTGRES_PASSWORD   # = celui de prod
```

## Checklist demarrage rapide

- [ ] Lire ce runbook en entier
- [ ] Lire DETTE-001 et DETTE-002
- [ ] Verifier que CrowdSec va bien (bouncers <= 2, CPU < 5%)
- [ ] Verifier qu'aucun staging Twenty n'existe deja (sinon tear down)
- [ ] Demander confirmation a Robert avant de demarrer Phase 1
- [ ] Phase 1 sur dev-server (jamais prod jusqu'a Phase 4)
