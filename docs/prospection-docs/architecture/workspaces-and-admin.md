# Workspaces & Admin API

> Date: 2026-04-04 (Phase 1 complete)
> Status: Backend complet, UI à venir
> Roadmap: [`roadmap/09-workspaces-multi-user.md`](../../roadmap/09-workspaces-multi-user.md)

## Vue d'ensemble

Le dashboard prospection supporte désormais un **modèle multi-user par tenant** via la notion de **workspace** : un tenant peut contenir N workspaces, chaque workspace a M users (members ou admins). C'est la brique qui permet d'intégrer des commerciaux dans une même orga SaaS avec cloisonnement par workspace.

### Hiérarchie

```
Tenant (Supabase.tenants)
└── Workspace (prospection-db.workspaces)        ← nouveau
    └── WorkspaceMember (prospection-db.workspace_members)  ← nouveau
        │
        ├── role = "admin"   → voit tous les workspaces du tenant
        └── role = "member"  → ne voit que ses workspaces
```

Le tenant owner (créateur, `tenants.user_id`) est **toujours admin implicite**, même sans row dans `workspace_members`.

## Tables DB

### `workspaces`
| Colonne | Type | Description |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `tenant_id` | UUID | Référence Supabase `tenants.id` (pas de FK Postgres, cross-DB) |
| `name` | TEXT | Nom affiché |
| `slug` | TEXT | Unique par tenant (`UNIQUE (tenant_id, slug)`) |
| `leads_limit` | INTEGER? | Override optionnel du quota de leads par workspace |
| `created_by` | UUID? | User Supabase créateur |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `workspace_members`
| Colonne | Type | Description |
|---|---|---|
| `workspace_id` | UUID | FK `workspaces.id` ON DELETE CASCADE |
| `user_id` | UUID | User Supabase (auth.users.id) |
| `role` | TEXT | `"admin"` ou `"member"` (default `"member"`) |
| `joined_at` | TIMESTAMPTZ | |
| | | **PK** = `(workspace_id, user_id)` |

### `magic_links` (invitations internes)
| Colonne | Type | Description |
|---|---|---|
| `token` | TEXT (PK) | Random 32-byte base64url |
| `email` | TEXT | Email invité |
| `tenant_id` | UUID | |
| `workspace_id` | UUID? | Workspace cible |
| `role` | TEXT | `"admin"` ou `"member"` |
| `invited_by` | UUID? | User Supabase qui a généré l'invite |
| `expires_at` | TIMESTAMPTZ | Défaut 7 jours |
| `used_at` | TIMESTAMPTZ? | Null = pending, non-null = déjà utilisé |

### Colonnes `workspace_id` sur les 4 tables métier

Pour cloisonner les données par workspace, une colonne nullable a été ajoutée sur :
- `outreach.workspace_id`
- `call_log.workspace_id`
- `followups.workspace_id`
- `claude_activity.workspace_id`

Index composite `(tenant_id, workspace_id)` sur chaque table.

**Note** : `outreach_emails` n'a PAS reçu de `workspace_id` — c'est du legacy à réviser/supprimer (pas de credentials SMTP SaaS disponibles).

## Helpers d'authentification

Fichier : [`src/lib/supabase/user-context.ts`](../../dashboard/src/lib/supabase/user-context.ts)

### `getUserContext(): Promise<UserContext | null>`

Résout depuis le cookie Supabase :

```ts
type UserContext = {
  userId: string;
  email: string;
  tenantId: string;
  tenantOwnerId: string | null;
  workspaces: Array<{ id: string; name: string; slug: string; role: "admin" | "member" }>;
  isAdmin: boolean;           // true si owner OR au moins un membership admin
  activeWorkspaceId: string | null;  // cookie `active_workspace_id`
};
```

### `getWorkspaceScope(): Promise<{ ctx, filter, insertId }>`

Helper agrégé à utiliser dans les routes API :

```ts
const { ctx, filter, insertId } = await getWorkspaceScope();
// filter   : string[] | null  — passer aux queries SELECT
//            null = admin (aucun filtre), []=0 rows, [id1,id2]=workspaces du member
// insertId : string | null    — passer aux queries INSERT/CREATE
//            Résolu depuis activeWorkspaceId (cookie) > premier workspace > default
```

### `requireUser()` / `requireAdmin()`

Protection des routes API :

```ts
const auth = await requireAdmin();
if ("error" in auth) return auth.error;  // 401 ou 403
const ctx = auth.ctx;  // UserContext garanti
```

## API Admin

Toutes les routes `/api/admin/*` sont **gated par `requireAdmin()`** (403 sinon).

### Workspaces

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/admin/workspaces` | Liste les workspaces du tenant avec `memberCount` |
| `POST` | `/api/admin/workspaces` | Crée un workspace `{ name, slug? }`. Slug auto-généré si absent, uniqueness auto (-2, -3...) |
| `PATCH` | `/api/admin/workspaces/[id]` | Renomme `{ name?, slug? }` |
| `DELETE` | `/api/admin/workspaces/[id]` | Supprime. Rows orphelines sur les 4 tables métier sont **réassignées au workspace "default"** du tenant. Impossible de supprimer "default" |

### Members

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/admin/members` | Liste tous les membres du tenant, avec leurs memberships par workspace. Inclut le tenant owner même sans membership explicite |
| `PATCH` | `/api/admin/members/[userId]` | Body `{ workspaceId, role, remove? }`. Upsert membership ou remove (protection : owner non removable) |
| `DELETE` | `/api/admin/members/[userId]` | Retire le user de tous les workspaces du tenant (owner protégé) |

