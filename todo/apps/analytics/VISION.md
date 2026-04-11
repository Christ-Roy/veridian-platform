# Analytics — Vision & plan en langage naturel

> Ce fichier est la source de vérité "pourquoi" de l'app Analytics. Toutes les
> décisions techniques et de priorité doivent être cohérentes avec ce document.
> Quand Robert dicte une nouvelle orientation, on met à jour ce fichier *avant*
> de toucher au code ou au TODO. L'IDEAS.md à côté reçoit les propositions
> hors sprint que Claude fait en avançant.
>
> Dernière mise à jour : 2026-04-11

## Ce que c'est, en une phrase

Un dashboard de métriques sur-mesure que Robert donne à ses clients pour qui
il a fait un site web, pour leur montrer ce que leur site produit (trafic,
formulaires, appels, SEO), et accessoirement pour leur vendre des services
supplémentaires.

## Ce que ce n'est PAS

- **Pas un vrai SaaS destiné à scaler** à 10 000 clients en libre-service.
  C'est un outil interne de Robert qui le distribue manuellement à SES
  clients, un par un, pour qui il fait déjà du travail sur-mesure.
- **Pas un concurrent de Matomo / Plausible / GA4**. C'est un dashboard
  agrégé qui mélange tracking site + GSC + call tracking + conversions
  Google Ads (à terme), pensé pour un client PME qui ne veut pas jongler
  entre 4 outils.
- **Pas une app qui doit supporter de la concurrence ou du load**. Robert
  a ~5-10 clients max en tête, pas 500. On optimise pour la simplicité
  d'ajout et d'adaptation, pas pour la perf à l'échelle.
- **Pas un produit commercialisé en standalone**. Pas de signup public,
  pas de pricing page côté Analytics. Le provisioning passe par Robert
  (via Claude + skill dédié, cf plus bas).

## Pour qui et comment on l'utilise

### Les clients de Robert

Les utilisateurs finaux sont les clients PME pour qui Robert a fait un site
web (+ maintenance + éventuellement campagne Google Ads + SEO). Ils se
connectent sur leur tenant et voient UNIQUEMENT leur data, scopée par domaine.

Clients actifs en 2026-04-11 :
- **Tramtech Dépannage** (`tramtech-depannage.fr`) — client principal,
  vrai trafic SEO (2779 rows GSC sur 90j), campagne Google Ads à venir
- **Morel Volailles** (`morel-volailles.com`) — petit commerce, 137 rows GSC
- **Apical Informatique** (`apical-informatique.fr` ou domaine à confirmer)
  — pas encore d'historique GSC connu dans l'app

D'autres clients seront ajoutés au fil de l'eau (1-2 par mois max). Chaque
ajout doit être trivial pour Robert.

### Robert lui-même

Robert est admin global. Il voit tous les tenants, provisionne, lie les
propriétés GSC, configure les numéros d'appel, etc. Tout se fait via Claude
+ un **skill dédié** (à créer) qui automatise :
- Création tenant + site
- Génération site-key pour le tracker
- Liaison d'une propriété GSC au site
- Configuration des numéros d'appel à tracker
- Injection du snippet tracker dans le site du client (via Dokploy ou manuellement)

## Ce que l'app doit faire (MVP)

### Socle technique déjà en place

- ✅ Next.js 15 + Prisma + Postgres dédié (pas de Supabase)
- ✅ Auth.js v5 credentials
- ✅ Multitenant dès le jour 1 (Tenant → Site → data)
- ✅ Admin API (`x-admin-key`) pour provisionner depuis l'extérieur
- ✅ Tracker JS public (`/tracker.js`) — pageview + form intercept + SPA
- ✅ Ingestion `pageview`, `form`, `call`, `gsc` (avec `x-site-key`)
- ✅ Schéma `GscDaily` avec toutes les dimensions Google
- ✅ Clone du dashboard GSC Performance (6 dimensions, filtres, KPIs, graph)
- ✅ Intégration Google API pour sync GSC (ADC, quota project `veridian-preprod`)

### Ce qui manque pour que le MVP soit "donnable aux 3 clients"

1. **Scope tenant → domaine strict**. Aujourd'hui Robert voit tout parce
   qu'il est OWNER du tenant `veridian`. Il faut que quand un client
   `tramtech` se loggue, il ne voie QUE ses données, filtrées par son
   domaine. C'est bloquant P0.

2. **Provisionnement simple par skill Claude**. Robert veut un skill qui
   prend en entrée `{ nom, domaine, email client, numéro(s) à tracker,
   propriété GSC }` et qui fait tout le reste (create tenant, create site,
   attach GSC, sync initial, génère le snippet tracker à coller). Objectif :
   un nouveau client = 5 minutes. Voir la section "Provisioning programmatique"
   plus bas pour l'architecture détaillée.

