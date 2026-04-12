# Plan d'implémentation — Workspace admin Robert + Magic link

> Plan produit par le teammate `admin-planner` (Plan agent, read-only) le
> 2026-04-11 au sein de la team `analytics-mvp`. Ce plan a été utilisé
> pour briefer le teammate `admin-implementer` qui code le chantier.
>
> **Statut** : plan validé par team-lead, implémentation en cours.
> Ce fichier reste comme référence pour les prochaines sessions.

## Contexte et découvertes clés

### 1. Prospection n'utilise PAS Auth.js — c'est Supabase Auth

Le flow `prospection/src/app/invite/[token]/` qu'on veut "copier" est
implémenté côté Supabase Auth (admin API `auth/v1/admin/users` pour
create/update password, puis `auth/v1/token?grant_type=password` pour
signin). La lib `prospection/src/lib/invitations.ts` stocke les invitations
dans une table SQL maison `invitations` (token `randomBytes(32)`,
expiresAt 7 jours), pas dans le `VerificationToken` d'Auth.js.

**Conséquence** : on ne peut PAS littéralement copier le backend
Prospection. Ce qui est réutilisable, c'est :

- **Le flow UI** (`page.tsx` + `invite-accept-form.tsx`) : structure 2
  étapes token → check → form email readonly + password prompt → POST
  accept → redirect
- **Le schéma de la table invitations** (token hex, expiresAt,
  acceptedAt, revokedAt)
- **Les messages d'erreur français** (`reasonLabel`) pour tokens
  expirés/révoqués

Côté backend Analytics, deux options qu'il faut trancher avant
d'implémenter :

- **Option A (Auth.js native email provider)** : utiliser `Email`
  provider d'Auth.js v5 qui génère et valide un token via la table
  `VerificationToken`, pipe un callback `sendVerificationRequest` vers
  Brevo. Login passwordless classique. Mais le "demande de set password
  à l'acceptation" n'existe pas nativement — il faut une page custom
  post-signin pour appeler `/api/auth/set-password`.
- **Option B (Token custom, session Auth.js à la fin)** : reproduire le
  pattern Prospection — table `MagicLinkToken` custom, endpoint
  `/api/magic-link/accept` qui valide le token, set le passwordHash,
  crée une session Auth.js via `signIn('credentials')` côté serveur.

**Reco** : **Option A mixte**. Auth.js génère et valide le token
(gratuit, testé), mais au lieu de créer directement la session, on
redirige vers `/welcome?token=<verified>` qui affiche le form "set
password", qui POST sur un endpoint custom qui :

1. Re-vérifie le token (2e fois, côté server action)
2. Hash le password + `prisma.user.update({ passwordHash })`
3. Consomme le VerificationToken
4. Appelle `signIn('credentials', { redirectTo: '/dashboard' })` avec
   le password qu'on vient de set

**Piège Auth.js** : l'email provider Auth.js v5 avec JWT session ne
marche PAS out of the box — il nécessite la table `VerificationToken`
qui existe déjà dans le schéma Analytics, donc OK, mais il force
`session.strategy: 'database'` sur certains flows. **À valider en spike
30min avant d'écrire du code**.

### 2. Session 90 jours déjà en place (pas 30)

`analytics/auth.config.ts:23` contient déjà `maxAge: 60 * 60 * 24 * 90`
(90 jours). Robert demande 9 mois = 270 jours. C'est juste un nombre à
changer. Pas un chantier.

### 3. Schema User Analytics n'a PAS de `role`

Modèle `User` dans `analytics/prisma/schema.prisma:26` a : `id, email,
name, image, emailVerified, passwordHash, createdAt, updatedAt`. Il faut
ajouter un champ de rôle plateforme.

**Attention** : `MembershipRole` enum existe déjà (`OWNER, ADMIN, MEMBER,
VIEWER`) mais c'est un rôle **tenant-scoped**. Robert veut un rôle
**plateforme** (SUPERADMIN cross-tenant), donc c'est un nouveau champ,
pas une réutilisation.

**Nom proposé** : `platformRole String @default("MEMBER")` sur User.

