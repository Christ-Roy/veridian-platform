# Auth & Multi-tenant — Prospection

> Date: 2026-03-31

## Auth Flow

```
Browser → Supabase JWT (cookie) → requireAuth() → getTenantId() → query(tenantId)
```

1. User se connecte via le Hub (saas-hub.staging.veridian.site)
2. Hub provisionne le tenant → stocke login_token dans Supabase `tenants`
3. User clique "Open Prospection" → `/api/auth/token?t=TOKEN`
4. Token valide contre Supabase, redirige vers `/`, cookie Supabase set
5. Chaque requete API : `requireAuth()` lit le cookie → `getTenantId()` → queries scopees

## Middleware (pages)

`src/middleware.ts` — verifie la session Supabase sur toutes les pages sauf :
- `/login` — page de redirection vers le hub
- `/api/*` — gere par `requireAuth()` dans chaque route
- `/_next/*`, `/favicon.ico` — statique

## Provisioning (Hub → Prospection)

```
POST /api/tenants/provision
Headers: Content-Type: application/json
Body: { email, plan?, timestamp, signature }
```

Auth HMAC-SHA256 : `signature = hmac(email:timestamp, TENANT_API_SECRET)`
Timestamp max drift : 5 minutes. Legacy Bearer en backward compat.

## Isolation multi-tenant

### Tables operationnelles (avec tenant_id)
- outreach, claude_activity, followups, outreach_emails, call_log
- lead_segments, pipeline_config, ovh_monthly_destinations

### Tables partagees (sans tenant_id)
- results, email_verification, phone_verification, pj_leads

### PKs composites
- outreach: (domain, tenant_id)
- pipeline_config: (key, tenant_id)
- lead_segments: (domain, segment, tenant_id)

### Default tenant_id
`00000000-0000-0000-0000-000000000000` — utilise quand pas de Supabase (mode outil interne)

### Couverture
30/30 routes API auditees : 26 auth+tenant, 4 publiques (expected)

## Plan Limits

| Plan | Prospects visibles | Env var |
|------|-------------------|---------|
| freemium | 300 | PLAN_LIMIT_FREEMIUM |
| pro | 100,000 | PLAN_LIMIT_PRO |
| enterprise | 500,000 | PLAN_LIMIT_ENTERPRISE |

Stripe sync : webhook `manageSubscriptionStatusChange` → met a jour `tenants.prospection_plan` automatiquement.