3. **Call tracking basique sans SIP**. Pas d'installation SIP côté client
   pour le MVP. On affiche un numéro dédié sur le site (soit ovh voice,
   soit Telnyx — à décider), et on track les appels via l'API de fourniture
   (OVH voiceConsumption ou Telnyx Call Control). Ingestion via
   `/api/ingest/call`, existe déjà côté schema.

4. **Formulaires trackés**. Le tracker.js intercepte déjà les form submits
   si on les tag `data-veridian-track`. Il faut livrer à chaque client un
   snippet prêt à coller et documenter comment taguer ses formulaires.

5. **GSC lié par client, scope domaine**. Chaque site a sa propriété GSC
   attachée. Les dashboards GSC filtrent par `siteId` (déjà le cas dans
   `/dashboard/gsc`). Vérifier que la data qui remonte est bien scopée au
   domaine du client loggé.

6. **Page d'accueil gamifiée par client**. Quand un client se loggue, il
   arrive sur une page "Mon score Veridian" qui agrège un score de
   performance basé sur les services actifs :
   - Trafic SEO → note sur les clicks GSC 28j + évolution
   - Formulaires → volume de leads + tendance
   - Appels → volume d'appels entrants trackés + tendance
   - Campagnes Ads → (si activées) ROAS + conversions
   - Vitesse site → (si activé) score PageSpeed
   
   Chaque service donne des points. Score = somme pondérée. Plus c'est haut,
   plus c'est "vert".

6bis. **Lock/unlock des pages par service**. Tous les services qui ont leur
   propre page (/dashboard/calls, /dashboard/forms, /dashboard/gsc, et plus
   tard /dashboard/ads, /dashboard/pagespeed) sont **verrouillés** quand le
   service est inactif (aucune data ingérée). Côté UX :
   - Icône cadenas en overlay
   - Titre muté
   - Texte explicatif : "Débloquez cette page en activant le service"
   - CTA `contact@veridian.site` ou bouton "Demander à activer"
   - Dans la sidebar, l'entrée est présente mais grisée avec un petit cadenas
   
   Dès que la 1ère data arrive (premier pageview pour forms, premier
   SipCall pour calls, première GscDaily row pour gsc), la page s'unlock
   automatiquement au prochain rafraîchissement. **Pas de cache Next
   agressif** sur la sidebar ni sur les pages (force-dynamic) pour que
   l'unlock soit visible immédiatement quand Robert provisionne via Claude
   pendant que le client est loggué. Côté API, la source de vérité est
   déjà `tenant-status.activeServices[]` — il suffit de brancher le
   guard côté layout/page.

7. **Shadow marketing pour les services non actifs**. Pour chaque service
   non activé chez un client, on affiche un bloc muté "Débloquer ce service
   — contact@veridian.site". Exemple : Tramtech n'a pas encore de suivi
   Google Ads activé → sur leur dashboard on montre un bloc gris avec un
   slogan genre "Multipliez vos conversions avec un suivi Google Ads dédié
   — contactez contact@veridian.site pour activer". C'est un call-to-action
   silencieux qui tourne en permanence sous les yeux du client.

## Provisioning programmatique (clé du flow Robert)

C'est LE point névralgique du MVP. Robert ne veut PAS perdre le flow pendant
qu'il code un site web client pour jongler entre 15 appels API, retrouver
des IDs, lire une doc et coller des snippets à la main. L'hypothèse forte :

> **Quand Robert livre un site, il invoque un skill Claude, donne le domaine,
> et en sortie il a : le snippet tracker à coller, l'état complet du tenant,
> et tout ce qu'il lui reste à faire listé précisément.**

Aucun clic dans une UI admin. Aucun retour en arrière. Aucun "je reprendrai
plus tard". C'est 2 minutes max dans le flow, sinon le skill est raté.

### Architecture du skill

Le skill vit dans `~/.claude/skills/analytics-provision/SKILL.md` (global,
synchronisé via Syncthing sur les 3 machines). Il contient :

- **L'URL admin API** et la clé (`ANALYTICS_ADMIN_KEY` dans `~/credentials/.all-creds.env`)
- **La liste exhaustive des endpoints** avec leur contrat (input/output) pour
  que Claude sache directement quoi appeler sans explorer le code
- **Les flows types** : "nouveau client", "brancher GSC sur client existant",
  "rotate site-key", "check état tenant"
- **Les snippets tracker prêts à coller** avec variables (`{{SITE_KEY}}`,
  `{{DOMAIN}}`) que Claude remplit
- **Un script exemple** shell ou Node qui fait un provisioning complet de
  bout en bout, utilisable en copier-coller
- **Un troubleshooting** : erreurs courantes et solutions

Le skill est **auto-mis-à-jour par Claude** : chaque fois qu'on ajoute un
endpoint ou qu'on découvre un gotcha, on met à jour SKILL.md. Robert n'a pas
à le maintenir lui-même.

