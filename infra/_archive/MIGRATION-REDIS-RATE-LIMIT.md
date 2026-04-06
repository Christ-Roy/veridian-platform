# Migration Rate Limiting Kong: Local → Redis

**Date**: 2026-01-30
**Statut**: ✅ Implémenté
**Version**: 1.0.0

## 📋 Contexte

### Problème Identifié

L'application subissait des blocages rate limit qui affectaient **tous les utilisateurs** au lieu de cibler uniquement les IPs abusives.

**Cause racine**: Kong utilisait `policy: local` pour le rate limiting, ce qui signifie:
- Chaque instance Kong maintient son propre compteur en mémoire
- Les compteurs ne sont **pas partagés** entre instances
- Un utilisateur abusif bloque toute son IP (NAT, proxy corporate, etc.)
- Les utilisateurs légitimes derrière la même IP sont aussi bloqués

**Erreur visible**:
```
https://app.veridian.site/signin/signup?error=Sign+up+failed.&error_description=API+rate+limit+exceeded
```

### Solution Implémentée

Migration vers `policy: redis` pour un rate limiting **distribué et partagé**:
- ✅ Compteurs centralisés dans Redis (`twenty-redis:6379`)
- ✅ Cohérence entre toutes les instances Kong
- ✅ Rate limiting par IP précis et équitable
- ✅ Isolation via Redis DB 2 (Twenty utilise DB 0 et 1)

---

## 🔧 Changements Appliqués

### 1. Configuration Kong (`volumes/supabase/api/kong.yml`)

**Avant** (4 occurrences):
```yaml
- name: rate-limiting
  config:
    minute: 20
    hour: 100
    policy: local  # ❌ Compteur local non partagé
```

**Après**:
```yaml
- name: rate-limiting
  config:
    minute: 100        # Routes ouvertes
    hour: 1000
    policy: redis      # ✅ Compteur partagé
    redis_host: twenty-redis
    redis_port: 6379
    redis_database: 2  # DB séparée
```

**Routes concernées**:
- `/auth/v1/verify` (ligne ~47-52)
- `/auth/v1/callback` (ligne ~61-66)
- `/auth/v1/authorize` (ligne ~75-80)
- `/auth/v1/*` routes sécurisées (ligne ~101-106) → 200 req/min, 5000 req/h

### 2. Docker Compose (`docker-compose.yml`)

**Ajout de la dépendance Redis pour Kong**:
```yaml
kong:
  container_name: supabase-kong
  depends_on:
    twenty-redis:
      condition: service_healthy  # ✅ Kong attend Redis
```

### 3. Script de Test (`test-rate-limit.sh`)

Script pour valider le bon fonctionnement:
```bash
./test-rate-limit.sh https://api.veridian.site/auth/v1/health 150
```

**Le script vérifie**:
- ✅ Envoi de N requêtes vers Kong
- ✅ Comptage des 200 vs 429
- ✅ Présence des clés Redis (`ratelimit:*`)
- ✅ Affichage des compteurs et TTL

---

## 🚀 Déploiement

### Prérequis

- [x] Redis `twenty-redis` opérationnel (déjà en place)
- [x] Accès SSH au serveur OVH
- [x] Git configuré sur le serveur

### Étapes de Déploiement

#### 1. Backup de la configuration actuelle

```bash
ssh ovh
cd ~/twenty-saas/00-Global-saas/infra
cp volumes/supabase/api/kong.yml volumes/supabase/api/kong.yml.backup-$(date +%Y%m%d)
```

#### 2. Pull des changements

```bash
cd ~/twenty-saas/00-Global-saas/infra
git pull origin dev
```

#### 3. Vérifier les changements

```bash
# Vérifier que policy: redis est bien présent
grep -n "policy: redis" volumes/supabase/api/kong.yml

# Devrait afficher 4 occurrences avec redis_host et redis_port
```

#### 4. Redémarrer Kong (sans downtime si possible)

**Option A: Restart simple** (5-10s de downtime):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart kong
```

**Option B: Zero downtime** (si scaling horizontal):
```bash
# 1. Scale Kong à 2 instances
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale kong=2

