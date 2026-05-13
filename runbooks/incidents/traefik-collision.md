# Incident — Traefik router collision (dual-host)

> Basé sur incidents :
> - **2026-05-09** : premier dual-router hub Auth.js → 50% des requêtes en 500
> - **2026-05-11** : récidive 6h+ (stack Dokploy `xfd9mu` zombie pas supprimée)
> - Skill prompt : `~/Bureau/cc-saas/prompts/applicatif/06-blue-green-procedure.md`

## Symptômes

- Une fraction des requêtes (souvent ~50%) retourne 500 / 502
- Le pattern est **non-déterministe** : retry → ça marche, retry → ça casse
- `obs check apps` → error rate spike sur 1 app spécifique
- Les e2e tests sont flaky (passent localement, fail en CI)

## Cause typique

Dokploy a 2 stacks qui revendiquent le même `Host(app.veridian.site)` :
- Une stack "actuelle" (le bon container Auth.js / nouveau code)
- Une stack "legacy" pas supprimée (ancien container)

Traefik route en **round-robin** entre les 2 → ~50% tombent sur l'ancien.

## Triage en < 2 min

```bash
# Combien de routers prod ont ce Host ?
infra/scripts/check-traefik-unique-host.sh app.veridian.site
# Attendu : OK 1 host
# Si > 1 host : collision détectée
```

### Diagnostic détaillé

```bash
ssh prod-pub "docker ps --format '{{.Names}}\t{{.Labels}}' | grep -i 'app.veridian.site' | head -10"
# Si plus d'1 ligne avec un label `Host(app.veridian.site)` → collision

# Voir les container IPs côté Traefik :
ssh prod-pub "docker logs --tail 100 dokploy-traefik 2>&1 | grep -E 'ServiceURL|/pricing'" | tail -10
```

## Fix

### Étape 1 — Identifier le bon container et le zombie

```bash
# Le bon = le plus récent + image avec nouveau code
ssh prod-pub "docker ps --format '{{.Names}}\t{{.Image}}\t{{.CreatedAt}}' | grep <app>"
```

Le zombie a typiquement :
- `compose-XXX-web-dashboard-1` (vieux naming legacy)
- Image `:latest` ou tag ancien (pas `:authjs-staging` etc.)

### Étape 2 — Snapshot forensique AVANT cleanup

```bash
ZOMBIE=compose-parse-digital-bandwidth-xfd9mu-web-dashboard-1
mkdir -p /home/ubuntu/forensics/$(date +%Y%m%d)-traefik-collision
ssh prod-pub "docker inspect $ZOMBIE > /home/ubuntu/forensics/*/inspect.json"
ssh prod-pub "docker logs --tail 500 $ZOMBIE > /home/ubuntu/forensics/*/logs.txt"
```

### Étape 3 — Supprimer la stack zombie via Dokploy API

```bash
# Trouver le composeId
gh api /repos/Christ-Roy/dokploy-api/contents/...  # ou Dokploy UI

# Supprimer
curl -X POST https://dokploy.veridian.site/api/trpc/compose.delete \
  -H "Authorization: $DOKPLOY_TOKEN" \
  -d '{"composeId":"<id>","deleteVolumes":true}'
```

⚠ **Vérifier `deleteVolumes`** :
- `true` si volume = data jetable
- `false` si volume = data précieuse (DB), sinon **PERTE DE DATA**

### Étape 4 — Verify

```bash
# Plus qu'un router prod ?
infra/scripts/check-traefik-unique-host.sh app.veridian.site
# Attendu : OK 1 host

# 10 curl successifs → tous 200 ?
for i in $(seq 1 10); do
  curl -sf -o /dev/null -w "%{http_code} " https://app.veridian.site/pricing
done
# Attendu : 200 200 200 200 200 200 200 200 200 200
```

## Anti-récidive (déjà en place)

1. **`infra/scripts/check-traefik-unique-host.sh`** : à lancer après chaque deploy
2. **Test e2e** `regression.spec.ts:170 Pricing page loads` : flaky tests détectent
3. **DNS wildcard `*.green.app.veridian.site` + cert** : pour blue/green tests
   sur sous-domaine au lieu de prendre le Host prod
4. **Prompt `06-blue-green-procedure.md` v3** : procédure unique blue/green
   avec rollback documenté

## Liens

- TODO infra P0.0 (résolu 2026-05-11)
- `runbooks/audits/2026-05-11-clean-by-design.md`
- `~/Bureau/cc-saas/prompts/applicatif/06-blue-green-procedure.md`
- Mémoire `project_hub_dual_router_recidive_2026-05-11.md`