### Endpoint `GET /api/admin/tenants/:id/status` (nouveau, P0)

C'est la pièce qui change tout. Au lieu que Claude appelle 5 endpoints
(`GET tenant`, `GET sites`, `GET gsc`, `GET counts pageview`, `GET counts form`…)
pour recoller l'état d'un tenant, on expose **un seul endpoint d'état
consolidé** qui retourne tout en une fois :

```json
{
  "tenant": { "id", "slug", "name", "createdAt" },
  "sites": [
    {
      "id", "domain", "name", "siteKey",
      "gscProperty": { "propertyUrl" } | null,
      "counts28d": {
        "pageviews": 142,
        "formSubmissions": 3,
        "sipCalls": 0,
        "gscRows": 137,
        "gscClicks": 42,
        "gscImpressions": 1840
      },
      "activeServices": ["pageviews", "forms", "gsc"],
      "inactiveServices": ["calls", "ads", "pagespeed"],
      "trackerSnippet": "<script src=\"https://.../tracker.js\" data-site-key=\"sk_...\" data-veridian-track=\"auto\" async></script>",
      "nextSteps": [
        "Coller le snippet tracker dans le <head> du site",
        "Taguer les formulaires avec data-veridian-track=\"contact\"",
        "Activer le call tracking (numéro dédié à configurer)",
        "Lier une propriété Google Ads pour le suivi campagne"
      ]
    }
  ]
}
```

Claude lit ça, remplit son contexte en un call, et sait immédiatement ce
qu'il y a à faire. Robert voit un récap propre dans le terminal. Aucune
recherche manuelle dans la DB.

**Services "activables" détectés automatiquement** (pour la gamification et
le shadow marketing côté dashboard client) :

| Service | Critère d'activation |
|---|---|
| `pageviews` | Tracker.js a envoyé au moins 1 pageview |
| `forms` | Tracker.js a capté au moins 1 form submit |
| `calls` | Au moins 1 SipCall ingéré pour ce site |
| `gsc` | Une `GscProperty` est attachée ET des rows GscDaily existent |
| `ads` | (futur) clé API Google Ads attachée au tenant |
| `pagespeed` | (futur) score PageSpeed mesuré dans les 7 derniers jours |

Les services absents apparaissent dans `inactiveServices` et deviennent du
shadow marketing côté UI client (bloc muté "Débloquer ce service").

### Ce que le skill fait automatiquement

Pour un **nouveau client** :

1. `POST /api/admin/tenants` → crée le tenant
2. `POST /api/admin/tenants/:id/sites` → crée le site, récupère la `siteKey`
3. Si une propriété GSC est fournie : `PUT /api/admin/sites/:id/gsc` → attache
4. Si GSC attachée : `POST /api/admin/gsc/sync` avec `days=28` → sync initial
5. `GET /api/admin/tenants/:id/status` → récap final
6. Affiche le snippet tracker dans le terminal, prêt à coller

Pour un **client existant** (update, rebrancher GSC, rotate key…) :

1. `GET /api/admin/tenants/:id/status` → point de départ
2. Diff avec les actions demandées → liste des calls à faire
3. Exécute les calls manquants
4. Re-status final pour confirmer

### Ce que Robert n'a PAS besoin de faire