### 4. Tenant resolver actuel est mono-tenant par design

`analytics/lib/user-tenant.ts:51-53` : `getUserTenantStatus(email)` prend
le **premier** membership non-deleted trié par `createdAt asc`. Pour un
SUPERADMIN qui n'est membre que de `veridian` mais doit voir
`tramtech/morel/apical`, il faut un second chemin :
`getTenantStatusBySlugForAdmin(slug)` qui bypass la contrainte de
membership. À ne PAS bolter sur la fonction existante — créer un nouveau
helper pour ne pas casser le flow client normal.

### 5. Endpoints admin existants protégés par `x-admin-key` — pas session

Toutes les routes `analytics/app/api/admin/*` utilisent `requireAdmin(req)`
(`lib/admin-auth.ts:46`) qui vérifie un header statique `x-admin-key`.
Les boutons sur la future page `/admin` UI ne peuvent pas envoyer ce
header sans fuiter la clé en frontend.

**Deux options** :

- **A. Dual-auth** : patcher `requireAdmin` pour accepter SOIT
  `x-admin-key` SOIT une session valide avec
  `platformRole === 'SUPERADMIN'`. Avantage : zéro duplication, les 10
  endpoints existants fonctionnent tout de suite pour l'UI. Inconvénient :
  couplage plus fort.
- **B. Server Actions** : ne pas appeler les routes API depuis le
  client. Créer des server actions React dans `app/admin/_actions/*.ts`
  qui font directement l'appel Prisma + guard session. Les routes API
  restent pour Claude/skill uniquement.

**Reco** : **A. Dual-auth**. Ça évite de dupliquer la logique Prisma, et
`requireAdmin` devient `requireAdminOrSuperadmin(req)` en 20 lignes. On
pourra migrer vers server actions plus tard.

## Objectif global

Permettre à Robert (SUPERADMIN) d'accéder à une page `/admin` Analytics
qui liste tous les tenants, d'impersonner un tenant via
`?asTenant=<slug>` (stocké en cookie), et d'envoyer un magic link "style
Prospection" à un client (email pré-rempli + choix password + session 9
mois + redirect dashboard).

## Phases et dépendances

```
Phase 1 (fondations) ────┬──> Phase 2 (magic link)  ─┐
                         │                             │
                         ├──> Phase 3 (admin UI)  ─────┼──> Phase 4 (impersonation) ──> Phase 5 finale
                         │                             │
                         └──> Phase 5 tests unit (en continu)
```

## Phase 1 — Fondations (schema + auth) 🟢

Doit passer en premier. Les autres phases en dépendent.

### 1.1 Schema Prisma — Ajout rôle plateforme

Fichier : `analytics/prisma/schema.prisma` (modifier)

Ajouter dans le modèle `User` (après `passwordHash`) :

```prisma
platformRole String @default("MEMBER") // "MEMBER" | "SUPERADMIN"
```

Pas d'enum Prisma pour ce champ (deux valeurs, risque faible de typo,
évite une migration enum). Utiliser une string + un type TS
`PlatformRole = 'MEMBER' | 'SUPERADMIN'` dans `lib/auth-types.ts`.

Migration :

- Nom : `add_user_platform_role`
- SQL auto-généré (ALTER TABLE + DEFAULT). Tous les users existants
  deviennent `MEMBER` — safe.
- Rollback : `ALTER TABLE "analytics"."User" DROP COLUMN "platformRole"`
  — trivial, pas de data loss tant que personne n'a SUPERADMIN en prod.
- Existing tenants : aucun impact, default MEMBER = comportement actuel.

### 1.2 Seed SUPERADMIN

Fichier : `analytics/scripts/seed-superadmin.ts` (nouveau)

Script idempotent qui fait `prisma.user.update({ where: { email:
'robert@veridian.site' }, data: { platformRole: 'SUPERADMIN' } })`. À
lancer une fois sur staging puis prod après déploiement migration.
Logger "no-op" si le user n'existe pas (pour CI qui tournerait sur DB
vide).

### 1.3 Auth.js — Session maxAge + role dans JWT

