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

### App name (slug interne Dokploy)

Dokploy génère automatiquement un slug aléatoire pour le préfixe de container
(`compose-parse-digital-bandwidth-xfd9mu`). **On accepte ce préfixe**, ce n'est
pas modifiable sans patcher Dokploy. Le suffixe (nom du service) est ce qui
compte.

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