- Connaître les IDs (le skill résout par slug ou domaine)
- Connaître les endpoints (c'est dans SKILL.md, Claude lit)
- Mémoriser le format des snippets (Claude les génère)
- Aller voir la DB pour savoir où en est un tenant (status endpoint)
- Écrire du code à la main pour brancher un formulaire (le snippet le fait
  auto via `data-veridian-track`)

## Roadmap feature par feature (ordre actuel)

Cette roadmap est une vision, pas un contrat. L'ordre peut bouger. Chaque
feature est une étape indépendante qu'on peut shipper sans casser le reste.

### Phase A — MVP déployable aux 3 clients (priorité absolue)

1. **Provisionner Tramtech, Morel Volailles, Apical** en DB (tenants + sites +
   GSC proprement attachée). Vérifier que chaque tenant voit sa data et
   uniquement sa data.
2. **Scope auth multi-tenant strict**. Quand un user se loggue, ses queries
   GSC/forms/calls/pageviews sont filtrées par `tenantId` → `siteId` auto.
   Robert garde un "mode admin" (rôle `ADMIN` ou `SUPERADMIN`) qui lui donne
   accès à tous les tenants + la possibilité de switcher de tenant au
   top du header.
3. **Skill Claude de provisioning**. Un `.claude/rules/` ou un skill global
   qui encapsule le flow (voir "Provisionnement simple par skill" plus haut).
   **Déjà livré** (voir `~/.claude/skills/analytics-provision/SKILL.md`).
4. **Magic link pour onboarding client**. Robert clique sur un bouton dans
   son admin (ou déclenche via skill), ça génère un lien signé à usage
   unique (expire 7j), l'envoie automatiquement au client via Brevo ou
   Notifuse. Le client clique, arrive loggé sur son dashboard sans avoir
   à créer de mot de passe. Auth.js v5 supporte déjà le email provider
   (magic link natif). Voir `todo/VISION-CROSS-APP.md` pour la réflexion
   plus large sur l'onboarding.
5. **UI admin Robert**. Une page `/admin` (visible uniquement pour le
   rôle `ADMIN`) avec :
   - Liste de tous les tenants + état (score, services actifs)
   - Boutons d'action rapide : envoyer magic link, rotate site-key,
     sync GSC on-demand, éditer propriété GSC, voir les counts
   - Permet à Robert de ne PAS toujours passer par Claude quand il
     veut faire une action rapide sur un client existant
6. **Page d'accueil client gamifiée**. Score de perf, shadow marketing pour
   services non actifs. **En cours** (agent dédié qui bosse dessus).
7. **Call tracking basique**. Un numéro par client, synchro API OVH ou
   Telnyx, affichage dans `/dashboard/calls` (scope tenant).
8. **Docs d'intégration client**. Un `analytics/docs/integration.md` que
   Robert copie-colle pour expliquer au client comment intégrer le tracker
   (snippet tracker.js + tag formulaires).
9. **Deploy prod** sur `analytics.app.veridian.site` via Dokploy.

### Phase B — Après les 3 premiers clients

- Sync GSC automatique via cron sur dev-server ou prod (aujourd'hui c'est
  manuel depuis le laptop de Robert)
- Alerte Telegram si un form submit arrive d'un client (notif Robert pour
  savoir quand un lead tombe)
- Export CSV pour que le client puisse récupérer sa data
- Comparaison de période (28j vs 28j précédents)
- Segments brand vs non-brand sur GSC

### Phase C — Extension business

- **Suivi Google Ads**. Une fois la campagne Tramtech lancée, on ajoute
  l'API Google Ads pour remonter impressions/clicks/coût/conversions dans
  le dashboard Tramtech. Ça devient le premier "service payant" visible
  dans le score + shadow marketing pour les autres clients.
- **Vitesse du site** via Google PageSpeed API. Cron hebdo qui roule un
  audit sur chaque site, stocke le score, affiche dans le dashboard.
- **Suivi position SEO sur mots-clés cibles**. Robert définit 5-10 mots
  clés par client, on track la position chaque jour via GSC.
- **Upsell visible**. Bloc "Recommandations" sur le dashboard client qui
  affiche 2-3 suggestions personnalisées en fonction des métriques
  (exemple : "votre trafic stagne, testez une campagne Ads").
- **Rapport mensuel PDF**. Un bouton qui génère un PDF propre avec les
  métriques du mois, à envoyer au client en email récap.

### Phase D — Si pertinent

- SIP réel (rtpengine + pool de numéros) si le call tracking via API
  tiers atteint ses limites (attribution par page, etc.)
- Intégration Matomo ou heatmaps (Hotjar) pour pousser plus loin
- API publique pour que les clients puissent exporter leurs data par
  programme (peu probable, on verra si un client demande)

## Philosophie d'exécution

- **Sur-mesure assumé**. Chaque client peut avoir 1-2 spécificités
  (numéro différent, propriété GSC spéciale, métrique custom). On code
  avec cette hypothèse, pas pour du standard.
- **Pas de complexité gratuite**. Pas de Kubernetes, pas de
  feature-flag, pas de microservices. Un seul Next.js, un seul Postgres,
  un seul container.
- **Provisioning via Claude, pas via UI client**. Robert n'a PAS besoin
  d'une UI d'admin jolie pour créer un tenant — il va utiliser un skill
  Claude à chaque fois. L'UI admin existe surtout pour que Claude puisse
  appeler les endpoints, pas pour que Robert clique.
- **Shadow marketing systématique**. Chaque dashboard client doit avoir
  au moins un bloc visible de "service non activé, contactez-nous". C'est
  le moteur commercial de l'app — chaque login client = une impression
  publicitaire passive pour les services que Robert peut vendre en plus.
- **Badge BETA**. Tant que les 3 clients ne sont pas contents, on garde
  un petit "BETA" discret dans le header. Ça excuse les bugs et ça évite
  les attentes corporate.

## Règles inter-app

- Analytics est une boîte noire API-only. Le Hub peut provisionner via
  l'Admin API mais n'a aucune dépendance runtime (si Analytics tombe, le
  Hub continue de tourner).
- Zéro Supabase. Auth locale Auth.js credentials.
- Chaque app du monorepo a son propre auth → pas de SSO pour le MVP.
