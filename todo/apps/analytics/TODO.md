# Analytics — TODO sprint courant

> **Lire avant de bosser sur Analytics** :
> 1. [`VISION.md`](./VISION.md) — le "pourquoi" et la roadmap langage naturel
> 2. Ce fichier — les checkboxes actionnables du sprint en cours
> 3. [`IDEAS.md`](./IDEAS.md) — propositions Claude hors sprint (à reviewer)
> 4. [`UI-REVIEW.md`](./UI-REVIEW.md) — file d'attente UI polish solo
>
> Source de vérité strategique globale : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
>
> Dernière mise à jour : 2026-04-14 (ajout Phase F — Data quality & effet wow)

## État actuel

- **Status** : 🟡 **PRIORITÉ ABSOLUE P0** — MVP en construction pour déploiement aux 3 premiers clients
- **Instance dev** : `http://100.92.215.42:3100` (dev-server via Tailscale)
- **Login dev** : `robert@veridian.site` / `test1234`
- **Tenant admin dev** : `veridian` (role OWNER)
- **URL prod cible** : `https://analytics.app.veridian.site` (pas encore déployé)
- **Image Docker** : `analytics:poc-admin-local` (testée localement, pas push GHCR)

### Data en DB (2026-04-11)

| Tenant (slug) | Domaine | GSC rows 90j | Client réel ? |
|---|---|---|---|
| `veridian` | veridian.site | 229 | Interne |
| `arnaudcapitaine-com` | arnaudcapitaine.com | 15 | Interne |
| `app-veridian-site` | app.veridian.site | 2 | Interne |
| `tramtech-depannage-fr` | tramtech-depannage.fr | 2779 | ✅ **Client actif** |
| `morel-volailles-com` | morel-volailles.com | 137 | ✅ **Client actif** |
| ` ` (à créer) | apical-informatique.fr | - | ✅ **Client à provisionner** |

## Sprint courant — Phase A (MVP déployable aux 3 clients)

Objectif : livrer les dashboards aux 3 clients réels (Tramtech, Morel, Apical)
avec une expérience scopée, gamifiée, et avec shadow marketing.

### 1. Provisionner les 3 vrais clients

- [ ] Confirmer que `tramtech-depannage-fr` est bien un tenant "client" et pas juste un tenant test
- [ ] Confirmer que `morel-volailles-com` idem
- [ ] Créer le tenant `apical-informatique` + site (domaine à confirmer avec Robert)
- [ ] Créer un user client pour chacun (email Robert pour l'instant, change à la demande)
- [ ] Attacher la propriété GSC pour Apical si elle existe
- [ ] Sync GSC 90j pour chaque client → vérifier volumes

### 2. Scope tenant strict dans les dashboards

- [ ] Quand un user (non-admin) se loggue, les queries GSC/forms/calls/pageviews
      sont automatiquement filtrées par son `tenantId` → liste de `siteId`
- [ ] Robert (admin) garde l'accès multi-tenant : sélecteur de tenant dans le header
- [ ] Tests e2e : login tramtech → ne voit QUE tramtech ; login veridian (admin)
      → voit tout

### 3. Page d'accueil gamifiée pour le client

- [ ] Remplacer `/dashboard` par une page "Mon score Veridian"
- [ ] Composant "Score de performance" (somme pondérée des services actifs)
- [ ] Blocs service actif : trafic SEO, formulaires, appels, Google Ads, vitesse
      → chaque bloc montre une métrique + tendance 28j + badge "actif"
- [ ] Blocs service non actif : style muté avec CTA "contact@veridian.site
      pour activer" (shadow marketing)
- [ ] Pondération du score : décider une formule simple (à itérer)

### 4. Skill Claude de provisioning

- [ ] Créer un skill `~/.claude/skills/analytics-provision/` ou équivalent
- [ ] Input : `{ nom, domaine, email client, numéro(s) appel, propriété GSC }`
- [ ] Actions : create tenant → create site → attach GSC → sync initial →
      génère snippet tracker → affiche le snippet à copier-coller
- [ ] Doc dans le skill expliquant comment Robert l'appelle

### 5. Call tracking basique

- [ ] Choisir fournisseur : OVH voiceConsumption (déjà en place, gratuit)
      vs Telnyx (plus moderne, payant) → **décision Robert attendue**
- [ ] Script de sync : pull API → transform → POST `/api/ingest/call` avec
      le `x-site-key` du client concerné
- [ ] Mapping numéro → site (table `SipLineMapping` à ajouter ou via champ
      `Site.trackedNumbers`)
- [ ] Cron quotidien sur dev-server ou prod
- [ ] Page `/dashboard/calls` scopée tenant → déjà existante, vérifier scope

### 6. Doc d'intégration client

- [ ] Créer `analytics/docs/integration.md`
- [ ] Snippet tracker prêt à copier-coller (avec site-key en variable)
- [ ] Comment taguer les formulaires (`data-veridian-track="contact"`)
- [ ] Comment vérifier que le tracking fonctionne (devtools network tab)
- [ ] Robert pourra copier-coller ça dans un mail au client

### 7. Deploy prod

- [ ] Dockerfile validé en build local (déjà fait)
- [ ] Push image sur GHCR
- [ ] Service Dokploy `analytics` sur VPS prod
- [ ] DNS `analytics.app.veridian.site` → Traefik → container
- [ ] **Env var `PUBLIC_TRACKER_URL=https://analytics.app.veridian.site`** (pour que le skill retourne le bon snippet URL prod dans `/status`)
- [ ] Env var `ADMIN_API_KEY` (générer une nouvelle pour la prod, ≠ dev)
- [ ] Env var `DATABASE_URL` sur un Postgres dédié prod
- [ ] Env var `AUTH_SECRET` (nouveau, pas celui de dev)
- [ ] Seed admin Robert + migration initiale
- [ ] Badge BETA dans le header (pour les clients)
- [ ] Mettre à jour `~/.claude/skills/analytics-provision/SKILL.md` avec la nouvelle BASE URL + nouvelle ADMIN_API_KEY prod

## Phase F — Data quality & effet wow (ajoutée 2026-04-14)

> **Contexte** : sur le site Morel Volailles, on a branché le tracking Veridian
> server-to-server et on s'est rendu compte de deux choses :
> 1. Les métriques risquent d'être polluées par les bots même après les filtres
>    UA côté tracker — on a pas de garantie côté serveur.
> 2. Il n'existe aucune boucle de feedback qui dit à Robert/Claude "ce site
>    n'est pas bien branché, voilà ce qui manque". Aujourd'hui on livre à
>    l'aveugle, on croise les doigts, on regarde 3 semaines plus tard.
>
> Cette Phase F **transforme Veridian Analytics en outil qui garantit la
> qualité de la data entrante et qui force Robert à livrer des sites
> proprement optimisés**. C'est le vrai moat concurrentiel vs GA4/Plausible.
> Ordre d'exécution recommandé : F.1 → F.2 → F.3 (chaque step débloque le
> suivant et on peut shipper en intermédiaire).

