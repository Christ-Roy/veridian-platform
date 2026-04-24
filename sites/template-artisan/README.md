# template-artisan

Template de site vitrine artisan/BTP. Next.js 15 SSG + Tailwind, contenu éditable via Payload CMS.

## Dev

```bash
cp .env.example .env      # renseigner CMS_API_KEY
npm install
npm run dev               # http://localhost:3310
```

## Build + deploy CF Pages

Auto via GitHub (branche main → CF Pages). Manuel :

```bash
npm run deploy
```

## Variables d'env

| Var | Défaut | Rôle |
|---|---|---|
| `CMS_API_URL` | `https://cms.staging.veridian.site` | URL Payload |
| `CMS_TENANT_SLUG` | `artisan` | Slug du tenant |
| `CMS_API_KEY` | — | Clé read (user scopé au tenant) |