Fichier : `analytics/auth.config.ts` (modifier)

- Changer `maxAge: 60 * 60 * 24 * 90` → `60 * 60 * 24 * 30 * 9` (9 mois
  = 270 jours).
- Ajouter callbacks `jwt` et `session` (actuellement absents).

Piège edge runtime : le middleware Next utilise `auth.config.ts` en Edge
(voir `middleware.ts:6`). On ne peut PAS importer Prisma dans les
callbacks d'`auth.config.ts`. Donc : au moment du `authorize` dans
`auth.ts` (Node runtime), il faut retourner `platformRole` dans l'objet
user, pour qu'il soit picked up par le callback `jwt` en Edge.

Fichier : `analytics/auth.ts` (modifier)

Dans `authorize`, ajouter `platformRole: user.platformRole` au return.

### 1.4 Types TS augmentés

Fichier : `analytics/types/next-auth.d.ts` (nouveau)

Declare module Next-Auth avec `platformRole` sur `Session['user']`,
`User`, et `JWT`. Sinon tsc va râler.

### 1.5 Guard helper

Fichier : `analytics/lib/admin-guard.ts` (nouveau)

`requireSuperadmin()` qui throw 403 / redirect /login si pas superadmin,
et `isSuperadmin(session)` pour les check inline.

**Effort Phase 1** : 🟢 petit (3-4h)
**Dépendances** : aucune.
**Tests unit obligatoires** : `requireSuperadmin`, `isSuperadmin`.

## Phase 2 — Magic link flow 🔴

Dépend de Phase 1.

### 2.1 Spike technique 30min — Auth.js email provider OU token custom

Avant d'écrire du code :

- Lire la doc officielle Auth.js v5 `Email` provider sur JWT session
- Faire un test local : est-ce que `VerificationToken` + callback
  `sendVerificationRequest` + redirect custom marche avec
  `session.strategy: 'jwt'` ?
- Go/no-go : si ça marche, Option A. Sinon, Option B (token maison dans
  une table `MagicLinkToken`).

### 2.2 Brevo helper

Fichier : `analytics/lib/email.ts` (nouveau)

Helper `sendMagicLinkEmail(to, url, tenantName)` qui poste sur Brevo API
v3 (`https://api.brevo.com/v3/smtp/email`). Credentials : `BREVO_API_KEY`
depuis env. Template inline HTML (pas de dépendance MJML ici — simple,
50 lignes).

Contenu email :

- Sujet : "Vos métriques Veridian Analytics — {tenantName}"
- Body : "Bonjour, voici votre accès personnel à votre dashboard
  Analytics. Ce lien expire dans 7 jours. [CTA : Accéder à mon dashboard]"
- Lien : `https://analytics.app.veridian.site/welcome?token=<token>`

### 2.3 Endpoint génération magic link

Fichier : `analytics/app/api/admin/tenants/[tenantId]/magic-link/route.ts`
(nouveau)