### F.1 — Contrôles qualité à l'ingestion (priorité P0)

Objectif : garantir que la data stockée est de la data humaine, taguer le
niveau de confiance sur chaque event, et exposer ce niveau dans le
dashboard pour que Robert et ses clients aient une métrique "fiabilité".

**Tolérance à l'erreur définie par Robert (2026-04-14) :**
- ✅ **Bots grotesques** (crawlers connus, headless sans stealth, UA bot,
  webdriver, burst IP, UA vs screen incohérents) → **doivent être filtrés
  à 100%**. Zéro tolérance pour les bots UA-taggés ou webdriver-taggés qui
  passent dans les compteurs.
- ✅ **Humains qui ne font rien** (pageview sans interaction, rebond < 3s)
  → **acceptable de les exclure**. On préfère sous-compter les humains
  passifs que surcompter les bots.
- ⚠️ **Bots sophistiqués** (stealth headless, clicks programmés, farms
  résidentielles) → **tolérés**, on ne peut pas les battre sans foutre
  en l'air l'UX des vrais humains. Flag `suspect_sophisticated` pour
  debug.

#### F.1.0 — Visiteurs uniques (décision Robert 2026-04-14)

**Décision tranchée** : hash **stable sans salt rotatif** pour maximiser
la précision cross-day/cross-month et éviter de surcompter les visiteurs
qui reviennent (entourage du client qui regarde le site plusieurs fois
par curiosité → 25% d'erreur sans hash stable, inacceptable pour la
crédibilité produit).

Formule :
```
visitorHash = sha256(siteId + ip + userAgent)
```

- ❌ Pas de salt journalier
- ❌ Pas de salt mensuel
- ✅ Hash stocké en DB dans `Pageview.visitorHash` (String, indexed)
- ✅ Aucune IP brute stockée (seulement le hash)
- ✅ Retention Pageview : 24 mois puis purge auto (cron) → au-delà,
  agrégats seulement

**Justification Robert** : pas de DPO ni client assez gros pour déclencher
un audit CNIL. Le gain en précision (vrais uniques cross-day) dépasse
largement le risque juridique à l'échelle actuelle. Si un jour on monte
en taille avec des clients PME à DPO, on refactore vers un salt rotatif —
en attendant, priorité à la qualité de data.

À documenter dans les mentions légales de chaque site client :
"Veridian Analytics utilise un identifiant technique dérivé de votre IP
et navigateur, conservé 24 mois, pour distinguer les visiteurs uniques.
Aucun cookie n'est posé sur votre appareil." Suffisant.

Côté dashboard :
- Home : `87 visiteurs uniques aujourd'hui · 245 pages vues · 2.8 pages/visiteur`
- Breakdown : uniques / jour / semaine / mois / trimestre (via
  `countDistinct('visitorHash')` sur la fenêtre)
- Badge "% humains vérifiés" basé sur le quality score (voir F.1 suite)

#### Backend — schema

- [ ] Ajouter au schema Prisma :
  - `Pageview.quality` (`Int 0-100`) — score de confiance humain/bot
  - `Pageview.qualityFlags` (`String[]`) — liste des flags levés
    (`missing_referrer`, `no_interaction`, `bot_ua_regex`, `dns_over_tor`,
    `webdriver_detected`, `rapid_session_burst`, `headless_signals`, …)
  - `Pageview.ipHash` (`String?`) — hash SHA-256 du IP + salt pour
    détecter les bursts sans stocker l'IP réelle (RGPD-friendly)
  - `Pageview.tlsFingerprint` (`String?`) — empreinte TLS envoyée par
    Cloudflare (optionnel, dépend du proxy)
  - Mêmes champs dupliqués sur `FormSubmission`, `SipCall` (dans la mesure
    du possible — un form submit a déjà un humain derrière mais peut être
    un spam bot)
- [ ] Migration + backfill : marquer `quality=50` sur les events pré-F.1.
- [ ] Index composite `(tenantId, siteId, quality)` pour pouvoir filtrer
      rapidement sur "pageviews humains uniquement".

#### Backend — ingestion `/api/ingest/pageview`

- [ ] Extraire une fonction `computeQuality(event, req)` qui calcule un
      score 0-100 basé sur :
  - **Regex UA bot étendue** (−40 si match, `bot_ua_regex` flag) —
    ajouter les crawlers IA : `gptbot`, `chatgpt-user`, `claudebot`,
    `claude-web`, `perplexitybot`, `cohere`, `anthropic`, `youbot`,
    `applebot-extended`, `bytespider`, `ccbot`, `archive_org`
  - **`navigator.webdriver`** présent dans le payload → −30
  - **Pas de `referrer` ET pas d'UTM ET pas de session précédente** → −15
    (souvent un ping direct sans contexte humain)
  - **Session qui n'a jamais fait de 2e event** (pas de scroll, pas de
    navigation) → −10 (check en différé via cron, voir plus bas)
  - **Burst IP** : > N events du même `ipHash` en < 5s → −30,
    `rapid_session_burst`
  - **UA cohérent vs plateforme** : `viewport.width === 0`,
    `screen.width === 0` → headless, −40
  - **Language header `en-US` sur un site français**, **Timezone `UTC`
    en plein milieu de la journée française** → signaux faibles, −5 chacun
- [ ] Score < 40 → event stocké mais **flag `bot` levé**, exclu du compteur
      par défaut
- [ ] Score ≥ 40 → compté dans les métriques
- [ ] Le tracker.js envoie en plus dans le payload : `viewport`, `screen`,
      `tz`, `webdriver`, `lang`, `platform`, premier `mousemove/scroll/touch`
      timestamp (ms depuis pageload)

#### Backend — post-processing

- [ ] Cron toutes les 10 min qui recalcule le score des sessions récentes
      (on reconnaît un bot avec plus de recul : session d'1 page sans
      interaction → `no_interaction` flag, score baisse)
- [ ] Cron quotidien qui purge les events `quality < 20` de plus de 30j
      (on garde la trace 30j pour debug puis poubelle)

#### Réponse API enrichie

- [ ] `POST /api/ingest/pageview` renvoie désormais `{ ok, id, quality,
      qualityFlags }` au lieu de juste `{ ok, id }`. Le tracker JS peut
      logger en debug côté browser si `?veridian_debug=1`.
