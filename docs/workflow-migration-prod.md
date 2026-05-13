# Workflow Migration Prod — blue/green Dokploy

> **Document gravé dans le marbre 2026-05-07** suite à la migration réussie
> Supabase Auth → Auth.js v5 sur Prospection.
>
> **Audience** : agents Claude, Robert, dev humains. À appliquer à toute future
> migration Veridian impliquant un changement majeur de stack runtime sur une
> app prod (auth, schema DB, refacto majeur, swap d'orchestrateur).
>
> **Origine** : pattern conçu et validé sur la migration Prospection (11 vrais
> tenants beta, 19 users, 25 tenants Supabase migrés sans downtime, sans perte
> de data, mots de passe utilisateurs préservés tels quels).
>
> **Mémoire Claude** : `~/.claude/projects/-home-brunon5-Bureau-veridian-platform/memory/project_blue_green_pattern.md`

---

## Pourquoi ce workflow

Les migrations prod sans préparation, c'est :
- Downtime imprévisible
- Risque de perte de data (FK cassées, UUIDs perdus)
- Users qui doivent reset leur mot de passe (UX de merde)
- Rollback impossible sous 5 minutes
- Containers `docker run` standalone qui ne survivent pas au reboot

Le workflow blue/green **résout chaque point** :
- Zéro downtime (BLUE tourne pendant qu'on configure GREEN)
- DB partagée intacte, schema additif uniquement
- Hashes bcrypt Supabase compatibles `bcryptjs.compare` direct → mots de passe préservés
- Rollback en 5s : `docker start <legacy>` ou re-modif label Traefik
- Tout via Dokploy compose, survit aux reboots

---

## Les 10 phases

### Phase 0 — Backups frais OBLIGATOIRES

```bash
DATE=$(date +%Y%m%d-%H%M)

# Backup DB de l'app à migrer
ssh prod-pub "docker exec <db-container> pg_dump -U postgres -d <db> | gzip" \
  > ~/backups/<app>-prebascule-$DATE.sql.gz

# Backup DB source (Supabase auth + tenants)
ssh prod-pub "docker exec <supabase-db> pg_dump -U postgres -d postgres \
  -t auth.users -t public.tenants --no-owner --no-acl | gzip" \
  > ~/backups/supa-fresh-$DATE.sql.gz
```

Vérifier les tailles. **Ne JAMAIS skipper.**

---

### Phase 1 — Image GREEN buildée via CI

- Push branche feature → CI build l'image GHCR avec tag `:staging`
- **CI verte AVANT toucher la prod** : unit + build + integration au minimum
- Image disponible : `ghcr.io/christ-roy/<app>:staging`

---

### Phase 2 — Schema DB additif sur la DB prod

Créer manuellement les **nouvelles tables** en SQL pur (pas Prisma push qui peut tenter de retoucher des FK existantes et planter).

**Exemple** (tables Auth.js) :
```sql
CREATE TYPE public.tenant_status AS ENUM ('pending','active','suspended','deleted');
CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE, ...);
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id UUID REFERENCES users(id), ...);
CREATE TABLE IF NOT EXISTS sessions (...);
CREATE TABLE IF NOT EXISTS tenants (...);
```

**L'app BLUE n'utilise pas ces tables → AUCUN impact runtime sur prod.**

```bash
ssh prod-pub "docker cp /tmp/auth-tables.sql <db-container>:/tmp/
docker exec <db-container> psql -U postgres -d <db> -f /tmp/auth-tables.sql"
```

---

### Phase 3 — Migration data (SQL généré, pas script tsx)

**Pourquoi SQL plutôt que tsx** :
- Pas de dépendances Node à installer dans un container temporaire
- Idempotent natif via `ON CONFLICT DO NOTHING / DO UPDATE`
- Plus simple à debug si un row plante

Pattern : générer les INSERT depuis l'ancienne source via `quote_literal + concat`.

```sql
-- Génère les INSERTs pour copier auth.users → users
SELECT 'INSERT INTO users (id, email, name, email_verified, supabase_user_id, created_at, updated_at) VALUES (' ||
  quote_literal(id::text) || '::uuid, ' ||
  quote_literal(email) || ', ' ||
  COALESCE(quote_literal(raw_user_meta_data->>'full_name'), 'NULL') || ', ' ||
  COALESCE(quote_literal(email_confirmed_at::text) || '::timestamptz', 'NULL') || ', ' ||
  quote_literal(id::text) || '::uuid, ' ||
  quote_literal(created_at::text) || '::timestamptz, ' ||
  quote_literal(COALESCE(updated_at, created_at)::text) || '::timestamptz) ON CONFLICT (id) DO NOTHING;'
FROM auth.users
WHERE email NOT LIKE 'e2e-%@yopmail.com';
```

**À préserver absolument** :
- **UUIDs** : `User.id = auth.users.id` direct → toutes les FK existantes (`workspace_members.user_id` etc.) restent valides automatiquement
- **Hashes bcrypt Supabase** : copiés tels quels dans `Account.access_token` (provider=`credentials`)
  - Format `$2a$10$...` (60 chars) lu nativement par `bcryptjs.compare` Auth.js v5
  - **Aucune ré-authentification utilisateur nécessaire**

---

### Phase 4 — Récupérer les BONNES credentials Dokploy

⚠️ **Il y a 2 clés API Dokploy** dans `~/credentials/.all-creds.env` :

| Variable | Cible |
|---|---|
| `DOKPLOY_API_KEY` | Local KDE (ne marche PAS pour OVH prod) |
| `DOKPLOY_OVH_API_KEY` | **VPS OVH prod** (la BONNE pour migrer prod) |

```bash
source ~/credentials/.all-creds.env
KEY="$DOKPLOY_OVH_API_KEY"  # toujours celle-ci pour prod
```

L'API Dokploy n'est accessible **que depuis le VPS** (localhost:3000). Toutes les commandes API doivent passer par `ssh prod-pub`.

---

### Phase 5 — Créer un NOUVEAU compose Dokploy (parallèle, pas modifier l'existant)

**Règle d'or** : ne **JAMAIS** modifier le compose legacy. Toujours créer un nouveau compose. Permet rollback instantané en stoppant le nouveau et redémarrant l'ancien.

```bash
# 5a. Créer compose vide
ssh prod-pub "curl -s -X POST -H 'x-api-key: $KEY' -H 'Content-Type: application/json' \
  -d '{\"json\":{\"name\":\"<app>-authjs\",\"description\":\"...\",\"environmentId\":\"<env-id>\"}}' \
  http://localhost:3000/api/trpc/compose.create"

# Récupérer composeId dans la réponse
```

**Compose minimal** : seulement l'app, **PAS la DB** (la DB reste dans le compose legacy avec son volume intact, l'app GREEN s'y connecte via le hostname interne `dokploy-network`).

```yaml
services:
  <app>-authjs:
    image: ghcr.io/christ-roy/<app>:staging
    restart: unless-stopped
    networks:
      - dokploy-network
    environment:
      DATABASE_URL: postgresql://postgres:<pwd>@<legacy-db-service>:5432/<db>
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_TRUST_HOST: "true"
      NEXTAUTH_URL: https://<app>.app.veridian.site
      # ... autres env
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      # nom de service Traefik DIFFÉRENT du legacy
      - traefik.http.routers.<app>-authjs.rule=Host(`<app>-green.app.veridian.site`)
      - traefik.http.routers.<app>-authjs.entrypoints=websecure
      - traefik.http.routers.<app>-authjs.tls.certresolver=letsencrypt
      - traefik.http.services.<app>-authjs.loadbalancer.server.port=3000
networks:
  dokploy-network:
    external: true
```

```bash
# 5b. Update compose avec le YAML
ssh prod-pub "curl -s -X POST -H 'x-api-key: $KEY' -H 'Content-Type: application/json' \
  --data @/tmp/compose-payload.json \
  http://localhost:3000/api/trpc/compose.update"
```

---

### Phase 6 — DNS GREEN + tests sur sous-domaine dédié

```bash
source ~/credentials/.all-creds.env
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"<app>-green.app","content":"<IP-prod>","ttl":300,"proxied":false}'
```

Deploy compose GREEN, attendre que Traefik provisionne le cert :
```bash
ssh prod-pub "curl -s -X POST -H 'x-api-key: $KEY' -H 'Content-Type: application/json' \
  -d '{\"json\":{\"composeId\":\"<id>\"}}' \
  http://localhost:3000/api/trpc/compose.deploy"
```

**Tests obligatoires sur GREEN** :
- `/api/health` = 200
- `/api/status` = `auth=ok db=ok`
- Login d'un user réel avec son vrai mot de passe (`Mincraft5*55` pour Robert)
- E2E Playwright multi-tenant : pour CHAQUE tenant prod, vérifier login + 4-8 pages + counts data
- Logs container : 0 erreur

**Pas de bascule sans validation 100% verte sur GREEN.**

---

### Phase 7 — Bascule prod (modifier les labels Traefik du nouveau compose)

```bash
# 7a. Stop l'app legacy (sans rm — DB intacte, image taggée)
ssh prod-pub "docker stop <legacy-container>"

# 7b. Tag image legacy pour rollback
ssh prod-pub "docker tag ghcr.io/christ-roy/<app>:latest \
  ghcr.io/christ-roy/<app>:rollback-pre-<feature>-$(date +%Y%m%d)"

# 7c. Update compose GREEN : changer le label Host(...)
# de <app>-green.app.veridian.site → <app>.app.veridian.site
# (via API compose.update + champ composeFile modifié)

# 7d. Redeploy
ssh prod-pub "curl -s -X POST -H 'x-api-key: $KEY' ... compose.deploy"
```

Traefik bascule automatique en < 5 secondes.

---

### Phase 8 — Tests prod immédiats

```bash
curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://<app>.app.veridian.site/api/health
curl -sk https://<app>.app.veridian.site/api/status

# Login un user réel avec son vrai mdp Supabase
# Confirmation que la compat bcrypt fonctionne en prod
CSRF=$(curl -sk -c /tmp/jar.txt https://<app>.app.veridian.site/api/auth/csrf | jq -r .csrfToken)
curl -sk -b /tmp/jar.txt -c /tmp/jar.txt -X POST \
  --data-urlencode "email=<user>" --data-urlencode "password=<mdp-original>" \
  --data-urlencode "csrfToken=$CSRF" \
  https://<app>.app.veridian.site/api/auth/callback/credentials
```

---

### Phase 9 — Surveillance 24h

```bash
# Logs streaming
ssh prod-pub "docker logs <new-container> -f"

# Stats RAM/CPU
ssh prod-pub "docker stats --no-stream <new-container>"

# Comparer avant/après en RAM (gain typique observé : -70 à -80% sur Auth.js v5)
```

**Bouton rollback prêt** :
```bash
# Stop GREEN
ssh prod-pub "docker stop <new-container>"
# Restart BLUE legacy (volume + container intacts)
ssh prod-pub "docker start <legacy-container>"
# Update compose GREEN pour retirer le Host(...) ou le pointer ailleurs
```

---

### Phase 10 — Cleanup tardif (J+30 minimum)

Une fois stable :
- Supprimer le compose legacy via Dokploy UI (**garder l'image taggée**)
- Retirer les variables d'env legacy du nouveau compose (Supabase keys etc.)
- Cleanup les `@supabase/*` du `package.json` si Supabase dégagé
- Mise à jour de la TODO de l'app : phase de migration → "complétée"

---

## Pièges connus à éviter (appris à la dure)

### Hashes bcrypt
- `$2a$10$` = format Supabase historique
- `$2b$10$` = format bcryptjs actuel
- **Les deux sont lus par `bcryptjs.compare` v3** — pas besoin de re-hash
- Préserver le hash original tel quel dans `Account.access_token`

### `activeWorkspaceId` null
- Après login, le cookie `active_workspace_id` peut être absent
- `getUserContext()` prend automatiquement le 1er workspace par défaut
- Pas un bug

### Lien Admin invisible (race condition)
- `app-nav.tsx` (Client Component) fetch `/api/me` en `useEffect`
- Au 1er render, `isAdmin = false` → lien Admin pas affiché
- **Fix obligatoire** : passer `initialIsAdmin` depuis le `layout.tsx` (Server Component)
  qui appelle `getUserContext()` en SSR

### `UntrustedHost` Auth.js v5
- Derrière Traefik/Dokploy, Auth.js refuse les hosts non whitelistés
- Solution : `trustHost: true` dans `auth.config.ts` + env `AUTH_TRUST_HOST=true`
- Ceinture + bretelles obligatoires

### `useSearchParams()` Next 15
- Doit être wrappé dans `<Suspense>` sinon le build prerender plante
- Pattern : extraire le composant qui utilise `useSearchParams` dans un sous-component
  enveloppé de `<Suspense fallback={...}>`

### CI ENOSPC self-hosted runner
- Le dev-server peut saturer à 92% disk
- Avant un build CI : `docker system prune -af` + `docker buildx prune -af`
- Garder un eye sur `df -h /` régulièrement

### Tables auth additives = pas de FK violation
- Aucune FK existante (`workspace_members.user_id`, `invitations.invited_by`, etc.)
  ne pointe vers les nouvelles tables
- On insère les UUIDs identiques à l'ancienne source, les FK restent valides

### `docker run` standalone INTERDIT en prod fin de session
- Tout passer par Dokploy compose
- Si on bricole en `docker run` pour aller vite, **REMETTRE PROPRE en compose**
  avant la fin de la session
- Sinon le container ne survit pas à un reboot et n'apparaît pas dans Dokploy UI

### 2 clés API Dokploy
- `DOKPLOY_API_KEY` ≠ `DOKPLOY_OVH_API_KEY`
- Pour la prod, **toujours `DOKPLOY_OVH_API_KEY`**

### Helpers e2e à adapter post-migration
- Les helpers `loginAsE2EUser` Supabase ne marcheront PAS sur Auth.js
- La CI core va planter post-migration tant que les helpers ne sont pas migrés
- Noter en dette technique avant de merger sur main
- À adapter : `signIn("credentials", { email, password })` Auth.js

---

## Performance constatée (référence Prospection)

| Stack | RAM | CPU repos | Note |
|---|---|---|---|
| BLUE Supabase Auth + GoTrue | 645 MiB | 0.57% | Connexions Postgres par requête |
| GREEN Auth.js v5 + Prisma | 140 MiB | 0.00% | JWT stateless + Prisma pool |

**Gain typique : -70 à -80% RAM**.

---

## Outils référents

- API Dokploy tRPC : `~/.claude/skills/infra-dokploy/api-reference.md`
- Skill `infra-dokploy` : utiliser pour toute action Dokploy
- Compose containers : `/etc/dokploy/compose/<app-name>/code/`
- Logs Dokploy : `/etc/dokploy/logs/<appName>/`

---

## Prochain candidat à ce workflow

**Hub SaaS** (`hub/`, 164 fichiers Supabase) — quand on attaque la migration
Hub Supabase Auth → Auth.js v5, on suit ce workflow à la lettre.

Ensuite : cleanup complet Supabase de la stack (containers prod down).
