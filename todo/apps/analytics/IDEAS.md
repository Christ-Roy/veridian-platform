# Analytics — Idées Claude (hors sprint)

> Ce fichier reçoit les propositions de features que Claude fait au fur et
> à mesure qu'il bosse sur l'app. Elles ne sont PAS implémentées tant que
> Robert n'a pas donné son feu vert. Robert review ce fichier entre deux
> sprints, trie ce qu'il veut garder, et migre les retenues vers
> `TODO.md` ou `VISION.md`.
>
> Règle : Claude écrit ici dès qu'il a une idée pertinente qui dépasse la
> tâche en cours. Il ne l'implémente pas silencieusement. Il met un format
> court : contexte, idée, pourquoi c'est utile, impact estimé.
>
> Robert peut aussi y jeter des idées en vrac, même format libre.

## Format d'une entrée

```markdown
### YYYY-MM-DD — [catégorie] Titre court

- **Contexte** : ce qui m'a fait penser à ça en bossant sur X
- **Idée** : la proposition en 2-3 phrases max
- **Pourquoi c'est utile** : bénéfice concret pour Robert ou ses clients
- **Effort estimé** : 🟢 petit / 🟡 moyen / 🔴 gros
- **Status** : proposé / retenu / rejeté / archivé (noter la décision Robert)
```

Catégories possibles : `gamification`, `shadow-marketing`, `call-tracking`,
`gsc`, `ads`, `provisioning`, `ux-client`, `ux-admin`, `infra`, `tests`,
`sécurité`, `data-quality`.

---

## Idées en attente

### 2026-04-11 — [provisioning] Auto-créer un user client à la provisioning

- **Contexte** : en testant le nouvel endpoint `/status` sur Morel Volailles, j'ai vu que `tenant.members = []`. Aucun user n'est lié au tenant, donc aucun client ne peut se loguer sur son propre dashboard aujourd'hui.
- **Idée** : étendre `POST /api/admin/tenants` pour accepter optionnellement `{ clientEmail, clientPassword? }`. Si présent, créer un `User` + une `Membership` role MEMBER automatiquement. Si pas de password fourni, générer un magic-link ou un token d'invitation (mais pour le MVP : password temporaire + forcer reset au premier login).
- **Pourquoi c'est utile** : sans ça, le skill provisioning n'est pas complet — Robert devra créer le user à la main dans la DB ou via un second call. Or le but du skill c'est 0 friction.
- **Effort estimé** : 🟡 moyen (touche le schema, la route tenants, le flow auth, et il faut décider comment gérer le password initial)
- **Status** : proposé

### 2026-04-11 — [shadow-marketing] Bloc CTA dynamique par service inactif

- **Contexte** : l'endpoint `/status` retourne déjà `inactiveServices[]` pour chaque site. On a la data, reste à la brancher côté dashboard client.
- **Idée** : composant React `<ShadowMarketingBlock service="calls" />` qui affiche un bloc muté avec titre/description/CTA prédéfinis par service. Liste centralisée dans `lib/shadow-marketing.ts`. Chaque service a son argumentaire (exemple : "Trackez vos appels pour savoir quelles pages convertissent. À partir de 15€/mois. contact@veridian.site").
- **Pourquoi c'est utile** : c'est le moteur commercial de l'app (écrit dans VISION.md). Sans ce composant la gamification est juste cosmétique.
- **Effort estimé** : 🟢 petit (1 composant + 1 lib de textes, branchée dans la page home client)
- **Status** : proposé

### 2026-04-11 — [provisioning] Endpoint `GET /api/admin/tenants?slug=` pour résoudre id → slug

- **Contexte** : le path `/status` accepte déjà `id` ou `slug`, mais d'autres endpoints admin (PATCH/DELETE tenant, sites, etc.) exigent le cuid. Le skill doit pouvoir passer du slug à l'id.
- **Idée** : soit étendre tous les endpoints pour accepter slug (pénible), soit ajouter un `GET /api/admin/tenants?slug=morel-volailles-com` qui renvoie le tenant, et le skill stocke l'id localement.
- **Pourquoi c'est utile** : simplifier le flow Claude côté skill — une seule façon de résoudre un tenant.
- **Effort estimé** : 🟢 petit
- **Status** : proposé

### 2026-04-11 — [provisioning] Page admin Robert avec actions UI