- [ ] Idem pour `/api/ingest/form` : le worker Morel recevra `quality: 85`
      dans la réponse et pourra décider de logguer ou pas.

#### Dashboard — "Score de confiance"

- [ ] Nouvelle metric dans `/dashboard` : **% humains vérifiés** (pageviews
      avec quality ≥ 40 / total). Affiché à côté du compteur total.
- [ ] Toggle "Inclure les pageviews douteux" (desactivé par défaut) pour
      que le client voit ce qui est filtré.
- [ ] Page `/dashboard/data-quality` (role SUPERADMIN) qui liste les
      sessions suspectes récentes + leurs flags, pour que Robert puisse
      vérifier que le filtre ne rejette pas des vrais humains.

### F.2 — API d'audit qualité d'un site client

Objectif : Claude (via skill `optimize-site` + un nouvel appel Veridian)
peut lancer un scan automatique d'un site client et recevoir une checklist
scorée. Boucle de feedback parfaite : je code → je lance l'audit → je vois
ce qui manque → je corrige.

#### Endpoint `POST /api/admin/sites/:siteId/audit`

- [ ] Déclenche un audit serveur complet (playwright headless + fetches HTTP)
      sur le domaine du site
- [ ] Retourne un **rapport JSON structuré** :
  ```json
  {
    "siteId": "cmnutiyp9000vuxnoudvrjzy2",
    "domain": "morel-volailles.com",
    "auditedAt": "2026-04-14T17:45:00Z",
    "score": 78,
    "checks": [
      { "id": "tracker_loaded", "ok": true, "severity": "critical", "detail": "tracker.js chargé avec site-key valide" },
      { "id": "tracker_key_match", "ok": true, "severity": "critical", "detail": "data-site-key correspond bien au site en DB" },
      { "id": "tracker_bot_filter", "ok": true, "severity": "high", "detail": "Filtre UA + webdriver + interaction détecté" },
      { "id": "meta_title_unique_per_page", "ok": false, "severity": "high", "detail": "2 pages ont le même title : /contact et /mentions-legales" },
      { "id": "meta_description_unique", "ok": true, "severity": "high" },
      { "id": "canonical_present", "ok": true, "severity": "high" },
      { "id": "canonical_correct_domain", "ok": true, "severity": "critical" },
      { "id": "jsonld_organization", "ok": true, "severity": "medium" },
      { "id": "jsonld_localbusiness", "ok": true, "severity": "medium" },
      { "id": "jsonld_breadcrumb_on_slugs", "ok": true, "severity": "medium" },
      { "id": "jsonld_product_on_slugs", "ok": true, "severity": "medium" },
      { "id": "jsonld_valid_schema", "ok": false, "severity": "high", "detail": "Schema Markup Validator renvoie 2 warnings sur /produits/poulet" },
      { "id": "images_have_alt", "ok": false, "severity": "medium", "detail": "3 images sans alt descriptif : /images/hero/fresh-poultry-1.jpg, ..." },
      { "id": "images_under_500kb", "ok": true, "severity": "low" },
      { "id": "sitemap_present", "ok": true, "severity": "critical" },
      { "id": "sitemap_all_pages_referenced", "ok": true, "severity": "high" },
      { "id": "robots_txt_valid", "ok": true, "severity": "medium" },
      { "id": "https_redirect", "ok": true, "severity": "critical" },
      { "id": "forms_have_turnstile", "ok": true, "severity": "high", "detail": "Turnstile détecté sur /contact" },
      { "id": "forms_backend_validates_mx", "ok": "unknown", "severity": "high", "detail": "Impossible à vérifier sans soumettre un form" },
      { "id": "tracker_tests_not_polluting", "ok": true, "severity": "high", "detail": "Aucun event de test détecté avec UA `DryRun` récent" },
      { "id": "lighthouse_perf_mobile", "ok": true, "severity": "medium", "detail": "Score 84 / cible > 80" },
      { "id": "lighthouse_a11y", "ok": true, "severity": "medium", "detail": "Score 92" },
      { "id": "favicon_multi_size", "ok": true, "severity": "low" },
      { "id": "404_customized", "ok": true, "severity": "low" },
      { "id": "legal_mentions_present", "ok": true, "severity": "critical" }
    ],
    "nextSteps": [
      "2 titres dupliqués → corriger /contact vs /mentions-legales",
      "3 images sans alt dans /images/hero → ajouter alt descriptif",
      "JSON-LD Product sur /produits/poulet a 2 warnings → checker avec validator.schema.org"
    ],
    "passedCritical": true,
    "blockingIssues": [],
    "recommendations": [...]
  }
  ```
- [ ] `severity` : `critical` (bloquant livraison), `high`, `medium`, `low`
- [ ] `blockingIssues` = liste des checks `critical` en failed
- [ ] Le score = moyenne pondérée par severity
- [ ] Temps d'exécution cible < 60s (parallélisé : fetch pages,
      lighthouse CI, playwright pour JS, validator.schema.org)

#### Implémentation backend

- [ ] Module `lib/audit/checks/` avec un fichier par check (`tracker-loaded.ts`,
      `meta-uniqueness.ts`, `jsonld-valid.ts`, etc.) → permet d'ajouter
      facilement de nouveaux checks
- [ ] Chaque check exporte `{ id, severity, run(ctx): CheckResult }`
- [ ] `ctx` contient : HTML de chaque page du sitemap, `$` cheerio,
      browser playwright partagé, DB access (pour vérifier que le
      `data-site-key` correspond au siteId audité)
- [ ] Un `AuditRun` table Prisma stocke chaque audit + son résultat :
  - `id`, `siteId`, `startedAt`, `finishedAt`, `score`, `checksJson`,
    `triggeredBy` (user / skill / cron)
- [ ] Retention : 30 derniers audits par site, au-delà purge auto

#### Endpoint connexe `GET /api/admin/sites/:siteId/audit/latest`

- [ ] Retourne le dernier audit + diff avec l'avant-dernier (new fails, new
      passes) → utile pour voir l'évolution après un fix

#### Intégration skill `optimize-site`

- [ ] Le skill expose `/optimize-site audit <domain>` qui appelle
      `POST /api/admin/sites/:siteId/audit` via le tenant correspondant au
      domain, affiche les résultats formatés, et propose des corrections
      automatiques pour les `high`/`medium` si possible
- [ ] Le skill `create-site` dans son étape finale lance un audit et
      refuse de "livrer" si `passedCritical === false`
- [ ] Fallback si Analytics non dispo : le skill fait les checks côté
      local sans scoring DB