POST — prend `{ email }` dans le body (ou déduit de l'owner du tenant),
génère un token, stocke dans `VerificationToken` (ou `MagicLinkToken`
selon Option A/B), envoie le mail via Brevo. Réponse : `{ success,
expiresAt, emailSent, inviteUrl }` (inviteUrl utile pour que Robert
puisse copier-coller manuellement si l'email fail).

Auth : `requireAdminOrSuperadmin(req)` (dual-auth).

### 2.4 Page welcome (post-click)

Fichiers : `analytics/app/(auth)/welcome/page.tsx` + `welcome-form.tsx`
(nouveau)

Server component qui valide le token et affiche le `<WelcomeForm>`
client component avec email readonly pré-rempli + champ password.

### 2.5 Endpoint set-password

Fichier : `analytics/app/api/auth/set-password/route.ts` (nouveau)

POST `{ token, password }` :

1. Re-vérifie le token
2. Trouve le user par `identifier` du VerificationToken
3. Hash bcrypt rounds 12
4. `prisma.user.update`
5. Delete le VerificationToken (one-shot)
6. `signIn('credentials', ...)` côté serveur
7. Retour `{ success, redirectTo: '/dashboard' }`

Sécu : rate-limit par IP, validation Zod, user doit exister.

**Effort Phase 2** : 🔴 gros (8-12h dont 30min spike)
**Dépendances** : Phase 1 + credentials Brevo.
**Tests obligatoires** : unit sur email + set-password handler, e2e flow
complet avec Brevo mocké.

## Phase 3 — Workspace admin UI 🟡

Dépend de Phase 1. Indépendante de Phase 2 — peut tourner en parallèle.

### 3.1 Helper : list all tenants status

Fichier : `analytics/lib/tenant-status.ts` (modifier)

Ajouter `listAllTenantsStatus()` qui fait `findMany` + `buildTenantStatus`
sur chaque.

Attention perf : avec 10+ tenants × 5 queries counts28d, ça fait 50+
requêtes. Pour le MVP, accepter 1-2s (page rare). Note en commentaire
pour optimiser plus tard avec `$queryRaw GROUP BY siteId`.

### 3.2 Page /admin

Fichier : `analytics/app/admin/page.tsx` (nouveau — HORS du group
`(dashboard)` !)

Server component avec `await requireSuperadmin()`, render un tableau
tenants avec actions (Voir dashboard, Magic link, Rotate key, Sync GSC).

### 3.3 Layout /admin

Fichier : `analytics/app/admin/layout.tsx` (nouveau)

Guard + bandeau "Mode admin Veridian — cross-tenant".

### 3.4 Tenant switcher (header dashboard)

Fichier : `analytics/components/tenant-switcher.tsx` (nouveau)

Dropdown visible uniquement si `platformRole === 'SUPERADMIN'`. Sélection
→ pose le cookie `veridian_admin_as_tenant` + navigate `/dashboard`.

Modification de `(dashboard)/layout.tsx` pour injecter le switcher dans
le header si superadmin.

**Effort Phase 3** : 🟡 moyen (6-8h)
**Dépendances** : Phase 1 (role), endpoint magic-link peut être stub en
Phase 3 si Phase 2 pas finie.

## Phase 4 — Impersonation 🟡

Dépend de Phase 3.

### 4.1 Tenant resolver cross-tenant

Fichier : `analytics/lib/tenant-resolver.ts` (nouveau)

`resolveActiveTenant(session, asTenantSlug?)` retourne `{ tenant,
isImpersonating }`.

### 4.2 Modification user-tenant.ts

Ajouter signature overloaded `getUserTenantStatus(email, {
overrideTenantSlug?, requestingRole? })` backward-compatible.

### 4.3 Dashboard layout — lire cookie asTenant

Stocker dans le cookie `veridian_admin_as_tenant` (httpOnly, sameSite
lax, maxAge 1h) plutôt qu'en query param (qui se perd en navigation).

### 4.4 Bandeau d'impersonation

Fichier : `analytics/components/impersonation-banner.tsx` (nouveau)

"Mode admin — Vous consultez {tenantName}. [Retour à votre vue]" — le
bouton clear le cookie et redirect `/admin`.

### 4.5 Propagation aux pages dashboard

Créer un helper `getActiveTenantForSession()` dans
`lib/active-tenant.ts` qui encapsule (session + cookie + override
logic). Toutes les pages `dashboard/*` utilisent ce helper au lieu
d'appeler `getUserTenantStatus` direct.

**Effort Phase 4** : 🟡 moyen-large (6-10h)
**Dépendances** : Phase 3.

## Phase 5 — Tests 🟡

### 5.1 Unit tests

- `admin-guard.test.ts` — requireSuperadmin, isSuperadmin
- `tenant-resolver.test.ts` — override SUPERADMIN vs MEMBER
- `email.test.ts` — payload Brevo correct (mock fetch)
- `set-password/route.test.ts` — tokens valides/invalides/expirés/réutilisés

### 5.2 E2E tests

`admin-workspace.spec.ts` :

1. MEMBER sans role ne peut pas visiter /admin → redirect ou 403
2. SUPERADMIN visite /admin → voit la liste des tenants
3. SUPERADMIN clique "voir le dashboard" sur un tenant → redirect +
   bandeau impersonation visible
4. SUPERADMIN clear le cookie impersonation → retour sur son propre
   tenant

`magic-link.spec.ts` :

1. POST /api/admin/tenants/:id/magic-link avec x-admin-key → génère un
   token en DB + inviteUrl retourné
2. Visiter inviteUrl → page /welcome avec email pré-rempli
3. Submit password → redirect /dashboard avec session valide
4. Re-visiter inviteUrl → "lien déjà utilisé"

**Setup test** : créer un user MEMBER et un user SUPERADMIN en fixture,
via Prisma directement, avant chaque spec. Brevo mocké globalement.

**Effort Phase 5** : 🟡 moyen (6-8h)

## Annexe — Pièges et décisions actées

1. **Spike Auth.js email provider vs token custom** (30 min) — décision
   bloquante Phase 2
2. **Dual-auth `requireAdmin` vs server actions** — tranché : dual-auth
3. **Migration `platformRole`** — pas de risque tenants existants,
   default MEMBER. Commit body obligatoire : "Existing tenants: all
   users default to MEMBER, Robert doit être promu via script
   seed-superadmin.ts en post-deploy"
4. **Session 9 mois = risque sécu faible mais réel** — un cookie volé
   est valable 9 mois. Robert l'a demandé explicitement (UX), on le
   documente en commentaire dans `auth.config.ts`. Pas de rotation token
   implémentée en v1.
5. **Brevo API rate limit** — 300 req/min sur le plan free Veridian.
   Pas de souci pour les magic links (manuel, bas volume).
6. **Cookie impersonation** — nom : `veridian_admin_as_tenant`,
   httpOnly, sameSite lax, path `/`, maxAge 1h (pas 9 mois —
   l'impersonation est ponctuelle). Clear automatique au logout.
7. **Le middleware Edge ne peut pas lire `platformRole` de la DB** — le
   callback `jwt` tourne au login (Node runtime) et persiste dans le
   JWT. Le middleware (Edge) lit le JWT, donc OK. Mais si on révoque le
   SUPERADMIN en DB, le JWT reste valide jusqu'à expiration. Accepté
   pour v1.
8. **`/welcome` doit être hors du group `(auth)`** qui force le layout
   login, OU dans un nouveau group `(public-auth)`.
9. **La page `/admin` doit être hors du group `(dashboard)`** sinon elle
   hérite du layout qui guard via `getUserTenantStatus` (qui plante pour
   admin cross-tenant). Placement : `app/admin/` direct.
10. **Ne PAS toucher aux endpoints API admin existants côté Claude/skill**
    — le skill `analytics-provision` continue d'utiliser `x-admin-key`.
    L'UI utilise la session. Dual-auth = les deux cohabitent.

## Estimation globale

| Phase | Effort | Parallélisable avec |
|---|---|---|
| 1 — Fondations | 🟢 3-4h | — (séquentiel, bloque tout) |
| 2 — Magic link | 🔴 8-12h | Phase 3 |
| 3 — Admin UI | 🟡 6-8h | Phase 2 |
| 4 — Impersonation | 🟡 6-10h | — (besoin de 3) |
| 5 — Tests | 🟡 6-8h | au fil de l'eau |
| **Total** | **29-42h** | **~2-3 sessions Claude Code avec 3 agents parallèles** |

## Fichiers clés lus pour ce plan

- `prospection/src/app/invite/[token]/page.tsx` + `invite-accept-form.tsx`
- `prospection/src/lib/invitations.ts`
- `analytics/auth.ts`, `auth.config.ts`, `middleware.ts`
- `analytics/prisma/schema.prisma`
- `analytics/app/(auth)/login/page.tsx`
- `analytics/app/(dashboard)/layout.tsx`
- `analytics/lib/user-tenant.ts`, `tenant-status.ts`, `admin-auth.ts`
- `analytics/app/api/admin/tenants/route.ts`
- `analytics/app/api/admin/tenants/[tenantId]/status/route.ts`
- `todo/VISION-CROSS-APP.md` (problèmes #2 et #3)