### Invites (magic links)

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/admin/invites` | Body `{ email, workspaceId, role? }`. Génère un token interne + renvoie `{ inviteUrl, token, expiresAt }`. Expiration 7 jours |
| `GET` | `/api/admin/invites` | Liste les invites pending (non usées, non expirées) |

L'URL renvoyée est `https://<site>/invite/<token>` — à envoyer manuellement à l'invité par le canal de son choix (Brevo, Slack, etc.).

### KPI

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/admin/kpi?from=ISO&to=ISO` | Agrégats par workspace et par user : outreach `byStatus` + `total` + `won` + `conversionRate`, calls `total` + `totalSeconds`, followups `byStatus` + `total` |

## Flow invitation (acceptance)

Page : [`src/app/invite/[token]/page.tsx`](../../dashboard/src/app/invite/[token]/page.tsx) (public, pas d'auth requise)

```
1. GET /invite/<token>
2. Charger magic_link row (check expiresAt, usedAt)
3. Si user déjà logged-in avec email matching:
   → upsert workspace_member
   → mark usedAt
   → redirect /prospects
4. Sinon:
   → Si user Supabase n'existe pas: createUser(email, confirmed)
   → Générer un Supabase magiclink avec redirectTo=/invite/<token>
   → Afficher une page "Me connecter" avec le lien Supabase
5. Au retour (loop to step 3), auto-accept
```

**Middleware** : `/invite/*` est dans la liste des public routes (`src/lib/supabase/middleware.ts`).

## Tests

### Tests d'intégration DB (vitest)

Fichier | Description | Run
---|---|---
[`e2e/integration/tenant-isolation.test.ts`](../../dashboard/e2e/integration/tenant-isolation.test.ts) | Isolation cross-tenant (6 tests) | `npm run test:isolation`
[`e2e/integration/workspace-isolation.test.ts`](../../dashboard/e2e/integration/workspace-isolation.test.ts) | Isolation workspace dans un tenant (10 tests) | `npm run test:integration`
[`e2e/integration/admin-routes.test.ts`](../../dashboard/e2e/integration/admin-routes.test.ts) | API admin end-to-end via magic link Supabase (20 tests, skipped sans creds) | `npm run test:integration`

**Total** : 36 tests, tournent contre la DB staging en ~7s.

```bash
# Run tous les tests integration
cd dashboard
npm run test:integration

# Avec auth Supabase (pour admin-routes.test.ts)
SUPABASE_URL=https://saas-api.staging.veridian.site \
SUPABASE_SERVICE_ROLE_KEY=... \
NEXT_PUBLIC_SUPABASE_URL=https://saas-api.staging.veridian.site \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
APP_URL=http://localhost:3000 \
npm run test:integration
```

### Script de test CLI

Fichier : [`scripts/test-admin-routes.ts`](../../dashboard/scripts/test-admin-routes.ts)

Version standalone (sans vitest) qui fait 17 assertions sur les routes admin + entreprises stubs + régression legacy. Pratique pour debug manuel.

```bash
ENV_VARS... npx tsx scripts/test-admin-routes.ts
```

### Seed de données démo

Fichier : [`scripts/seed-staging-demo.ts`](../../dashboard/scripts/seed-staging-demo.ts)

Crée dans le tenant `robert@veridian.site` :
- 3 workspaces (Paris, Lyon, Marseille)
- Robert comme admin sur les 3
- 3 users commerciaux fictifs (sales-paris/lyon/marseille@demo.veridian.site) en member
- 26 outreach clonés depuis le tenant interne avec 5 statuts variés
- 9 followups + 9 call_log avec durées variables

Idempotent : safe de relancer plusieurs fois.

```bash
ENV_VARS... npx tsx scripts/seed-staging-demo.ts
```

## Migration SQL

Fichiers chirurgicaux idempotents (pas de `prisma db push` à cause de la drift `results`) :

- [`scripts/2026-04-04_add-workspaces.sql`](../../dashboard/scripts/2026-04-04_add-workspaces.sql) — tables workspaces, workspace_members, magic_links + colonnes workspace_id sur les 4 tables métier
- [`scripts/2026-04-04_add-entreprises-table.sql`](../../dashboard/scripts/2026-04-04_add-entreprises-table.sql) — nouvelle table `entreprises` (stubs Phase 3 SIREN refactor, vide)
- [`scripts/backfill-workspaces.sql`](../../dashboard/scripts/backfill-workspaces.sql) — crée 1 workspace "Default" par tenant + backfill rows existantes

Appliquer sur staging :

```bash
ssh dev-pub "docker exec -i compose-bypass-bluetooth-feed-tbayqr-prospection-db-1 \
  psql -U postgres -d prospection" < scripts/2026-04-04_add-workspaces.sql
```

## Ce qui reste à faire

- **UI** : switcher workspace navbar, page `/settings/team`, page `/admin/kpi`
- **Hub** : invitations multi-user + propagation Twenty (Phase 3 roadmap)
- **Quota leads** : plomber `workspace.leadsLimit` dans les queries de listing de leads
- **Notifuse** : workspace cassé à investiguer

## Ce qui ne sera PAS fait ici

- **Refactor SIREN-centric** (voir [`tmp/EMERGENCY-REFACTOR-SIREN-CENTRIC.md`](../../../tmp/EMERGENCY-REFACTOR-SIREN-CENTRIC.md)) — chantier séparé qui affecte la table `results`, pas les tables métier workspace.