#### Dashboard — nouvelle page `/dashboard/audit`

- [ ] Liste des audits récents du tenant (role MEMBER : son tenant,
      role SUPERADMIN : tous)
- [ ] Bouton "Lancer un audit maintenant" → déclenche l'endpoint, affiche
      résultat en live (streaming ou polling)
- [ ] Historique des scores sur 90j (graph line) pour montrer au client
      l'amélioration continue de son site
- [ ] Pour le MEMBER (client final) : vue simplifiée "Votre site est à
      jour ✅" ou "3 améliorations possibles — demandez à Veridian"

### F.3 — Funnel de conversion + user linking (effet wow)

Objectif : Robert peut dire au client "regarde, cette personne est venue
3 fois en 10 jours, a visité /produits/poulet puis /produits/dinde, puis
a rempli ton form commande pigeon — voici son mail pour la rappeler".
Sans cookie tracking, sans consent banner, sans GA4.

#### Principe : linking par email/phone, pas par cookie

- **Session anonyme** : on garde le `sessionId` en sessionStorage (expire
  à la fermeture d'onglet). C'est ce qu'on fait déjà.
- **Quand un form submit arrive** : on a l'email et/ou phone. On lie TOUS
  les pageviews de cette session à ce `Lead` (table à créer).
- **Quand un même email revient plus tard** : si pendant la session il
  remplit un autre form ou qu'il s'identifie d'une autre manière
  (ex: retour via magic link mail), on relie la nouvelle session au
  même `Lead`.
- **Pas de cookie cross-session**. Si l'utilisateur revient sans se
  réidentifier, sa nouvelle session est anonyme. C'est ok : on perd en
  précision mais on reste 100% RGPD.

#### Schema

- [ ] Nouvelle table `Lead` :
  ```prisma
  model Lead {
    id         String   @id @default(cuid())
    tenantId   String
    siteId     String
    email      String?
    phone      String?
    name       String?
    firstSeenAt DateTime
    lastSeenAt  DateTime
    sessions   LeadSession[]
    forms      FormSubmission[]
    calls      SipCall[]
    createdAt  DateTime @default(now())
    @@unique([tenantId, email])
    @@unique([tenantId, phone])
    @@index([tenantId, siteId, lastSeenAt])
  }

  model LeadSession {
    id          String   @id @default(cuid())
    leadId     String
    sessionId  String   // le sessionId du tracker
    siteId     String
    firstSeenAt DateTime
    lastSeenAt  DateTime
    pageviewCount Int    @default(0)
    @@unique([leadId, sessionId])
    @@index([sessionId])
  }
  ```
- [ ] Ajouter `Pageview.sessionId` (déjà présent) et `FormSubmission.sessionId`
      (à vérifier) pour pouvoir faire le join
- [ ] À l'arrivée d'un `FormSubmission` ou `SipCall` :
  1. Cherche un Lead existant avec même `email` ou `phone` sur le tenant
  2. S'il existe → lie le submit + crée une `LeadSession` si pas déjà
     présente
  3. Sinon crée un nouveau Lead + LeadSession
  4. Rapatrie dans la `LeadSession` TOUS les Pageviews de ce `sessionId`

#### Dashboard — nouvelle page `/dashboard/leads`

- [ ] Liste des leads récents avec colonnes : name/email, #sessions,
      #pageviews total, dernier form, statut (new / revenu / converti)
- [ ] Clic sur un lead → timeline complète de ses sessions, avec pour
      chaque session : date, durée, pages visitées en ordre, form ou call
      final si présent
- [ ] Funnel visualisé : "3 visites avant conversion", "pages qui
      convertissent le plus" (dernière page visitée avant form submit)
- [ ] Export CSV des leads (nom, email, phone, last visit, total sessions,
      pages clés visitées) pour que le client puisse relancer

#### Funnel de conversion générique

- [ ] Nouvelle page `/dashboard/funnel` : configurable, Robert ou le client
      définit 3-5 étapes (ex: `/ → /produits → /produits/* → /contact →
      form submit`)
- [ ] Calcule pour chaque étape : # sessions qui ont atteint cette étape,
      taux de drop-off, temps moyen entre étapes
- [ ] Segmentable par UTM source, referrer, device, country (si IP
      geo-lookup est activé, gratuit via Cloudflare header)

#### Relance automatique (bonus pour phase F.3+)

- [ ] Bouton "Relancer ce lead" sur la fiche lead → ouvre un template
      Brevo pré-rempli avec contexte de la session (pages visitées)
- [ ] Trigger automatique : si un lead a submit un form "commande" il y a
      > 48h et qu'on n'a rien marqué comme "converti", envoyer un rappel
      auto via Brevo

#### Privacy & RGPD

- [ ] Page `/legal/data` côté tenant qui documente EXACTEMENT ce qu'on
      collecte, pourquoi, combien de temps, comment supprimer
- [ ] Endpoint `DELETE /api/admin/leads/:id` pour droit à l'oubli RGPD
- [ ] Retention par défaut : 24 mois après dernière interaction, puis purge
      auto (configurable par tenant)
- [ ] Anonymisation : si un tenant perd son compte Veridian, ses leads sont
      anonymisés (nom/email/phone remplacés par hash)
- [ ] Pas de consent banner requis si :
  - On n'utilise QUE sessionStorage (pas de cookie)
  - On anonymise l'IP (on stocke un hash salé, pas l'IP brute)
  - On ne lie à un lead QUE sur action explicite de l'utilisateur
    (remplir un form = consentement implicite au traitement de ses data)
  - Mentions claires dans les mentions légales du site

### F.4 — Exploitation maximale du tracking (data riche en DB)

Philosophie : **stocker TOUT ce qu'on peut capter** à chaque pageview,
quitte à ne pas tout afficher tout de suite dans l'UI. L'UI viendra
après, on ne veut pas être bloqués par du refactor schema dans 6 mois.

#### F.4.1 — Schema Pageview enrichi

