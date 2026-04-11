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

---

## Idées retenues (passées en VISION.md ou TODO.md)

_(vide pour l'instant — on y déplace les idées validées en gardant
l'historique de la décision)_

---

## Idées rejetées

_(vide — on garde trace des refus pour éviter de re-proposer la même chose)_
