# Analytics — Vision long terme (stratégie produit)

> **À lire avant de bosser sur une feature Analytics** en plus de `VISION.md`
> (le pourquoi immédiat) et `TODO.md` (les checkboxes du sprint en cours).
>
> Ce fichier est la **source de vérité stratégique** pour orienter les
> décisions techniques qui engagent le long terme (schema DB, API contracts,
> architecture de provisioning, factorisation cross-app). Quand tu codes
> une feature, demande-toi si elle s'inscrit dans cette vision ou si elle
> crée de la dette.
>
> Dernière mise à jour : 2026-04-14 (post-session Morel Volailles où la
> vision s'est clarifiée)

---

## Le contexte business complet

Robert opère **3 flux business parallèles qui se nourrissent mutuellement**.
Analytics est **le pivot** qui relie les trois.

### Flux 1 — Sites vitrines clients (cashflow rapide)

Robert crée des sites Next.js vitrines pour PME locales.

Clients actuels (en prod ou en provisioning) :
- **Morel Volailles** — grossiste volailles à Corbas, livré 2026-04-14
- **Tramtech Dépannage** — dépannage à domicile, campagne Google Ads active
- **Apical Informatique** — IT cabinets dentaires
- **Chatex** — machines industrielles
- **Arnaud Capitaine** — prospection
- D'autres à venir (1-2 par mois)

**Modèle économique** : création one-shot (300-800 € HT) + maintenance +
hébergement mensuel (80-150 €/mois). Le site seul justifie à peine le
prix pour le client — **c'est la suite qui crée la valeur récurrente**.

### Flux 2 — SaaS "pour soi d'abord, pour clients ensuite"

C'est là qu'Analytics se place.

**Pattern éprouvé chez Robert** :
1. Robert a un besoin perso (voir ses stats de sites clients)
2. Il code un outil interne (Veridian Analytics)
3. Il l'utilise lui-même quotidiennement
4. Au bout de quelques mois, l'outil est mature, éprouvé, valorisable
5. Chaque nouveau site vitrine = un tenant de plus sur l'outil = upsell
   vers le client sous forme de "dashboard de suivi inclus dans
   l'abonnement maintenance"
6. À terme, l'outil devient un produit revendable à d'autres agences web
   qui veulent proposer la même offre à leurs propres clients

### Flux 3 — Infrastructure mutualisable (le vrai moat)

- **Monorepo `veridian-platform/`** avec toutes les apps partagées
- **Skills Claude** pour provisionner en < 30 min par client
- **Stack maison éprouvée** : Next.js 15, Prisma + Postgres dédié,
  Auth.js v5, Cloudflare Pages, Dokploy, Brevo, Telnyx/OVH SIP
- **Monitoring `/opt/veridian/monitoring/`** + alertes Telegram

Chaque brique Analytics doit être pensée pour s'intégrer dans cette
infra, pas comme une app isolée.

---

## Pourquoi Analytics est le pivot

Analytics est le **seul SaaS qui touche tous les clients sites vitrines
dès le jour 1**. Quand Robert livre un site, il branche automatiquement
Analytics (via skill `analytics-provision`). Le client a donc, sans
effort marketing, un dashboard avec son logo, ses stats, ses formulaires.

Cette visibilité permanente sert plusieurs objectifs :

**1. Rétention maintenance**
Le client qui voit son dashboard Analytics chaque semaine ne résilie
pas la maintenance — il voit la valeur en live. Le site seul serait
oubliable, le dashboard est engageant.

**2. Upsell naturel**
Chaque service inactif sur le dashboard (call tracking, Google Ads,
PageSpeed monitoring) affiche un CTA `contact@veridian.site`. Le
"shadow marketing" tourne en permanence sous les yeux du client.

**3. Données pour les RDV commerciaux**
RDV trimestriels avec le client ("suivi de performance") = Analytics
sort un rapport automatique. Robert ne perd pas 2h à préparer, il
ouvre le dashboard et il a tout. Le client voit l'évolution et est
demandeur pour plus de services.

**4. Argument de vente pour les prospects**
Quand Robert pitche un nouveau site à un prospect, il montre le
dashboard d'un client existant. C'est concret, palpable, vendeur.

**5. Base de revente à d'autres agences**
À terme, Analytics devient "la plateforme que vous utilisez avec
vos propres clients" — pas juste un outil perso. L'architecture
multitenant + skill de provisioning prépare directement ce futur.

---

## Les 4 horizons temporels

### Horizon 1 — Maintenant (sprint en cours, voir TODO.md)

**Phase A : MVP déployable aux 3 premiers clients.**

Tramtech, Morel, Apical. Scope strict, dashboard gamifié, provisioning
< 5 min via skill. Call tracking basique. Deploy prod.

Ce qui compte **ici** : rien de ce qui est ajouté ne doit empêcher les
3 clients d'utiliser leur dashboard demain.

### Horizon 2 — 3 mois (T2 2026)

**Objectif** : Robert tient son premier "RDV de suivi performance"
avec Jean-Marc Morel. Il arrive avec un rapport automatique qui dit :
- Trafic de votre site : X visiteurs uniques en 3 mois, +Y% vs mois 1
- Vos mots-clés SEO : top 10 requêtes, évolution position
- Vos formulaires : N leads captés, produits les plus demandés
- Votre PWA a été installée par 20 personnes (poc e-commerce B2B à venir)
- Recommandation Veridian : activer Google Ads pour pousser X

Pour y arriver, il faut que **Phase F (qualité data) et Phase E (PWA)
soient en prod**. Pas forcément parfaits, mais live et utilisables.

**Ce qui doit être prêt dans 3 mois** :
- Phase A complète (dashboards scopés, provisioning skill, prod déployée)
- Phase F.1 + F.4 + F.6 (visiteurs uniques stables, schema enrichi,
  tests de tracking automatiques pour garantir la fiabilité)
- Phase E.1 (PWA installable sur site client avec branding propre)
- Au moins 2 RDV trimestriels tenus avec données réelles

**Coups durs à éviter** :
- Lancer PWA sans F.1 (data polluée par bots = chiffres "20 installs"
  pas crédibles)
- Deploy prod sans tests tracking (F.6) = aucune boucle de feedback,
  bugs découverts en RDV client = catastrophe
- Ajouter des features à Phase A "au cas où" au lieu de shipper
  strictement le MVP promis

### Horizon 3 — 12 mois (T1 2027)

**Objectif** : Analytics devient un produit autonome vendable.

Ce que ça implique :
- **Self-service onboarding partiel** : un prospect (PME) peut demander
  un devis via veridian.site, remplir ses infos basiques, Robert clique
  sur "créer le tenant" et le magic link part automatiquement au client.
  L'utilisation du skill `analytics-provision` via Claude reste pour
  les cas sur-mesure, mais le flow courant est UI-driven.
- **Pricing explicite** : une page pricing sur veridian.site avec 3
  formules (essentiel 29€/mois, pro 79€/mois, custom sur devis). Le
  pro inclut Analytics + Prospection + Notifuse. Le custom inclut
  hébergement, SEO, support 24/7.
- **Onboarding client 100% autonome** : magic link → setup domaine →
  preuve de propriété (DNS TXT) → tracker snippet pré-rempli à coller
  → check automatique que ça marche → "bienvenue, voici vos stats"
- **Premier client "externe"** : quelqu'un qui n'est pas un site vitrine
  Veridian, qui vient d'une reco ou d'une démo, et qui paie pour
  Analytics uniquement. C'est le jalon qui prouve que ça tient debout
  en standalone.

**Features qui doivent exister à T1 2027** :
- Toute la Phase F (data quality + audit API + funnel + user linking)
- Toute la Phase E (PWA installable + push notifications + métriques
  DAU/WAU/MAU)
- Google Ads tracking (Phase C)
- PageSpeed monitoring hebdo (Phase C)
- Rapport PDF mensuel auto-généré et envoyé par mail
- Comparaisons de période (mois vs mois-1, année vs année-1)
- Segments SEO brand vs non-brand
- Export CSV

### Horizon 4 — 24-36 mois (revente plateforme)

**Objectif** : Veridian devient packageable pour d'autres petites agences.

Modèle envisagé :
- Licence white-label : une agence web paie 200-500€/mois pour avoir
  Analytics sous sa propre marque, avec son propre domaine et ses
  propres clients
- Ou : hébergement managé Robert avec les agences comme revendeurs

Pour y arriver, il faut que :
- L'app soit **vraiment multitenant** (pas de fuite cross-tenant, audit
  de sécurité tiers)
