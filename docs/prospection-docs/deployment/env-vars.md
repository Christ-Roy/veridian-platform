# Variables d'environnement — Prospection

> Date: 2026-03-31

## Prospection Dashboard

| Variable | Default | Requis | Description |
|----------|---------|--------|-------------|
| `DATABASE_URL` | - | **Oui** | PostgreSQL connection string (+?connection_limit=10) |
| `TENANT_API_SECRET` | - | **Oui** | Secret HMAC pour le provisioning |
| `APP_URL` | - | Oui | URL publique (https://saas-prospection.staging.veridian.site) |
| `NEXT_PUBLIC_SITE_URL` | - | Oui | Idem (pour le client) |
| `SUPABASE_URL` | - | Non* | URL Supabase interne (http://kong:8000) |
| `NEXT_PUBLIC_SUPABASE_URL` | - | Non* | URL Supabase publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | - | Non* | Cle anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Non* | Cle service_role Supabase |
| `PLAN_LIMIT_FREEMIUM` | 300 | Non | Prospects max plan freemium |
| `PLAN_LIMIT_PRO` | 100000 | Non | Prospects max plan pro |
| `PLAN_LIMIT_ENTERPRISE` | 500000 | Non | Prospects max plan enterprise |

*Non requis = mode outil interne (pas de Supabase, pas d'auth, pas de tenant)

## Hub (app.veridian)

| Variable | Default | Description |
|----------|---------|-------------|
| `TRIAL_PERIOD_DAYS` | 15 | Duree trial tenant (jours) |
| `NEXT_PUBLIC_TRIAL_PERIOD_DAYS` | 7 | Duree trial affichee + Stripe |
| `PROSPECTION_API_URL` | - | URL interne prospection (http://prospection:3000) |
| `PROSPECTION_TENANT_API_SECRET` | - | Secret HMAC (= TENANT_API_SECRET) |
| `NEXT_PUBLIC_PROSPECTION_URL` | - | URL publique prospection |
| `TWENTY_GRAPHQL_URL` | - | URL interne Twenty GraphQL |
| `TWENTY_METADATA_URL` | - | URL interne Twenty metadata |
| `TWENTY_FRONTEND_URL` | - | URL publique Twenty |
| `NOTIFUSE_API_URL` | - | URL interne Notifuse |
| `NOTIFUSE_SECRET_KEY` | - | Secret Notifuse (HMAC rootSignin) |
| `NOTIFUSE_ROOT_EMAIL` | - | Email admin Notifuse |
| `STRIPE_SECRET_KEY` | - | Cle Stripe (test ou live) |
| `STRIPE_WEBHOOK_SECRET` | - | Secret webhook Stripe |

## Compose staging (Dokploy env vars)

| Variable | Valeur staging |
|----------|---------------|
| `POSTGRES_PASSWORD` | staging-password-2026 |
| `JWT_SECRET` | staging-jwt-secret-min-32-characters-long-enough |
| `ANON_KEY` | eyJhbG...LJrB1f (signe avec JWT_SECRET staging) |
| `SERVICE_ROLE_KEY` | eyJhbG...hfFE-D (signe avec JWT_SECRET staging) |
| `TENANT_API_SECRET` | staging-prospection-secret-2026 |
| `SMTP_HOST` | smtp-relay.brevo.com |
| `SMTP_PORT` | 587 |
| `SMTP_USER` | 8b5d2a002@smtp-brevo.com |
| `TWENTY_APP_SECRET` | staging-twenty-app-secret-2026-min32chars |
| `NOTIFUSE_SECRET_KEY` | staging-notifuse-secret-2026 |