# 2. Attendre 10s (nouvelles instances avec Redis)
sleep 10

# 3. Scale back à 1 instance (la nouvelle avec Redis)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale kong=1
```

#### 5. Vérifier les logs Kong

```bash
docker logs supabase-kong --tail 50 --follow
```

**Logs attendus** (pas d'erreurs Redis):
```
[rate-limiting] connected to Redis at twenty-redis:6379
```

**Erreurs possibles**:
```
[error] failed to connect to Redis: connection refused
→ Vérifier que twenty-redis est UP
```

#### 6. Tester le rate limiting

```bash
cd ~/twenty-saas/00-Global-saas/infra
./test-rate-limit.sh https://api.veridian.site/auth/v1/health 150
```

**Résultat attendu**:
```
✅ Succès (200/204):       100 / 150
❌ Rate Limited (429):     50 / 150
⚠️  Erreurs (autres):      0 / 150

✅ Clés de rate limiting trouvées dans Redis (DB 2)
```

#### 7. Monitorer Redis

```bash
# Vérifier les clés de rate limiting
docker exec twenty-redis redis-cli -n 2 KEYS "ratelimit:*"

# Exemple de sortie:
# ratelimit:auth-v1-open:1.2.3.4:minute
# ratelimit:auth-v1-open:1.2.3.4:hour

# Afficher une valeur
docker exec twenty-redis redis-cli -n 2 GET "ratelimit:auth-v1-open:1.2.3.4:minute"
# Output: 25  (nombre de requêtes dans la fenêtre courante)