- Le provisioning passe par une API publique propre (pas seulement le
  skill Claude interne)
- La doc soit publique et maintenue
- Le produit ait une vraie identité de marque (logo, ton, design)

---

## Conséquences sur la façon de coder Analytics

### Règles non-négociables

**1. Multitenant strict partout.**
Chaque query DB filtrée par `tenantId` → `siteId[]`. Chaque endpoint
admin authentifié via `x-admin-key` ou session SUPERADMIN. Un oubli
de scope = fuite de data entre clients = fin du projet.

**2. Provisioning < 30 min par client, toujours.**
C'est le KPI ultime. Si une feature prend 2h par client à activer, elle
est cassée. Le skill `analytics-provision` est la source de vérité — si
on ne peut pas l'ajouter via skill, on ne la code pas.

**3. Robert est le premier utilisateur.**
Avant de coder une feature "pour les clients", Robert doit l'utiliser
sur `veridian-site` tenant pendant au moins 1 semaine. Si elle ne lui
sert pas à lui, elle ne servira pas aux clients.

**4. Pas de code spécifique à un client dans le core.**
Si Morel a un besoin particulier (ex: breakdown par catégorie produit),
c'est via un `FormSchema` déclaratif en DB, pas un `if (tenantId ===
'morel')` dans le code. Le core code doit être générique à 100%.

**5. Zéro Supabase, zéro dépendance managed cher.**
Tout tourne sur l'infra Veridian (Postgres dédié, Cloudflare Pages,
Dokploy). Pas d'Airtable, pas de Firebase, pas de Auth0. Robert doit
pouvoir maintenir en solo.

**6. Chaque nouvelle feature doit avoir des tests F.6 associés.**
Règle apparue post-POC Morel : on ne livre pas une feature tracking
sans qu'un test automatique vérifie qu'elle remonte bien. Sinon on
découvre les bugs 2 semaines après au RDV client.

### Anti-patterns à bannir

**❌ "On verra après"**
Si un refactor schema DB est repoussé, il devient impossible (migration
multitenant en prod = cauchemar). Penser les schemas pour 12 mois dès
qu'on les touche.

**❌ "MVP minimal" pour des features fondatrices**
La PWA, le provisioning, le scope auth : pas de MVP bâclé. Ce sont les
fondations du produit vendable.

**❌ Coupler Analytics à un site client**
Analytics doit être indépendant. Si un site client meurt, Analytics
continue. Si Analytics meurt, le site client continue à fonctionner
sans tracker.

**❌ Ajouter des features côté dashboard avant d'avoir la data en DB**
Toujours : schema → ingestion → stockage → UI. L'inverse (UI d'abord
avec fake data) finit en dette.

**❌ Traiter les data polluées par les bots comme de la vraie data**
La Phase F est prioritaire avant tout ajout de métriques. Sinon chaque
nouveau graphique montre des chiffres faux, c'est pire qu'aucun graphique.

### Patterns à répéter

**✅ Skill Claude pour chaque flow récurrent**
Provisioning, sync GSC, audit qualité, lancement de rapport PDF → tout
via skill Claude mémorisé. Robert ne doit jamais avoir à re-apprendre
comment faire.

**✅ Un endpoint `/status` par entité**
Pattern éprouvé sur `/api/admin/tenants/:id/status` — un call = tout
l'état consolidé. À répliquer pour chaque sous-ressource (sites, leads,
campaigns à terme).

**✅ Retention + purge automatique dès le jour 1**
Ne jamais stocker "pour toujours". Chaque table a une retention définie
et un cron qui purge. Sinon Postgres gonfle, les requêtes lentes
arrivent, on refactore en panique.

**✅ Dry-run pour chaque action destructive ou engageante**
Envoi magic link, purge tenant, rotate site-key, envoi push notif →
toujours un mode `dryRun: true` qui renvoie ce qui serait fait sans
le faire. Évite les catastrophes.

**✅ Shadow marketing dans chaque page dashboard**
Chaque service non actif chez un client → bloc muté avec CTA vers
Robert. Principe commercial écrit dans VISION.md, doit être systématique.

---

## Articulation avec les autres apps Veridian

### Prospection (CRM perso de Robert)

Prospection est le **CRM que Robert utilise lui-même** pour traquer ses
prospects sites vitrines et Ads. Analytics et Prospection se croisent :

- Un prospect dans Prospection qui signe → devient un Tenant dans Analytics
- Les leads Analytics (venant des form submit des sites clients) peuvent
  remonter dans Prospection si Robert veut les traiter
- La PWA qui se développe sur Prospection (calendrier + rappels + push)
  **sert de laboratoire pour la PWA Analytics** — mêmes VAPID keys,
  même infra push, même service worker client partagé dans `analytics/`

À long terme, on peut imaginer un **onglet Prospection dans le dashboard
Veridian unique** (au moment où Hub devient un vrai workspace cross-app).

### Hub (futur)

Le Hub est prévu comme front unifié (veridian.site). À terme, Analytics
devient un module du Hub. Pour l'instant, Analytics est autonome sur
son subdomain `analytics.app.veridian.site`.

### Notifuse + Brevo (email)

Analytics utilise Brevo pour le magic link et les rapports mensuels
auto. À long terme, passage sur Notifuse (auto-hébergé) possible si
le volume devient gros.

### Twenty CRM (en prod chez Robert)

Twenty CRM est installé mais peu utilisé aujourd'hui. Pas de lien direct
avec Analytics pour l'instant. À étudier si un client demande un CRM
packagé.

---

## Métriques de succès long terme

**3 mois** :
- 3 clients actifs avec dashboards remplis de vraie data
- 2 RDV trimestriels tenus avec rapport Analytics
- 1 upsell déclenché grâce au shadow marketing
- Au moins 20 installs PWA cumulés

**12 mois** :
- 10+ clients actifs
- 1 client "externe" (non-site-vitrine-Veridian) payant pour Analytics
- Revenue récurrent Analytics > 1500 €/mois
- Pricing page publique, onboarding semi-autonome
- Page `/admin` stable sans nécessiter Claude pour les actions quotidiennes

**24-36 mois** :
- 30+ clients
- Première agence web en white-label
- Revenue récurrent > 5000 €/mois
- Produit packageable avec doc publique

---

## Évolution de ce fichier

Ce fichier est **relu par Claude au début de chaque session qui touche
Analytics**. Il doit rester court (< 500 lignes), stratégique (pas
tactique), et orienté décisions.

Quand on prend une décision structurante :
- Si elle change une règle non-négociable → mise à jour ici
- Si c'est un arbitrage tactique → TODO.md ou IDEAS.md
- Si c'est un choix d'implémentation → code + commentaires dans le code

Claude doit **signaler** quand une feature demandée va à l'encontre de
ce document (ex: "la feature X crée du code spécifique au client Y,
voir LONG-TERM-VISION.md section Anti-patterns"). Il ne bloque pas,
mais il prévient.

---

## Annexe — checklist rapide avant de coder

Avant de coder une feature Analytics, se poser **5 questions** :

1. **Multitenant clean** : ma query filtre bien par `tenantId` ?
2. **Provisioning < 30 min** : cette feature s'active via skill Claude ou
   demande du code custom par client ?
3. **Robert l'utilise** : est-ce que c'est une feature que Robert va
   toucher dans sa première semaine ?
4. **Retention** : les data stockées ont une date d'expiration claire ?
5. **Test F.6** : un test automatique vérifie que ça remonte bien ?

Si les 5 réponses sont OUI → coder. Si une réponse est NON → remonter
à Robert avant d'écrire la moindre ligne.