- [ ] Ajouter à `Pageview` (migration Prisma) :
  ```prisma
  // Identité technique
  visitorHash       String   // sha256(siteId+ip+ua), stable
  sessionId         String   // déjà présent, sessionStorage
  ipHash            String?  // déprécié, remplacé par visitorHash

  // Browser / OS / Device (parsés via ua-parser-js côté serveur)
  browserName       String?  // Chrome, Safari, Firefox, Edge, Opera, Samsung
  browserVersion    String?  // "121.0"
  browserEngine     String?  // Blink, Gecko, WebKit
  osName            String?  // Windows, macOS, iOS, Android, Linux
  osVersion         String?  // "14.5"
  deviceType        String?  // mobile, tablet, desktop, tv, wearable
  deviceVendor      String?  // Apple, Samsung, Google, …
  deviceModel       String?  // iPhone 14 Pro, SM-S911B, Pixel 8
  isMobile          Boolean  @default(false)
  isTablet          Boolean  @default(false)
  isDesktop         Boolean  @default(false)
  isBot             Boolean  @default(false)  // flag UA-bot détecté

  // Écran / Viewport
  screenWidth       Int?     // envoyé par tracker
  screenHeight      Int?
  viewportWidth     Int?
  viewportHeight    Int?
  devicePixelRatio  Float?   // 1, 2, 3 (Retina)
  colorDepth        Int?     // 24, 30, 48
  orientation       String?  // portrait / landscape

  // Locale
  language          String?  // fr-FR, en-US
  languages         String[] // toutes les prefs navigateur
  timezone          String?  // Europe/Paris, America/New_York
  timezoneOffset    Int?     // minutes vs UTC

  // Réseau
  connectionType    String?  // 4g, 3g, wifi, ethernet (NetworkInformation API si dispo)
  saveData          Boolean? // data saver mode
  effectiveType     String?  // slow-2g, 2g, 3g, 4g

  // Géolocalisation (via Cloudflare headers — gratuit, précis au niveau ville)
  country           String?  // ISO 3166 alpha-2 : FR, US, DE
  region            String?  // code région Cloudflare : FR-ARA (Auvergne-Rhône-Alpes)
  regionName        String?  // "Auvergne-Rhône-Alpes"
  city              String?  // "Lyon"
  postalCode        String?  // "69007"
  latitude          Float?   // précision ville
  longitude         Float?
  continent         String?  // EU, NA, AS
  asn               Int?     // Autonomous System Number (pour identifier hébergeurs cloud → bots)
  asnOrg            String?  // "OVH SAS", "Amazon.com", "Google LLC"
  isEuCountry       Boolean  @default(false)

  // Trafic source
  referrer          String?  // URL complète si dispo
  referrerDomain    String?  // domaine extrait
  referrerCategory  String?  // search / social / directory / direct / email / ads
  utmSource         String?
  utmMedium         String?
  utmCampaign       String?
  utmTerm           String?
  utmContent        String?
  gclid             String?  // Google Ads click ID
  fbclid            String?  // Facebook click ID

  // Comportement (envoyé par tracker au unload)
  timeOnPage        Int?     // millisecondes
  scrollDepthMax    Int?     // % scroll max atteint
  interactionCount  Int      @default(0) // #clics + #scrolls significatifs

  // Qualité
  quality           Int      @default(50) // 0-100 (voir F.1)
  qualityFlags      String[] // reasons du score

  // Debug
  rawUserAgent      String?  // on garde le UA brut, utile en forensic
  headers           Json?    // headers utiles (compact, filtré)
  ```
- [ ] Parsing côté serveur avec `ua-parser-js` (lib éprouvée, maintenue)
- [ ] Cloudflare headers lus systématiquement : `cf-ipcountry`,
      `cf-ipcity`, `cf-region`, `cf-region-code`, `cf-postal-code`,
      `cf-latitude`, `cf-longitude`, `cf-connecting-ip` (hashé),
      `cf-ipcontinent`, `cf-ipasn` (si CF Enterprise, sinon lookup
      MaxMind GeoLite2)
- [ ] Fallback si pas derrière CF : lookup MaxMind GeoLite2 (gratuit,
      à update via cron mensuel)

#### F.4.2 — Tracker enrichi

Le tracker JS doit envoyer à l'ingestion tout ce qu'il peut savoir côté client :

```js
// Pour chaque pageview, payload étendu
{
  path, referrer, sessionId,
  // Screen
  screen: { width, height, pixelRatio, colorDepth, orientation },
  viewport: { width, height },
  // Locale
  lang: navigator.language,
  langs: navigator.languages,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  tzOffset: new Date().getTimezoneOffset(),
  // Réseau
  connection: navigator.connection ? {
    type: navigator.connection.type,
    effectiveType: navigator.connection.effectiveType,
    saveData: navigator.connection.saveData,
    downlink: navigator.connection.downlink,
    rtt: navigator.connection.rtt
  } : null,
  // Signaux bot
  webdriver: navigator.webdriver === true,
  plugins: navigator.plugins.length,
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: navigator.deviceMemory,
  maxTouchPoints: navigator.maxTouchPoints,
  // UTM & click IDs (depuis URL)
  utm: { utm_source, utm_medium, utm_campaign, utm_term, utm_content },
  gclid, fbclid,
  // Page
  title: document.title,
  visibility: document.visibilityState,
  loadType: performance.navigation.type // 0=navigate, 1=reload, 2=back_forward
}
```

#### F.4.3 — Beacon de fin de session

- [ ] Le tracker envoie un `POST /api/ingest/session-end` au `beforeunload`
      ou `visibilitychange hidden`, avec `sendBeacon` (fiable au unload) :
  ```js
  {
    sessionId,
    lastPath,
    timeOnPage: Date.now() - pageviewTimestamp,
    scrollDepthMax,
    interactionCount,
    leftVia: 'navigate' | 'close' | 'back'
  }
  ```
- [ ] Le serveur met à jour le Pageview correspondant avec ces métriques
      de fin de session → permet de calculer temps-sur-page réel,
      rebond, engagement

#### F.4.4 — Breakdowns exposables (stockage → UI plus tard)

Tous ces breakdowns se font par `groupBy` + `count(distinct visitorHash)` :

- [ ] **Par navigateur** : Chrome 45%, Safari 28%, Firefox 12%, Edge 10%, autres
- [ ] **Par OS** : Windows 42%, macOS 22%, iOS 18%, Android 15%, Linux 3%
- [ ] **Par device type** : Desktop 52%, Mobile 44%, Tablet 4%
- [ ] **Par pays / région / ville** (carte interactive plus tard)
- [ ] **Par source de trafic** : search (Google, Bing), social (FB, LinkedIn),
      directory (pagesjaunes, mappy), direct, email, ads
- [ ] **Par référent spécifique** : top 20 domaines qui envoient du trafic
- [ ] **Par heure de la journée** : heatmap 24h x 7j
- [ ] **Par connexion réseau** : 4g/wifi/ethernet (utile pour optimiser
      le poids du site)
- [ ] **Par taille d'écran** : distribution pour choisir les breakpoints
- [ ] **Par langue/timezone** : pour détecter du trafic international

#### F.4.5 — Détection bot sophistiquée (en plus du filtre UA basique F.1)

