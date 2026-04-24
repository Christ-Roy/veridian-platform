# demo-cms

Site Next.js SSG branché sur Payload CMS multi-tenant (`cms.staging.veridian.site`).
Démo du pattern "site client vitrine" : contenu éditable dans Payload, build static Cloudflare Pages.

## Stack

- Next.js 15 avec `output: 'export'` (full static, zéro serveur)
- Fetch Payload REST API au build (SSG)
- Déploiement Cloudflare Pages

## Setup local

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:3301
npm run build          # génère out/
npx serve out          # vérifier le rendu static
```

## Variables d'environnement

| Variable | Exemple | Rôle |
|---|---|---|
| `CMS_API_URL` | `https://cms.staging.veridian.site` | URL de l'instance Payload |
| `CMS_TENANT_SLUG` | `demo` | Slug du tenant à fetcher |

## Déploiement Cloudflare Pages

### Manuel (première fois)

```bash
# Login CF si pas encore fait
npx wrangler login

# Créer le projet CF Pages (une seule fois)
npx wrangler pages project create demo-cms-veridian --production-branch=main

# Build + deploy
npm run deploy
```

### CI/CD (plus tard)

Branchement prévu via GitHub Actions :
- Push sur `main` touchant `sites/demo-cms/**` → build + deploy sur CF Pages
- Webhook Payload (collection Pages) → trigger un deploy CF Pages quand un client édite son contenu

## Isolation multi-tenant

Le site ne voit QUE son tenant. Le SDK `src/lib/cms.ts` résout le tenant par son slug puis filtre toutes les requêtes par `tenantId`. Changer `CMS_TENANT_SLUG` dans l'env de build → changer de client.

Chaque site client aura son propre projet CF Pages avec son propre `CMS_TENANT_SLUG`.
