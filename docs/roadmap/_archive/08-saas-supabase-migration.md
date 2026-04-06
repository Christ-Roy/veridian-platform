# 08 — Migration SaaS : Supabase + Multi-tenant

> Date : 2026-03-26
> Statut : PLAN — à implémenter dans une session dédiée
> Prérequis : Session actuelle terminée (Telnyx + filtres validés)

## Vision

Migrer le dashboard de SQLite standalone vers une architecture SaaS multi-tenant
avec Supabase (PostgreSQL) comme backend. L'objectif est de pouvoir partager l'outil
avec d'autres utilisateurs et à terme l'intégrer dans le SaaS Veridian.

## Architecture cible

```
[Browser] → [Next.js Dashboard] → [Supabase PostgreSQL]
                ↓                        ↓
          [Supabase Auth]         [Row Level Security]
                ↓
          [Telnyx WebRTC]
```

## Supabase existant (PROD)

On a déjà une instance Supabase en prod sur le VPS OVH (10 containers Docker).
Credentials dans ~/credentials/.all-creds.env :
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_JWT_SECRET
- POSTGRES_PASSWORD

L'URL Supabase est accessible via Traefik sur le VPS.

## Plan d'exécution

### Phase 1 — Schema PostgreSQL (sur une branche `saas`)

1. Dump le schema SQLite actuel et le convertir en PostgreSQL :
   - `results` → `prospects` (renommage plus clair)
   - `email_verification` → `prospect_emails`
   - `phone_verification` → `prospect_phones`
   - `outreach` → `prospect_outreach`
   - `claude_activity` → `prospect_activities`
   - `followups` → `prospect_followups`
   - `call_log` → `calls`
   - `pipeline_config` → `settings`

2. Ajouter les colonnes multi-tenant :
   - `tenant_id UUID NOT NULL` sur chaque table
   - `created_by UUID` (user qui a créé l'enregistrement)
   - Row Level Security (RLS) policies

3. Ajouter la table `tenants` :
   ```sql
   CREATE TABLE tenants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     slug TEXT UNIQUE NOT NULL,
     plan TEXT DEFAULT 'free',
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

4. Ajouter la table `tenant_members` :
   ```sql
   CREATE TABLE tenant_members (
     tenant_id UUID REFERENCES tenants(id),
     user_id UUID REFERENCES auth.users(id),
     role TEXT DEFAULT 'member', -- admin, member, viewer
     PRIMARY KEY (tenant_id, user_id)
   );
   ```

### Phase 2 — Prisma ORM

1. Initialiser Prisma dans le dashboard :
   ```bash
   npx prisma init --datasource-provider postgresql
   ```

2. Écrire le schema Prisma correspondant au schema PostgreSQL

3. Remplacer `better-sqlite3` par `@prisma/client` dans les queries :
   - `lib/queries/prospects.ts` → Prisma queries
   - `lib/queries/pipeline.ts` → Prisma queries
   - `lib/queries/activity.ts` → Prisma queries
   - `lib/queries/stats.ts` → Prisma queries

4. Garder un mode "SQLite" pour le dev local (Prisma supporte les deux)

### Phase 3 — Auth Supabase

1. Ajouter `@supabase/supabase-js` et `@supabase/auth-helpers-nextjs`

2. Middleware Next.js pour vérifier le JWT Supabase :
   ```typescript
   // middleware.ts
   import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
   ```

3. Page de login `/auth/login` avec Supabase Auth UI

4. Protéger toutes les routes API avec le middleware

### Phase 4 — Migration des données

1. Script Python pour migrer les données SQLite → PostgreSQL :
   - Créer le tenant "Veridian" (Robert)
   - Importer les 1.58M prospects (scan_prod.db)
   - Importer les tables dashboard (outreach, activities, etc.)
   - Ajouter tenant_id à toutes les lignes

2. Ce script ne tourne qu'une fois, puis les données vivent dans PostgreSQL

### Phase 5 — Tests

1. DB de test locale : PostgreSQL dans Docker ou SQLite via Prisma
2. Seed script pour les tests e2e (comme le seed.sql actuel mais en Prisma)
3. Tests de RLS (vérifier qu'un tenant ne voit pas les données d'un autre)

## Estimation

| Phase | Complexité | Durée estimée |
|-------|-----------|---------------|
| Schema PG | Moyenne | 1 session |
| Prisma ORM | Haute (refactor toutes les queries) | 2-3 sessions |
| Auth Supabase | Moyenne | 1 session |
| Migration données | Basse | 1 session |
| Tests | Moyenne | 1 session |

Total : 5-6 sessions de travail

## Risques

- **Performance** : PostgreSQL via réseau vs SQLite en local — les queries seront plus lentes.
  Mitigation : connection pooling, index, cache Redis si nécessaire.
- **Supabase self-hosted** : on utilise notre propre instance, pas le cloud Supabase.
  Avantage : pas de limites. Risque : maintenance à notre charge.
- **Migration données** : 1.58M lignes à migrer proprement.
  Mitigation : script idempotent, vérifications de cohérence.

## Questions ouvertes

1. Faut-il garder un mode SQLite pour le dev local ? (probablement oui, via Prisma)
2. Les données scan (results) restent-elles en read-only même en PostgreSQL ?
3. Le scoring/enrichissement continue en Python avec SQLite — faut-il un pipeline de sync ?
4. Redis pour le cache des counts ? Ou PostgreSQL materialized views suffisent ?

## Pour la prochaine session

```bash
# Créer la branche saas
git checkout -b saas

# Initialiser Prisma
cd dashboard && npx prisma init --datasource-provider postgresql

# Dumper le schema Supabase existant
ssh prod-pub "docker exec supabase-db pg_dump -s -U postgres postgres" > schema-supabase.sql
```