- [ ] **ASN blacklist** : Pageviews depuis des ASN cloud hyperscale
      (AWS `AS16509`, GCP `AS15169`, Azure `AS8075`, OVH cloud `AS16276`,
      Hetzner `AS24940`, DigitalOcean `AS14061`, Linode `AS63949`) →
      −30 quality, flag `cloud_asn`. **Pas −100 car certains VPN légitimes
      passent par ces ASN** mais c'est fort pondéré.
- [ ] **Signaux cohérence** :
  - `navigator.webdriver === true` → −50
  - `plugins.length === 0` ET desktop Chrome → suspicious, −20
  - `hardwareConcurrency === 1` sur desktop → suspect
  - `maxTouchPoints === 0` sur mobile → faux mobile, −30
  - `devicePixelRatio === 0` → headless, −40
- [ ] **Cohérence IP / locale** : `country=FR` mais `lang=zh-CN` ET
      `tz=UTC` → signaux contradictoires, −15
- [ ] **Burst temporel** : > 10 pageviews du même `visitorHash` en < 60s →
      bot, flag `rapid_burst`, −40
- [ ] **User Agents known-bad** (crawlers IA + anciens bots) :
      `gptbot`, `chatgpt-user`, `claudebot`, `claude-web`, `perplexitybot`,
      `cohere-ai`, `anthropic-ai`, `youbot`, `applebot-extended`,
      `bytespider`, `ccbot`, `archive_org`, `ahrefsbot`, `semrushbot`,
      `mj12bot`, `dotbot`, `blexbot`, `rogerbot`, `screaming frog`,
      `sitebulb`, `httpclient`, `python-requests`, `curl`, `wget`,
      `phantomjs`, `headlesschrome`, `puppeteer`, `playwright`,
      `selenium`, `chromedriver`, `webdriver`
- [ ] **Score final** : Pageview avec `quality < 40` n'est pas compté
      dans les métriques publiques (seulement visible côté debug admin).

#### F.4.6 — Time-based metrics

- [ ] **Temps sur page** : via beacon de fin de session
- [ ] **Temps total de session** : diff entre premier et dernier pageview
- [ ] **Time-to-form-submit** : délai entre premier pageview d'un lead
      et son form submit (utile pour mesurer la maturation)
- [ ] **Time-to-return** : pour un visitorHash qui revient, délai entre
      deux sessions → permet de dire "vos visiteurs reviennent en moyenne
      après 4 jours"

### F.5 — Intégration effet wow côté Robert

- [ ] Commande skill `/analytics audit <domain>` qui lance F.2 audit et
      affiche résultats + propose corrections auto
- [ ] Commande skill `/analytics lead <domain> <email>` qui cherche un
      lead et affiche sa timeline complète
- [ ] Commande skill `/analytics quality <domain>` qui montre les pageviews
      douteux récents + pourquoi ils sont flaggés
