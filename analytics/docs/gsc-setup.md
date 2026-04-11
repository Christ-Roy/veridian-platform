# Google Search Console — setup (POC, option a)

Stratégie POC : **un seul** refresh_token Google (celui de Robert, owner
sur toutes les propriétés GSC des clients) stocké en env.

## Pourquoi cette approche

Tant que c'est Robert qui gère les GSC des clients (en étant ajouté comme
owner/user sur leur propriété GSC depuis son compte Google), un seul
refresh_token suffit. Tous les sites tirent avec.

Quand un client voudra connecter **son propre** Google, on passera à un
refresh_token par tenant stocké chiffré en DB, avec un flow OAuth accessible
depuis l'app (chantier plus tard).

## Étapes (à faire une fois)

### 1. Créer l'OAuth client dans Google Cloud Console

1. Ouvre https://console.cloud.google.com/ (projet `veridian-preprod`)
2. **APIs & Services > Library** → recherche "Google Search Console API" →
   **Enable**
3. **APIs & Services > Credentials** → **Create Credentials** → **OAuth client ID**
4. Si c'est ta première fois : tu devras configurer l'OAuth consent screen
   - User type : **External** (tu es en test)
   - App name : `Veridian Analytics`
   - Support email : ton email
   - Developer contact : ton email
   - Scopes : tu peux laisser vide, on le demande au login
   - Test users : ajoute ton email Google
5. Application type : **Desktop app**
6. Name : `Veridian Analytics GSC`
7. **Create** → download le JSON

### 2. Lancer le bootstrap script

Depuis ton laptop (pas depuis dev-server, il faut un browser) :

```bash
cd ~/Bureau/veridian-platform/analytics

export GSC_CLIENT_ID="<client_id>.apps.googleusercontent.com"
export GSC_CLIENT_SECRET="<secret>"

node scripts/gsc-oauth-bootstrap.mjs
```

Le script :

- ouvre une URL Google dans ton browser
- tu valides avec ton compte Google
- Google redirige vers `http://127.0.0.1:8765/callback`
- le script récupère le `refresh_token` et l'affiche

### 3. Installer sur dev-server

```bash
# SSH dev-pub, ajouter les 3 vars au .env analytics :
ssh dev-pub
cd ~/analytics-src
cat >> .env <<EOF
GSC_CLIENT_ID=<le client id>
GSC_CLIENT_SECRET=<le secret>
GSC_REFRESH_TOKEN=<le refresh_token>
EOF
systemctl --user restart analytics-dev.service
```

### 4. Attacher une propriété à un site et tirer les data

```bash
# Attacher sc-domain:veridian.site au site veridian dans analytics
curl -X PUT "http://100.92.215.42:3100/api/admin/sites/$V_SITE/gsc" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"propertyUrl":"sc-domain:veridian.site"}'

# Sync les 7 derniers jours
curl -X POST "http://100.92.215.42:3100/api/admin/gsc/sync" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days":7}'
```

Si tout marche, tu verras les lignes dans la page
`http://100.92.215.42:3100/dashboard/gsc`.

## Erreurs courantes

**`[403] The user does not have sufficient permission for site ...`**

Le compte Google qui a généré le refresh_token n'est pas owner/user de la
propriété GSC. Va dans https://search.google.com/search-console/users →
ajoute ton email Google avec role "Owner" ou "Full".

**`[403] Google Search Console API has not been used in project ... before`**

L'API n'est pas activée. Va dans GCP Console → APIs & Services → Library →
activate "Google Search Console API".

**`[400] invalid_grant`**

Le refresh_token a été révoqué (tu as enlevé l'autorisation dans ton compte
Google, ou il est trop vieux sans usage). Relance `gsc-oauth-bootstrap.mjs`.
