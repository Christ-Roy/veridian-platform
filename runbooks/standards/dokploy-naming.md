# Standard — Nommage des stacks et services Dokploy

> Permet aux agents applicatifs et infra d'identifier instantanément à quoi
> sert une stack sans lire son YAML.

## Convention

### Nom de la stack Dokploy (champ `name` dans Dokploy UI)

```
<app>-<env>
```

- `<app>` : hub, prospection, analytics, cms, notifuse, twenty, ...
- `<env>` : `prod` | `green` | `staging`

Exemples : `hub-prod`, `hub-green`, `prospection-prod`, `cms-staging`.

### Nom du service dans le `docker-compose.yml`

Identique au nom de stack, ou suffixé si la stack a plusieurs services :

```yaml
# stack "hub-prod" → service "hub-prod"
services:
  hub-prod:
    image: ghcr.io/christ-roy/veridian-dashboard:sha-XXX
```

```yaml
# stack "supabase-prod" → plusieurs services nommés explicitement
services:
  supabase-prod-db:
    image: supabase/postgres:15.14.1.067
  supabase-prod-auth:
    image: supabase/gotrue:v2.184.0
  supabase-prod-kong:
    image: kong:2.8.5
```

Le container final s'appellera `compose-xxx-yyy-hub-prod-1` au lieu de
l'illisible `compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1`.

### App name (slug interne Dokploy) — IMMUTABLE après création

Dokploy permet de saisir le `appName` **à la création** d'une stack (champ
visible dans le formulaire Add Compose, défaut `${slug-projet}-`). Une fois
créée, **`appName` n'est plus modifiable** :

- ❌ Pas d'endpoint UI (formulaire Update n'a que `name` + `description`)
- ❌ Pas d'API (le champ existe dans `compose.update` mais est ignoré côté
  Dokploy server)
- ❌ Override `command` (Advanced > Run Command avec `docker compose -p X`)
  **NE marche PAS** : le redeploy continue d'utiliser le slug par défaut.
  Testé en prod 2026-05-12, confirmé via code source `createCommand` dans
  `packages/server/src/utils/builders/compose.ts` — le champ `command` est
  stocké mais d'autres parties du deploy (env `APP_NAME`, networks, mounts)
  utilisent toujours `appName` directement.
- ❌ Issue Dokploy [#3671](https://github.com/Dokploy/dokploy/issues/3671)
  est OPEN — pas encore implémenté

**Conséquence** : le préfixe `compose-xxx-yyy-` est **gravé pour la vie de la
stack**. La seule façon d'avoir un nom propre type `linkedin-prod-<service>-1`
c'est de **recréer la stack** avec un `appName` propre dès la création.

**Workflow recommandé** :

À la prochaine bascule blue-green de chaque app, créer la stack `<app>-green`
avec un **`appName` saisi manuellement** :

```
# Dans le formulaire Add Compose de Dokploy :
Name        : hub-green
App Name    : hub-green                ← saisir manuellement, écraser le défaut
Description : ...
```

Le container final s'appellera `hub-green-<service>-1` (pas
`compose-random-slug-xyz-<service>-1`).

À la bascule, l'ancienne stack `hub-prod` (avec slug pourri) est supprimée,
la `hub-green` est renommée en `hub-prod` (via API `compose.update` champ
`name`). Au prochain blue-green, on recrée à nouveau avec nom propre, etc.

**Au fil des bascules naturelles, l'infra devient propre**, sans downtime
supplémentaire.

## Convention pour blue-green

Pendant une migration blue-green, **deux stacks coexistent temporairement** :

```
hub-prod   (la stack actuelle, sert app.veridian.site)
hub-green  (la nouvelle stack, sert hub.green.app.veridian.site)
```

Après bascule réussie :
1. Renommer (ou recréer) `hub-prod` → garbage et supprimer
2. Renommer (ou modifier) `hub-green` → `hub-prod` avec labels Traefik
   `Host(app.veridian.site)`
3. Une seule stack reste : `hub-prod` qui sert le Host prod

> ⚠️ Dokploy ne permet pas de "renommer" une stack via API. Pour réellement
> renommer, il faut **créer une nouvelle stack avec le bon nom** et supprimer
> l'ancienne. Pratiquer ça aux moments calmes (pas pendant une bascule).

## État actuel et plan de migration

Au 2026-05-11, les stacks prod ont des noms héritages :

| Stack actuelle | Nom cible | Quand |
|---|---|---|
| `dashboard` (supprimée) | — | Faite |
| `hub-authjs` | `hub-prod` | À la prochaine migration |
| `prospection-authjs` | `prospection-prod` | À la prochaine migration |
| `analytics` | `analytics-prod` | À la prochaine migration |
| `asset-bank` | `asset-bank-prod` | À la prochaine migration |
| `cms-prod` | déjà conforme | — |
| `notifuse` | `notifuse-prod` | À la prochaine migration |
| `twenty` | `twenty-prod` | À la prochaine migration |
| `supabase` | `supabase-prod` | À la prochaine migration |
| `verger-shop` | (client externe, garder) | — |
| `linkedin-dashboard` | `linkedin-prod` | À la prochaine migration |
| `crowdsec` | `crowdsec-prod` | À la prochaine migration |
| `internal-tools` | `internal-tools-prod` | À la prochaine migration |
| `prospection-fr` | (site client) | — |
| `veridian-core-db-staging` | `core-staging` | À la prochaine migration |

**Migration au fil de l'eau** : on renomme à la prochaine grosse modif de la
stack (migration majeure, refonte). Pas de big bang.

## Convention pour stacks éphémères (tests, sandbox)

```
sandbox-<sujet>-<date>
```

Exemple : `sandbox-prospection-authjs-2026-05-08`. Supprimée à la fin du test.

## Outils de vérification

```bash
# Lister les stacks Dokploy mal nommées (n'ont pas le suffixe -prod/-green/-staging)
DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
ssh prod-pub "curl -s -H 'x-api-key: $DKEY' http://localhost:3000/api/trpc/project.all" | \
  python3 -c "import json,sys; d=json.load(sys.stdin)['result']['data']['json']; [print(c['name']) for p in d for e in p['environments'] for c in e['compose'] if not c['name'].endswith(('-prod','-green','-staging','-clone'))]"
```