- [ ] Push automatique vers Telegram quand un lead à fort intent visite
      (`/produits/*` 3 fois en moins de 7j + n'a pas encore submit)
- [ ] Dashboard `/admin/health` cross-tenant qui affiche pour chaque
      client : score audit dernier, % humains vérifiés, #leads récents,
      #forms récents → Robert voit la santé de son portefeuille en un
      coup d'œil

### F.6 — Batterie de tests tracking + API de vérification fine

Objectif : **Claude doit pouvoir appeler une API qui lui dit, check par
check, si le tracking du site est parfaitement fonctionnel**. Pas juste
"score 78", mais "pageview ingéré ✅, quality 82 ✅, browser détecté
Chrome 121 ✅, geo Corbas ✅, form trackable ❌ parce que turnstile pas
résolu, scroll depth absent car beacon unload pas déclenché".

C'est ce qui transforme "je livre un site" en "je livre un site
qualité-garantie par test automatique".

#### F.6.1 — Endpoint `POST /api/admin/sites/:siteId/tracking-audit`

Déclenche une suite de tests sur le tracking du site cible. Browser
Playwright headful (sur le serveur Analytics, pas sur le site client).

```json
{
  "siteId": "cmnutiyp9000vuxnoudvrjzy2",
  "domain": "morel-volailles.com",
  "auditedAt": "2026-04-14T18:00:00Z",
  "durationMs": 42318,
  "overallPassed": false,
  "score": 82,
  "tests": [
    {
      "id": "tracker_script_present",
      "ok": true,
      "severity": "critical",
      "detail": "Script trouvé dans <head> avec data-site-key=cmn...wthn",
      "evidence": "<script src='...tracker.js' data-site-key='cmn...'></script>"
    },
    {
      "id": "tracker_script_loaded",
      "ok": true,
      "severity": "critical",
      "detail": "Script téléchargé, HTTP 200, 4.2 Ko, <250ms"
    },
    {
      "id": "tracker_site_key_matches",
      "ok": true,
      "severity": "critical",
      "detail": "Le site-key trouvé correspond au site en DB"
    },
    {
      "id": "pageview_ingested",
      "ok": true,
      "severity": "critical",
      "detail": "Pageview reçu à T+1.2s, quality=85",
      "evidence": {
        "pageviewId": "cmn...",
        "quality": 85,
        "qualityFlags": []
      }
    },
    {
      "id": "pageview_browser_detected",
      "ok": true,
      "severity": "high",
      "detail": "Chrome 121 sur Linux"
    },
    {
      "id": "pageview_device_detected",
      "ok": true,
      "severity": "high",
      "detail": "Desktop, viewport 1400x900, devicePixelRatio 1"
    },
    {
      "id": "pageview_geo_detected",
      "ok": true,
      "severity": "medium",
      "detail": "FR / Auvergne-Rhône-Alpes / Lyon (via Cloudflare headers)"
    },
    {
      "id": "pageview_utm_captured",
      "ok": true,
      "severity": "high",
      "detail": "UTM source=test-audit extrait de l'URL"
    },
    {
      "id": "spa_navigation_tracked",
      "ok": true,
      "severity": "high",
      "detail": "3 pageviews capturés après 3 Link clicks Next.js"
    },
    {
      "id": "scroll_depth_tracked",
      "ok": true,
      "severity": "medium",
      "detail": "Scroll 80% → beacon reçu avec scrollDepthMax=80"
    },
    {
      "id": "tel_click_tracked",
      "ok": true,
      "severity": "high",
      "detail": "Click sur a[href^=tel:] → CtaClick ingéré avec name=tel"
    },
    {
      "id": "mailto_click_tracked",
      "ok": false,
      "severity": "medium",
      "detail": "Pas de lien mailto détecté sur la home (normal ?)"
    },
    {
      "id": "form_intercept",
      "ok": "warn",
      "severity": "high",
      "detail": "Form /contact présent mais pas de data-veridian-track (normal pour pattern server-to-server)",
      "hint": "Vérifier que le worker backend envoie bien /api/ingest/form"
    },
    {
      "id": "form_ingest_endpoint_reachable",
      "ok": true,
      "severity": "critical",
      "detail": "POST /api/ingest/form avec site-key valide répond 200"
    },
    {
      "id": "bot_filter_ua",
      "ok": true,
      "severity": "critical",
      "detail": "Simulation User-Agent 'Googlebot' → quality=5, pageview flaggé bot_ua_regex"
    },
    {
      "id": "bot_filter_webdriver",
      "ok": true,
      "severity": "critical",
      "detail": "Simulation navigator.webdriver=true → quality=10, flaggé webdriver_detected"
    },
    {
      "id": "bot_filter_burst",
      "ok": true,
      "severity": "high",
      "detail": "15 pageviews en 3s du même hash → 11 derniers flaggés rapid_burst"
    },
    {
      "id": "session_beacon_unload",
      "ok": true,
      "severity": "high",
      "detail": "beforeunload → session-end reçu avec timeOnPage=12450"
    },
    {
      "id": "unique_visitor_hash_stable",
      "ok": true,
      "severity": "critical",
      "detail": "Même IP+UA sur 2 visites séparées → même visitorHash"
    },
    {
      "id": "tracker_in_head",
      "ok": true,
      "severity": "medium",
      "detail": "Script placé dans <head> (pas en fin de <body>) pour capturer au plus tôt"
    },
    {
      "id": "tracker_async",
      "ok": true,
      "severity": "low",
      "detail": "Script chargé avec strategy=afterInteractive / async"
    },
    {
      "id": "tracker_no_duplicate",
      "ok": true,
      "severity": "high",
      "detail": "Un seul <script data-site-key> détecté"
    },
    {
      "id": "tracker_no_test_pollution",
      "ok": true,
      "severity": "critical",
      "detail": "Aucun event UA='VeridianAudit' dans la DB hors des 30 dernières min (= tests propres, pas de pollution historique)"
    },
    {
      "id": "cors_allows_ingest",
      "ok": true,
      "severity": "critical",
      "detail": "OPTIONS /api/ingest/* renvoie bien CORS permissif pour ce domaine"
    },
    {
      "id": "ingest_rate_limit_reasonable",
      "ok": true,
      "severity": "medium",
      "detail": "Rate limit à 60 req/min/IP appliqué mais pas déclenché"
    }
  ],
  "failedTests": ["form_intercept"],
  "warnings": [...],
  "recommendations": [
    "Vérifier manuellement que le form /contact envoie bien vers le worker backend",
    "Documenter que ce site utilise le pattern server-to-server (pas data-veridian-track)"
  ]
}
```

#### F.6.2 — Exécution des tests (Playwright headful côté serveur Analytics)

- [ ] Browser Playwright Chromium lancé par l'API audit
- [ ] User-Agent custom `VeridianAudit/1.0 (+https://analytics.app.veridian.site/audit)` 
      pour reconnaître les requêtes de test dans les logs
- [ ] Chaque test suit un pattern :
  1. Nettoyer tout event précédent de test (`UA=VeridianAudit` 1h)
  2. Visiter la page / exécuter l'action
  3. Attendre le beacon côté serveur (polling DB max 5s)
  4. Valider que l'event est bien ingéré avec les bonnes propriétés
  5. Marquer le test ✅/❌
- [ ] À la fin, **purge complète des events de test** (pas de pollution
      de la vraie data du client)
- [ ] Timeout global : 90s

#### F.6.3 — Tests spécifiques à développer

**Injection et présence**
- [ ] `tracker_script_present` — `<script data-site-key>` trouvé dans le HTML
- [ ] `tracker_script_loaded` — HTTP 200, content-type JS
- [ ] `tracker_site_key_matches` — siteKey correspond au siteId audité
- [ ] `tracker_no_duplicate` — un seul tracker
- [ ] `tracker_in_head` — placement optimal

**Ingestion pageview**
- [ ] `pageview_ingested` — pageview reçu dans les 3s
- [ ] `pageview_browser_detected` — browserName/version non null
- [ ] `pageview_device_detected` — device type + viewport détectés
- [ ] `pageview_geo_detected` — country/region/city (si CF headers dispo)
- [ ] `pageview_utm_captured` — UTM extrait de l'URL ?utm_source=…
- [ ] `pageview_referrer_captured` — referrer capturé si présent
- [ ] `pageview_session_id_set` — sessionId généré et cohérent
- [ ] `pageview_visitor_hash_set` — visitorHash calculé

**SPA navigation (Next.js)**
- [ ] `spa_navigation_tracked` — Link click → pageview capturé

**CTA**
- [ ] `tel_click_tracked` — click a[href^=tel:] ingéré
- [ ] `mailto_click_tracked` — idem pour mailto:
- [ ] `cta_explicit_tracked` — click sur [data-veridian-cta]

**Formulaires**
- [ ] `form_intercept` — détection de form data-veridian-track="auto/x"
- [ ] `form_submit_tracked` — soumission simulée → FormSubmission ingéré
- [ ] `form_ingest_endpoint_reachable` — POST /api/ingest/form fonctionne

**Scroll & engagement**
- [ ] `scroll_depth_tracked` — scroll programmé → beacon avec depth
- [ ] `session_beacon_unload` — close tab → session-end reçu

**Filtre bot**
- [ ] `bot_filter_ua` — visite avec UA=Googlebot → quality bas + flag
- [ ] `bot_filter_webdriver` — visite avec navigator.webdriver=true → idem
- [ ] `bot_filter_burst` — 15 pageviews en 3s → burst détecté
- [ ] `bot_filter_asn_cloud` — simulation IP AWS → cloud_asn flaggé (mock)
- [ ] `bot_filter_stealth` — Playwright défaut non-stealth → doit être
      détecté par nos signaux (plugins=0 sur Chrome, etc.)

**Qualité de hash et unicité**
- [ ] `unique_visitor_hash_stable` — 2 visites même IP+UA → même hash
- [ ] `unique_visitor_hash_differs_across_ua` — 2 UA différents → 2 hashes

**Réseau**
- [ ] `cors_allows_ingest` — OPTIONS sur /api/ingest/* permis
- [ ] `ingest_rate_limit_reasonable` — rate limit connu mais raisonnable

**Intégrité data**
- [ ] `tracker_no_test_pollution` — aucun event VeridianAudit > 1h en DB
      (sinon les tests précédents ont dropé sans purge)

#### F.6.4 — Variantes du test (audit léger vs profond)

- [ ] **Mode `quick`** (10s) : seulement les tests critiques
      (script present, ingested, bot filter UA)
- [ ] **Mode `full`** (60-90s) : tous les tests ci-dessus
- [ ] **Mode `nightly`** : full + vérif de la data historique
      (≥1 vrai pageview dans les 24h = le site reçoit du trafic)

Paramètre `?mode=quick|full|nightly` sur l'endpoint.

#### F.6.5 — Intégration skill Claude `/analytics track-audit`

```bash
# Claude lance depuis son projet site client
/analytics track-audit morel-volailles.com
→ Appelle POST /api/admin/sites/:id/tracking-audit
→ Affiche :
  ✅ Script présent et chargé
  ✅ Pageview ingéré (quality 85)
  ✅ SPA navigation : 3/3 pageviews capturés
  ✅ Tel click tracké
  ⚠ Form : pattern server-to-server détecté (pas data-veridian-track)
     → vérifier worker backend
  ✅ Bot filter UA : Googlebot correctement bloqué
  ✅ Bot filter webdriver : ok
  ✅ Unique hash stable
  Score : 82/100
  Passed critical : oui → livrable
```

- [ ] Commande skill qui couple `optimize-site audit` (F.2) + `tracking-audit`
      (F.6) pour avoir une vue globale : "ton site est bon SEO **et** il est
      bien tracké"
- [ ] Commande `/analytics track-audit <domain> --watch` qui relance
      toutes les 30s pendant 10 min → utile pendant un dev actif pour
      voir quand le fix passe

#### F.6.6 — Tests périodiques (cron)

- [ ] Cron toutes les 6h qui lance un `tracking-audit mode=quick` sur
      chaque site actif
- [ ] Si `ok=false` pendant 2 runs consécutifs → notif Telegram à Robert
      "morel-volailles.com : tracker cassé depuis 12h, vérifie"
- [ ] Résultats stockés dans `TrackingAuditRun` table, historique 90j

#### F.6.7 — Dashboard admin `/admin/tracking-health`

- [ ] Cross-tenant, visible SUPERADMIN uniquement
- [ ] Liste de tous les sites avec :
  - Score audit dernier
  - Services actifs
  - `isBot %` des pageviews 24h
  - Dernier pageview vraiment humain
- [ ] Couleur verte / jaune / rouge par site
- [ ] Click → détail du dernier audit complet

---

### Ordre d'exécution recommandé

1. **F.1.0 (visiteurs uniques stable-hash)** + **F.4.1 (schema enrichi)**
   d'abord (2-3 jours, dépendants) — fondations data. Sans le schema
   enrichi, F.6 audit ne peut rien checker.
2. **F.1 suite (quality scoring + bot detection)** (2 jours) — logique
   de scoring à l'ingestion + flags.
3. **F.4.2/F.4.3 (tracker enrichi + beacon unload)** (1-2 jours) — côté
   client, envoie tout ce que le serveur sait exploiter.
4. **F.6 (tests tracking + API audit)** (3-4 jours) — la batterie de tests
   qui valide que F.1+F.4 fonctionnent bout en bout. **Prioritaire car
   c'est ce qui donne la confiance à Robert pour livrer.**
5. **F.2 (audit SEO complet)** (3 jours) — audit qualité site complet
   couplé avec F.6 pour une vue unifiée.
6. **F.4.4 (breakdowns UI)** au fur et à mesure.
7. **F.3 (leads + funnel)** après MVP (1 semaine) — gros différenciateur
   mais dépend de F.4 pour être riche.
8. **F.4.5 (bot detection sophistiquée)** en continu, s'améliore avec
   l'expérience en prod.
9. **F.5 (intégration skills Claude)** à la fin, une fois que F.1-F.6
   roulent.

### Métriques de succès Phase F

- ✅ Taux de pageviews bot filtrés > 90% (vérifiable via manual check de
  Googlebot + ChatGPT crawl)
- ✅ Un site client neuf livré passe son premier audit avec score > 85
  dès le premier run
- ✅ Temps de provisioning complet (tenant + audit + correction + livraison)
  < 30 min pour un site bien branché
- ✅ Premier vrai lead tracké de bout en bout sur Morel ou Tramtech avant
  fin juin 2026

## En cours / blockers

- 🔄 **Audit UI `/dashboard/gsc`** — agent Claude en background en ce moment,
  fix les filtres cassés + fetches manquants (2026-04-11)
- ⏸️ **50+ fichiers untracked** dans le repo, à batcher en commits propres
  avant de push

## Recently shipped (2026-04-11)

- ✅ Scaffold monorepo `analytics/` (Next.js 15 + Prisma + Auth.js v5)
- ✅ Schema Prisma multitenant complet + GscDaily
- ✅ Admin API (`x-admin-key`) : tenants, sites, GSC attach, rotate-key, soft delete
- ✅ Endpoints ingestion (`pageview`, `form`, `call`, `gsc`) avec `x-site-key`
- ✅ Tracker JS public (`/tracker.js`) : pageview + form intercept + SPA
- ✅ Clone dashboard GSC Performance (KPIs, graph, 6 dimensions, filtres)
- ✅ Sync GSC depuis API Google (ADC, quota project `veridian-preprod`)
- ✅ 57 tests (28 unit + 29 e2e) 100% verts
- ✅ Instance dev live sur dev-server via Tailscale
- ✅ 5 tenants provisionnés dont 2 vrais clients avec data GSC 90j

## Décisions techniques figées

- **Même stack que Prospection** : Next.js 15 + Prisma + Postgres dédié. Zéro Supabase.
- **Auth Auth.js v5 credentials** local. Pas de SSO pour le MVP.
- **Multitenant jour 1**, scope par `tenantId` → `siteId[]`.
- **Site-key public** (comme Plausible) pour le tracker, rate-limité.
- **Provisioning via skill Claude**, pas via UI client. L'UI admin sert
  surtout à exposer les endpoints à Claude.
- **Deploy direct prod** avec badge BETA. Pas de staging dédié.

## Bugs connus

_(vérifier après le fix de l'agent GSC en cours)_

## Notes agents (chantiers en cours)

- **2026-04-11** : agent `aa94a6f1de8071744` audit `/dashboard/gsc` (filtres
  + fetches manquants), modifie `components/performance-dashboard.tsx`,
  `filters-bar.tsx`, `data-table.tsx`, `kpi-tile.tsx`, `time-series-chart.tsx`,
  `lib/gsc-query.ts`, `app/api/gsc/query/route.ts`. Pas de commit. Attendre
  son rapport avant de toucher ces fichiers.
