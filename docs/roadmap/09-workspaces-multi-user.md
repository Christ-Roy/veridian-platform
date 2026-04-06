# 09 — Workspaces & Multi-user (Prospection SaaS)

> **Statut** : En cours (démarré 2026-04-04)
> **Objectif** : Permettre à un tenant d'avoir plusieurs commerciaux cloisonnés dans des workspaces, avec un user admin qui voit tout et un dashboard KPI agrégé.

## Contexte

Aujourd'hui, le modèle est : **1 user Supabase = 1 tenant = toutes les données**. Pour intégrer des commerciaux dans une même organisation, il faut :

1. Introduire la notion de **workspace** (sous-découpage d'un tenant pour cloisonner le travail des commerciaux entre eux).
2. Introduire des **rôles** (`admin` voit tous les workspaces du tenant, `member` ne voit que les siens).
3. Donner à l'admin un **dashboard KPI** agrégé sur tous les workspaces (appels, emails, conversions par commercial).

Cette roadmap couvre **uniquement la partie prospection**. Le Hub (invitations multi-user, magic links) et la propagation Twenty seront traités dans une roadmap séparée, une fois que prospection expose la feature workspace.

---

## Périmètre — Tables impactées

Audit réalisé : seules les tables réellement utilisées par l'UI SaaS actuelle reçoivent un `workspaceId`. Les tables legacy, tenant-wide ou non exposées restent en l'état.

| Table | Traitement | Justification |
|---|---|---|
| `Outreach` | `workspaceId` ✅ | Core funnel commercial (statut à contacter / en cours / gagné) |
| `CallLog` | `workspaceId` ✅ | Softphone Telnyx, chaque commercial voit ses appels |
| `Followup` | `workspaceId` ✅ | Rappels programmés perso |
| `ClaudeActivity` | `workspaceId` ✅ | Historique IA par prospect, inoffensif à tenantiser |
| `OutreachEmail` | `tenantId` only, **pas de workspaceId** | Pas de SMTP SaaS disponible, feature legacy à réviser/supprimer |
| `LeadSegment` | Tenant-wide | Segments partagés à toute l'orga (l'admin segmente, les commerciaux piochent) |
| `PipelineConfig` | Tenant-wide | Config globale du pipeline |
| `PjLead`, `Result` | Tenant-wide | Base de données de leads, partagée |
| `OvhMonthlyDestination` | Tenant-wide | Compteur forfait OVH, non exposé UI |

---

## Phase 1 — Schéma & migration (fondation)

**Livrables** :
- Modèles Prisma `Workspace` + `WorkspaceMember`
- Colonne `workspaceId String? @db.Uuid` (nullable) sur les 4 tables du périmètre
- Index `(tenantId, workspaceId)` sur chaque table impactée
- Migration SQL générée
- Script de backfill : 1 workspace "Default" par tenant + UPDATE des rows existantes

**Critère de validation** :
- `prisma migrate dev` passe en local sur Postgres Docker 5433
- `prisma generate` régénère le client sans erreur
- Aucune row en base n'a `workspaceId = NULL` après backfill

**Sortie de phase** : schéma en place, ancien code encore fonctionnel (colonnes nullable, aucune route ne filtre encore sur workspace).

---

## Phase 2 — Refactor tenant resolution

**Livrables** :
- `lib/supabase/tenant.ts` : remplacer `getTenantId(userId)` par `getUserContext(userId)` qui renvoie `{ tenantId, workspaces: [{id, name, role}], isAdmin }`
- Cache 60s conservé (stratégie actuelle)
- Helper `lib/supabase/workspace-filter.ts` : `applyWorkspaceFilter(where, userContext)` qui ajoute automatiquement le filtre `workspaceId IN (...)` (sauf si `isAdmin` et aucun workspace sélectionné explicitement → tous)
- Cookie `active_workspace_id` pour la sélection active côté user

**Critère de validation** :
- Tests unitaires sur le helper (isolation par workspace, admin voit tout, member voit ses workspaces uniquement)
- Aucun breakage côté routes API existantes (helper optionnel au début)

---

## Phase 3 — Refactor des routes API

**Livrables** :
- Passer les 29 routes API qui filtrent par `tenantId` à l'utilisation du helper `applyWorkspaceFilter`
- Mise à jour des 4 tables impactées : INSERT injecte `workspaceId` depuis le user context
- Tests e2e : un user `member` ne voit pas les données d'un autre workspace, un `admin` voit tout

**Routes prioritaires** :
- `/api/outreach/[domain]`, `/api/outreach/[domain]/send`
- `/api/phone/call-log`, `/api/phone/server-call`, `/api/history`
- `/api/followups`, `/api/followups/[id]`
- `/api/claude/[domain]`, `/api/claude/stats`
- `/api/pipeline`, `/api/prospects`, `/api/stats/*`

---

## Phase 4 — UI : switcher workspace & gestion

**Livrables** :
- Switcher workspace dans la navbar (comme Slack/Notion, dropdown avec liste des workspaces accessibles)
- Page `/admin/workspaces` (admin only) :
  - Liste des workspaces du tenant
  - Créer / renommer / supprimer un workspace
  - Ajouter / retirer des membres à un workspace
  - Changer le rôle d'un membre
- Badge rôle dans la navbar (admin / member)

---

## Phase 5 — Dashboard KPI admin

**Livrables** :
- Page `/admin/kpi` (admin only)
- Agrégats par workspace et par membre :
  - Nb appels passés (jour / semaine / mois)
  - Nb emails envoyés (si feature ressuscitée, sinon masqué)
  - Nb leads contactés, nb convertis (status = gagné)
  - Taux de conversion, temps moyen appel
  - Leaderboard commerciaux
- Filtres temporels (jour / semaine / mois / custom)
- Option : assigner un lead à un workspace depuis la page admin

---

## Hors scope (pour plus tard, roadmap séparée)

- **Hub — invitations & magic links multi-user** : nécessite que prospection expose la feature workspace en prod. À démarrer après Phase 4.
- **Twenty — propagation user** : à creuser au moment du Hub (API admin Twenty ou SSO JWT).
- **Notifuse** : workspace actuel cassé, à investiguer indépendamment.
- **OutreachEmail** : feature legacy, à décider — ressusciter avec SMTP propre ou supprimer.

---

## Setup dev

- **Watcher** : `./scripts/dev-sync.sh --watch` (rsync continu vers `ubuntu@37.187.199.185:~/prospection-dev/`)
- **DB dev server** : Postgres du compose `saas-staging` (via env vars appropriées sur le dev server)
- **DB local Claude** : Postgres Docker `docker-compose.dev.yml` sur port 5433 (isolé, pour tests schéma/migrations)
- **Migrations testées en local d'abord**, puis appliquées sur staging une fois validées
