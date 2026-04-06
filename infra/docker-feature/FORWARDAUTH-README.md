# 🔒 ForwardAuth Security - Guide de Déploiement

## 📋 Vue d'ensemble

Ce guide explique comment déployer la plateforme avec l'authentification ForwardAuth qui sécurise l'accès à Twenty et Notifuse via Supabase Auth.

## 🎯 Objectif

**Problème résolu:** Actuellement, n'importe qui peut aller sur `twenty.app.veridian.site` ou `notifuse.app.veridian.site` et créer un compte directement, contournant le Dashboard.

**Solution:** Utiliser Traefik ForwardAuth pour vérifier l'authentification Supabase avant d'autoriser l'accès aux services.

## 🏗️ Architecture

```
User → Dashboard (Supabase Auth) → JWT Token
         ↓
User → twenty.app.veridian.site
         ↓
      Traefik (ForwardAuth)
         ↓
      GoTrue (vérifie JWT)
         ↓ (Valid?)
         ├─ OUI → Twenty CRM
         └─ NON → 401 Unauthorized
```

## 📦 Ce qui a été modifié

### 1. **Traefik** - Nouveau middleware ForwardAuth
```yaml
# Middleware global qui vérifie l'authentification
- "traefik.http.middlewares.supabase-auth.forwardauth.address=http://auth:9999/user"
- "traefik.http.middlewares.supabase-auth.forwardauth.authRequestHeaders=Authorization,Cookie"
```

### 2. **Twenty** - Protection activée
```yaml
# Bloquer les inscriptions directes
IS_EMAIL_VERIFICATION_REQUIRED: "true"

# Middleware ForwardAuth appliqué
- "traefik.http.routers.twenty.middlewares=supabase-auth@docker"
```

### 3. **Notifuse** - Protection activée
```yaml
# Middleware ForwardAuth appliqué
- "traefik.http.routers.notifuse.middlewares=supabase-auth@docker"
```

## 🚀 Déploiement

### Étape 1: Backup de la configuration actuelle

```bash
cd /home/ubuntu/twenty-saas/00-Global-saas/infra

# Backup du docker-compose actuel
cp docker-compose.yml docker-compose.yml.backup

# Optionnel: Exporter les données existantes
docker exec supabase-db pg_dump -U postgres postgres > backup-supabase-$(date +%Y%m%d).sql
docker exec twenty-postgres pg_dump -U twenty twenty > backup-twenty-$(date +%Y%m%d).sql
docker exec notifuse-postgres pg_dump -U postgres notifuse_system > backup-notifuse-$(date +%Y%m%d).sql
```

### Étape 2: Arrêter les services actuels

```bash
# Arrêter tous les services (SANS supprimer les volumes)
docker compose down

# Vérifier que les volumes sont toujours là
docker volume ls | grep -E 'supabase-db-data|twenty-db-data|notifuse-db-data'
```

### Étape 3: Démarrer avec la nouvelle config

```bash
# Lancer avec le nouveau docker-compose
docker compose -f docker-compose.custom-auth.yml up -d

# Voir les logs en temps réel
docker compose -f docker-compose.custom-auth.yml logs -f
```

### Étape 4: Vérifier que tout fonctionne

```bash
# Vérifier l'état des services
docker compose -f docker-compose.custom-auth.yml ps

# Tous les services doivent être "healthy"
# Attendre 2-3 minutes pour les healthchecks
```

## 🧪 Tests de Validation

### Test 1: Vérifier que l'accès direct est bloqué

```bash
# Essayer d'accéder à Twenty sans auth (doit retourner 401)
curl -I https://twenty.app.veridian.site

# Résultat attendu: HTTP/2 401 Unauthorized
```

### Test 2: Vérifier que l'accès avec JWT fonctionne

```bash
# 1. Se connecter au Dashboard et récupérer le JWT
# Ouvrir le navigateur: https://app.veridian.site
# F12 → Application → Cookies → Copier "sb-access-token"

# 2. Tester l'accès avec le token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://twenty.app.veridian.site

# Résultat attendu: HTTP/2 200 OK
```

