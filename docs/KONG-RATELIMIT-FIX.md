# Kong Rate-Limit — Diagnostic et Fix

> P0.0 dans TODO-LIVE.md — faille critique identifiée le 6 avril 2026

## Le problème

Kong rate-limite par **consumer** (anon/service_role) au lieu de par **IP client**.

Config actuelle dans `infra/volumes/supabase/api/kong.yml` :
```yaml
- name: rate-limiting
  config:
    minute: 20
    hour: 100
    policy: local
```

Pas de `limit_by` → default = consumer. Toutes les requêtes de tous les
users passent par le consumer `anon` et partagent le même bucket de
20 req/min.

**Conséquence** : si un user abuse, il bloque TOUS les autres users.
La prod entière rate-limited à cause d'un seul client.

## Le fix

Ajouter `limit_by: header` et `header_name: X-Real-IP` :

```yaml
- name: rate-limiting
  config:
    minute: 100
    hour: 1000
    policy: local
    limit_by: header
    header_name: X-Real-IP
```

**Prérequis** : Traefik doit injecter `X-Real-IP` avec l'IP du client.
Vérifier que `KONG_REAL_IP_HEADER: "X-Forwarded-For"` et
`KONG_REAL_IP_RECURSIVE: "on"` sont bien set dans docker-compose.yml
(c'est le cas actuellement).

## Plan d'implémentation

1. Modifier `infra/volumes/supabase/api/kong.yml` (toutes les sections rate-limiting)
2. Modifier aussi `infra/volumes/api/kong.yml` si c'est un duplicata
3. Tester en staging : vérifier que 2 IPs différentes ont des quotas indépendants
4. Test core : ajouter un spec `rate-limit-isolation.spec.ts` dans e2e/core/
5. Appliquer en prod (accord Robert)
6. Augmenter les limites : 20 req/min/consumer → 100 req/min/IP (les users légitimes ont besoin de plus)

## Fichiers impactés

- `infra/volumes/supabase/api/kong.yml` — config principale
- `infra/volumes/api/kong.yml` — possiblement un duplicata
- `infra/docker-compose.yml` — vérifier KONG_REAL_IP_HEADER
- `infra/docker-compose.staging.yml` — même fix