# TTL (time to live)
docker exec twenty-redis redis-cli -n 2 TTL "ratelimit:auth-v1-open:1.2.3.4:minute"
# Output: 42  (expire dans 42 secondes)
```

---

## 📊 Nouvelles Limites Rate Limiting

| Route | Limite/Min | Limite/Heure | Type | Policy |
|-------|------------|--------------|------|--------|
| `/auth/v1/verify` | 100 | 1000 | Ouvert | Redis |
| `/auth/v1/callback` | 100 | 1000 | Ouvert | Redis |
| `/auth/v1/authorize` | 100 | 1000 | Ouvert | Redis |
| `/auth/v1/*` (autres) | 200 | 5000 | Sécurisé (API key) | Redis |

**Comparaison avec avant**:
- Routes ouvertes: 20 → **100 req/min** (5x plus permissif)
- Routes sécurisées: 60 → **200 req/min** (3.3x plus permissif)

**Justification de l'augmentation**:
- Réduction des faux positifs (utilisateurs légitimes bloqués)
- Meilleure tolérance pour les NAT/proxys d'entreprise
- Compteurs Redis plus précis → peut se permettre des limites plus hautes
- Protection CrowdSec en amont pour les attaques massives

---

## 🧪 Tests de Validation

### Test 1: Rate Limiting Basique

```bash
# Tester 120 requêtes (limite: 100/min)
for i in {1..120}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.veridian.site/auth/v1/health
  sleep 0.5
done | sort | uniq -c
```

**Résultat attendu**:
```
100 200   # Premières 100 requêtes: OK
 20 429   # Suivantes 20 requêtes: Rate limited
```

### Test 2: Compteurs Redis Partagés

**Terminal 1** (première instance):
```bash
for i in {1..50}; do
  curl -s https://api.veridian.site/auth/v1/health > /dev/null
done
```

**Terminal 2** (vérifier Redis pendant l'exécution):
```bash
watch -n 1 'docker exec twenty-redis redis-cli -n 2 GET "ratelimit:auth-v1-open:YOUR_IP:minute"'
```

**Observation**: Le compteur Redis s'incrémente en temps réel ✅

### Test 3: Persistence après Restart Kong

```bash
# 1. Envoyer 50 requêtes
for i in {1..50}; do
  curl -s https://api.veridian.site/auth/v1/health > /dev/null
done

# 2. Vérifier le compteur
docker exec twenty-redis redis-cli -n 2 GET "ratelimit:auth-v1-open:YOUR_IP:minute"
# Output: 50

# 3. Redémarrer Kong
docker compose restart kong

# 4. Envoyer 60 nouvelles requêtes (total = 110 > limite 100)
for i in {1..60}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.veridian.site/auth/v1/health
done | grep 429 | wc -l
```

**Résultat attendu**: Au moins 10 requêtes avec code 429 (rate limited) ✅

---

## 🔍 Monitoring & Debugging

### Logs Kong

```bash
# Logs en temps réel
docker logs supabase-kong -f

# Filtrer les erreurs rate limiting
docker logs supabase-kong 2>&1 | grep -i "rate.*limit"
```

### Métriques Redis

```bash
# Statistiques Redis DB 2
docker exec twenty-redis redis-cli -n 2 INFO keyspace

# Exemple de sortie:
# db2:keys=42,expires=42,avg_ttl=35000
```

### Dashboard Redis (optionnel)

Connecter RedisInsight ou redis-commander:
```bash
docker run -d --name redis-commander \
  --network global-saas-network \
  -e REDIS_HOSTS=twenty:twenty-redis:6379:2 \
  -p 8082:8081 \
  ghcr.io/joeferner/redis-commander:latest
```

Accès: http://localhost:8082

---

## 🚨 Rollback (si problème)

### Rollback Rapide

```bash
cd ~/twenty-saas/00-Global-saas/infra

# 1. Restaurer le backup
cp volumes/supabase/api/kong.yml.backup-YYYYMMDD volumes/supabase/api/kong.yml

# 2. Redémarrer Kong
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart kong

# 3. Vérifier les logs
docker logs supabase-kong --tail 50
```

### Rollback Git

```bash
cd ~/twenty-saas/00-Global-saas/infra
git log --oneline -5  # Trouver le commit avant la migration
git checkout <commit-hash> -- volumes/supabase/api/kong.yml docker-compose.yml
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart kong
```

---

## 📈 Améliorations Futures

### Phase 1: Monitoring Avancé (Q1 2026)

- [ ] Prometheus exporter pour Kong rate limiting
- [ ] Grafana dashboard avec:
  - Requêtes rate limited par route
  - Top 10 IPs bloquées
  - Distribution des compteurs Redis

### Phase 2: Protection Anti-Abuse (Q2 2026)

- [ ] CAPTCHA après 3 tentatives échouées (Turnstile/reCAPTCHA)
- [ ] Email verification obligatoire avant activation compte
- [ ] Ban automatique via CrowdSec pour patterns d'attaque

### Phase 3: Rate Limiting Adaptatif (Q3 2026)

- [ ] Ajustement dynamique des limites selon la charge
- [ ] Whitelist pour IPs de confiance (CI/CD, monitoring)
- [ ] Rate limiting par user_id (en plus de IP)

---

## 📚 Références

### Documentation Kong

- [Rate Limiting Plugin](https://docs.konghq.com/hub/kong-inc/rate-limiting/)
- [Redis Policy Configuration](https://docs.konghq.com/hub/kong-inc/rate-limiting/#using-redis)

### Architecture Veridian

- `../ARCHITECTURE.md` - Architecture globale
- `../doc/workspace-cleanup.md` - Cleanup workspaces
- `volumes/supabase/api/kong.yml` - Configuration Kong

### Fichiers Modifiés

- `volumes/supabase/api/kong.yml` - 4 occurrences `policy: redis`
- `docker-compose.yml` - Ajout `depends_on: twenty-redis`
- `test-rate-limit.sh` - Script de test (nouveau)

---

## ✅ Checklist de Validation

Après déploiement, vérifier:

- [ ] Kong démarre sans erreur (`docker logs supabase-kong`)
- [ ] Redis DB 2 contient des clés `ratelimit:*`
- [ ] Test rate limiting: 100 req/min → 429 après limite
- [ ] Signup/signin fonctionne normalement
- [ ] Aucune régression sur les autres routes
- [ ] CrowdSec bouncer toujours actif (middleware Traefik)

---

**Auteur**: Claude Sonnet 4.5
**Review**: À valider en production
**Contact**: Équipe DevOps Veridian