### Test 3: Vérifier que GoTrue répond correctement

```bash
# Depuis le serveur (localhost)
docker exec -it supabase-auth wget -qO- http://localhost:9999/health

# Résultat attendu: {"status":"ok"}
```

### Test 4: Inscription directe bloquée sur Twenty

1. Aller sur `https://twenty.app.veridian.site/signup`
2. Essayer de créer un compte
3. **Résultat attendu:** Message "Email verification required" mais l'email n'arrivera jamais (EMAIL_DRIVER=logger)

## 🔧 Dépannage commentaire:

#
C'est une excellente idée sur le plan de la sécurité et de l'architecture "Zero Trust", mais sa mise en œuvre comporte des défis techniques spécifiques, notamment sur la gestion des sessions.
Voici une analyse détaillée pour t'aider à décider :
✅ Les points forts de cette approche
Sécurité Centralisée : Tu ne dépends plus de la robustesse (ou des failles) de chaque application (Twenty, Notifuse). C'est Traefik qui fait office de "videur" à l'entrée.
Contrôle du Flux : Tu forces les utilisateurs à passer par ton tunnel de vente/dashboard.
Économie de Ressources : Les requêtes non authentifiées sont bloquées par Traefik avant même d'atteindre les conteneurs Twenty ou Notifuse, économisant CPU et RAM.
Uniformité : Tu as un seul endroit pour gérer tes politiques d'accès (Supabase).
⚠️ Les points de vigilance (Le "Diable est dans les détails")
Avant de déployer, voici ce qui pourrait casser ton installation :
1. La gestion des Cookies (Le plus critique)
Pour que twenty.app.veridian.site reconnaisse le JWT créé sur app.veridian.site, tu dois configurer Supabase Auth pour utiliser des cookies sur le domaine parent.
Le cookie de session Supabase doit être configuré avec Domain=.veridian.site.
Si ce n'est pas fait, le navigateur n'enverra pas le cookie lors de l'appel à Twenty, et Traefik renverra systématiquement une erreur 401.
2. L'Expérience Utilisateur (UX)
Le middleware forwardauth de base renvoie une page blanche avec écrit Unauthorized (401).
Amélioration : Il est préférable d'utiliser un middleware qui redirige vers ta page de login si l'auth échoue.
Astuce : Regarde du côté de traefik-forward-auth (un conteneur dédié) ou configure une error-page sur Traefik qui intercepte le 401 pour rediriger vers app.veridian.site/login.
3. La "Double Authentification"
C'est le point le plus complexe avec Twenty :
Même si Traefik laisse passer l'utilisateur, Twenty a son propre système d'authentification interne.
Problème : L'utilisateur devra se loguer une fois sur ton Dashboard, puis une deuxième fois sur Twenty.
Solution idéale : Configurer Twenty pour utiliser Supabase comme fournisseur OIDC/SAML. Si tu te contentes de mettre ForwardAuth devant, tu ajoutes juste une couche de sécurité, mais pas de Single Sign-On (SSO) fluide.
4. Le Healthcheck de GoTrue
Ton guide pointe vers http://auth:9999/user.
Vérifie que le conteneur auth (GoTrue) est bien sur le même réseau Docker que Traefik.
Note que /user de GoTrue attend un header Authorization: Bearer <JWT>. Si Traefik transmet les cookies, GoTrue doit être configuré pour les lire.
🛠 Améliorations suggérées pour ton guide
Dans la config Traefik :
Ajoute la gestion du header pour éviter les boucles ou les problèmes de transmission :
code
Yaml
- "traefik.http.middlewares.supabase-auth.forwardauth.trustForwardHeader=true"
Pour bloquer réellement les inscriptions sur Twenty :
Au lieu de jouer avec IS_EMAIL_VERIFICATION_REQUIRED, Twenty possède souvent des variables d'environnement pour désactiver complètement le register public (selon les versions) :
code
Yaml
SIGNUP_DISABLED: "true" # Vérifie la version de Twenty pour le nom exact