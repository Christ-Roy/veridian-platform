# Prospection Dashboard — Documentation Technique

> Date: 2026-03-31 | Version: staging (branche `staging`)
> Stack: Next.js 15 + TypeScript + Prisma 6 + PostgreSQL 15

## Structure de la doc

```
docs/
├── README.md                    ← Ce fichier (index)
├── api/
│   └── routes.md                ← Reference complete des 30 API routes
├── architecture/
│   ├── database-schema.md       ← Schema Prisma complet (13 tables)
│   ├── auth-and-tenants.md      ← Auth Supabase, isolation multi-tenant, plan limits
│   ├── workspaces-and-admin.md  ← Workspaces multi-user + API admin (Phase 1)
│   └── staging-architecture.md  ← Compose staging, containers, domaines
└── deployment/
    ├── cicd-pipeline.md         ← CI/CD GitHub Actions (build, test, docker, deploy)
    └── env-vars.md              ← Toutes les variables d'environnement configurables
```

## Quick Reference

| Endpoint staging | URL |
|------------------|-----|
| Hub SaaS | https://saas-hub.staging.veridian.site |
| Prospection | https://saas-prospection.staging.veridian.site |
| Twenty CRM | https://saas-twenty.staging.veridian.site |
| Notifuse | https://saas-notifuse.staging.veridian.site |
| Supabase API | https://saas-api.staging.veridian.site |

## Etat du backend (2026-03-31)

- 76/79 items todolist completes (96%)
- 30 API routes, toutes avec auth + tenant isolation
- 438K leads en DB staging avec index
- CI/CD : push staging → build → test → docker → deploy (~5min)
- Stripe → prospection_plan sync automatique
- HMAC auth pour le provisioning
- Plan limits configurables via env vars
