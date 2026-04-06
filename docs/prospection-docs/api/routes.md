# API Routes Reference — Prospection Dashboard

> Date: 2026-03-31 | 30 routes | Toutes auth+tenant sauf 4 publiques

## Auth

Toutes les routes authentifiees utilisent :
1. `requireAuth()` — verifie le JWT Supabase (cookie)
2. `getTenantId(user.id)` — resout le tenant_id depuis Supabase

Si Supabase n'est pas configure (mode outil interne), l'auth retourne un user `internal` sans tenant.

## Routes publiques (4)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Liveness probe (`healthy`, `db: connected`) |
| POST | `/api/tenants/provision` | Provisioning SaaS (HMAC ou Bearer) |
| GET | `/api/auth/token?t=TOKEN` | Auto-login via magic link |
| POST | `/api/phone/telnyx-webhook` | Webhook Telnyx (signe par Telnyx) |

## Routes authentifiees (26)

### Leads & Prospects

| Method | Route | Params | Description |
|--------|-------|--------|-------------|
| GET | `/api/leads` | page, pageSize, sort, sortDir, f_* | Liste paginee + filtres + plan limit |
| GET | `/api/leads/[domain]` | - | Detail complet d'un prospect |
| GET | `/api/prospects` | domain, preset, filters... | Navigation sectorielle (BTP, commerce, etc.) |
| GET | `/api/history` | - | 200 derniers prospects visites |
| GET | `/api/stats` | - | Compteurs globaux (cache 5min) |
| GET | `/api/stats/by-department` | - | Distribution par departement |

### Pipeline & Outreach

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/pipeline` | Kanban complet (groupe par status) |
| PUT | `/api/pipeline` | Reorder, save column order |
| PUT | `/api/outreach/[domain]` | Update complet outreach |
| PATCH | `/api/outreach/[domain]` | Update partiel outreach |

### Segments

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/segments` | Arbre des segments avec counts |
| GET | `/api/segments/[...slug]` | Leads d'un segment |

### Claude & Activities

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/claude/[domain]` | Activites IA pour un prospect |
| POST | `/api/claude/[domain]` | Creer une activite |
| DELETE | `/api/claude/[domain]/[id]` | Supprimer une activite |
| GET | `/api/claude/stats` | Stats agregees IA |

### Followups

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/followups` | Liste (optionnel: ?domain=) |
| POST | `/api/followups` | Planifier un rappel |
| PATCH | `/api/followups/[id]` | Modifier status/note |

### Emails

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/outreach-emails/[domain]` | Historique emails |
| POST | `/api/outreach/[domain]/send` | Envoyer un email |
| POST | `/api/outreach/test-send` | Email de test |

### Telephonie

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/phone/server-call` | Lancer un appel Telnyx |
| GET/POST | `/api/phone/call-log` | Historique appels |
| POST | `/api/phone/summarize-call` | Resume IA d'un appel |
| POST | `/api/phone/telnyx-token` | Token WebRTC |
| GET/POST | `/api/phone/presence` | Statut presence telephonie |

### Settings & Export

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/settings` | Config tenant (pipeline_config) |
| GET | `/api/twenty/export` | Export vers Twenty CRM |
| GET/PUT | `/api/twenty/qualification` | Sync qualifications |

## Syntaxe des filtres (f_*)

```
f_field=value              exact match
f_field=val1,val2          IN (val1, val2)
f_field=!value             NOT value (ou NULL)
f_field=!=value            NULL OR != value
f_field=>=100000           >= 100000
f_field=<=500000           <= 500000
f_field=100000-500000      BETWEEN
f_field=!empty             IS NOT NULL AND != ''
f_field=empty              IS NULL OR = ''
f_search=terme             Recherche globale (domain, email, phone, nom, dirigeant)
```
