# template-restaurant

Template de site vitrine restaurant. Next.js 15 SSG + Tailwind, contenu éditable via Payload CMS.

## Dev

```bash
cp .env.example .env      # renseigner CMS_API_KEY
npm install
npm run dev               # http://localhost:3311
```

## Build + deploy

```bash
npm run deploy
```

## Variables d'env

| Var | Défaut | Rôle |
|---|---|---|
| `CMS_API_URL` | `https://cms.staging.veridian.site` | URL Payload |
| `CMS_TENANT_SLUG` | `restaurant` | Slug du tenant |
| `CMS_API_KEY` | — | Clé read |