- **Contexte** : Robert veut pouvoir agir sur un tenant client sans toujours passer par Claude. Typiquement : envoyer un magic link, rotate une site-key, re-sync GSC, voir le score, switcher de tenant.
- **Idée** : créer une page `/admin` (visible uniquement pour role `ADMIN`/`SUPERADMIN`) qui liste tous les tenants avec pour chacun :
  - Son score Veridian + services actifs
  - Bouton "Envoyer magic link" → génère token + envoie via Brevo/Notifuse
  - Bouton "Rotate site-key" → confirm + appelle l'endpoint existant
  - Bouton "Sync GSC maintenant" → déclenche sync + affiche l'état
  - Bouton "Ouvrir le dashboard client" (impersonation douce : loggue Robert sur le tenant client, avec un bandeau "mode admin")
- **Pourquoi c'est utile** : le skill Claude reste pour le provisioning et les actions rares, mais pour les actions quotidiennes Robert doit pouvoir faire 2 clics au lieu d'ouvrir un terminal.
- **Effort estimé** : 🟡 moyen — dépend du rôle admin (ajouter un champ `role` sur `User` ou utiliser `Membership.role`), de la page UI, et des endpoints (la plupart existent déjà via admin API).
- **Status** : proposé

### 2026-04-11 — [auth] Magic link "style Prospection" (email pré-rempli + session 9 mois)

- **Contexte** : onboarding des clients Analytics. Robert a précisé (2026-04-11) qu'il veut copier exactement le flow de Prospection : click sur le magic link → page d'onboarding avec email **pré-rempli** + demande de password pour les prochaines fois + session browser **9 mois** pour éviter les re-login.
- **Idée** :
  1. Activer le email provider Auth.js v5 (config SMTP Brevo)
  2. Créer une page `/welcome?token=...` qui valide le token, pré-remplit l'email, demande un password, hash + store, crée session longue durée
  3. Dans `auth.ts` : `session.maxAge = 9 * 30 * 24 * 60 * 60` (9 mois)
  4. Réutiliser le design du flow Prospection (`prospection/src/app/(auth)/`) au lieu de réinventer
- **Pourquoi c'est utile** : c'est le vecteur critique de conversion lead → utilisateur actif. Robert le veut identique à Prospection qui fait déjà ses preuves.
- **Effort estimé** : 🟡 moyen — copier/adapter depuis Prospection, tests, template email
- **Status** : proposé. Détaillé dans `todo/VISION-CROSS-APP.md` (problème #2).

### 2026-04-11 — [ux-admin] Workspace admin Robert cross-tenant

- **Contexte** : Robert est OWNER du tenant `veridian`, mais c'est aussi le SUPERADMIN de la plateforme. Il doit pouvoir voir tous les tenants configurés, leur data, et faire des actions (magic link, rotate key, sync GSC) sans passer par Claude à chaque fois.
- **Idée** : ajouter un rôle `SUPERADMIN` sur `User` (champ `role`), un switcher de tenant dans le header (visible uniquement si superadmin), une page `/admin` qui liste tous les tenants + actions, et une impersonation douce (query `?asTenant=<slug>`) pour voir le dashboard client avec un bandeau "Mode admin".
- **Pourquoi c'est utile** : Robert ne peut pas être dépendant de Claude pour chaque action quotidienne sur un tenant. Il faut une console admin self-service.
- **Effort estimé** : 🔴 gros — touche le schema (role), l'auth (guards SUPERADMIN), la page `/admin`, le switcher, l'impersonation, les tests. Mérite une vraie Team Claude Code.
- **Status** : proposé. Détaillé dans `todo/VISION-CROSS-APP.md` (problème #3). **Lié au magic link** (problème #2) — le workspace admin est l'UI qui déclenche les magic links.

### 2026-04-11 — [ux-client] Pages services lockées avec cadenas + unlock auto

- **Contexte** : Robert veut que toutes les pages d'un service non activé soient visibles mais verrouillées avec un cadenas, et que dès que l'API reçoit la 1ère data le service se débloque automatiquement.
- **Idée** : composant `<LockedServicePage service="forms" />` qui s'affiche quand `activeServices.includes('forms') === false`. Sidebar qui grise les items inactifs avec une icône lock. `dynamic = 'force-dynamic'` partout pour que l'unlock soit instantané au reload.
- **Pourquoi c'est utile** : UX gamifiée cohérente, le client voit ce qu'il pourrait avoir → pousse au CTA `contact@veridian.site` pour activer. Pas besoin d'un déploiement prod pour tester → aussitôt qu'un pageview est ingéré, tout s'unlock visuellement.
- **Effort estimé** : 🟢 petit — logique simple en server component + composant générique
- **Status** : **en cours d'implémentation par un agent Claude** (phase 2 du chantier shadow marketing, 2026-04-11)

---

## Idées retenues (passées en VISION.md ou TODO.md)

_(vide pour l'instant — on y déplace les idées validées en gardant
l'historique de la décision)_

---

## Idées rejetées

_(vide — on garde trace des refus pour éviter de re-proposer la même chose)_
