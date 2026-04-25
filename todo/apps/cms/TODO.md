# CMS — TODO detaille

> Source de verite strategique : [`../../TODO-LIVE.md`](../../TODO-LIVE.md)
> UI polish solo : [`UI-REVIEW.md`](./UI-REVIEW.md)
> Skill operationnel : `~/.claude/skills/cms-provision/SKILL.md`
> Config de reference : `cms/docs/EXAMPLE-CONFIG.md`
> Roadmap prochaine session : `cms/docs/NEXT-SESSION-ROADMAP.md`
>
> App : Veridian CMS Payload 3 multi-tenant. Une seule instance sert tous
> les sites clients (Morel, Tramtech, Dupont BTP, etc.).

## Etat actuel

- **Version** : Payload 3.82.1
- **URL staging** : https://cms.staging.veridian.site/admin
- **URL prod** : non deployee (voir P0 migration)
- **Sante** : 🟢 staging stable, 3 tenants seedes (demo/artisan/restaurant)
- **Langue** : FR par defaut (i18n natif), EN fallback
- **White-label** : actif (logo vert, BeforeLogin/Dashboard FR, favicon)
- **Theme** : light force

## Architecture

```
cms/
├── src/
│   ├── payload.config.ts   # Config principale + 5 plugins
│   ├── collections/        # Users, Tenants, Pages, Media
│   ├── globals/            # Header, Footer (via plugin multi-tenant)
│   ├── blocks/             # Hero, Services, Gallery, Testimonials, RichText, CTA, Form
│   ├── components/         # White-label (graphics, BeforeLogin, BeforeDashboard)
│   ├── hooks/              # triggerSiteRebuild
│   └── endpoints/          # health (posee pour deploy check)
├── scripts/                # seed-from-code, send-magic-link, status-tenant, ...
├── docs/
│   ├── EXAMPLE-CONFIG.md       # Config de reference commentee
│   └── NEXT-SESSION-ROADMAP.md # Roadmap passage prod + CI/CD
└── e2e/                    # Squelette Playwright pose
```

## Plugins officiels actifs

- `@payloadcms/plugin-multi-tenant` (DOIT etre en dernier)
- `@payloadcms/plugin-seo`
- `@payloadcms/plugin-form-builder`
- `@payloadcms/plugin-redirects`
- `@payloadcms/plugin-nested-docs`
- `@payloadcms/email-nodemailer` (Brevo SMTP)
- ❌ `@payloadcms/plugin-search` — desactive V1 (incompat multi-tenant,
  hook afterChange rollback silencieux)

## Sites consommant le CMS

| Site | URL | Tenant |
|---|---|---|
| `sites/template-artisan/` | https://template-artisan.veridian.site | `artisan` |
| `sites/template-restaurant/` | https://template-restaurant.veridian.site | `restaurant` |
| `sites/demo-cms/` | https://demo-cms.veridian.site | `demo` |

Pattern **content-first** : `src/content/*.ts` = source de verite initiale,
seed-from-code provisionne le CMS avec exactement ces blocs.

## Backlog priorise

### P0 — Passage en prod (prochaine session, ~3h30)

Roadmap complete : **[`cms/docs/NEXT-SESSION-ROADMAP.md`](../../../cms/docs/NEXT-SESSION-ROADMAP.md)**

- [ ] **Phase 1 — Prod infra OVH** (45 min)
  - Postgres dedie sur Dokploy (`cms-postgres-prod`)
  - Service `cms.veridian.site` via Dokploy, source git
  - Migration initiale + seed super-admin bot
  - Backup auto Postgres vers R2
  - DNS `cms.veridian.site` Cloudflare proxied

- [ ] **Phase 2 — CI/CD `cms-ci.yml`** (30 min)
  - 5 couches : unit / build (GHCR) / e2e / deploy SSH / smoke
  - `concurrency: cancel-in-progress` anti-pile-de-runs
  - Secrets GH configures (CMS_DATABASE_URL_PROD, etc.)
  - Squelette deja pose dans `.github/workflows/cms-ci.yml`

- [ ] **Phase 3 — E2E Playwright headful** (1h)
  - Tests : login admin / tenant switch / page edit / form builder /
    API isolation / site render / magic link
  - Fixtures `tenant-per-test` idempotentes (cleanup on failure)
  - Screenshots pixel-perfect `maxDiffPixelRatio: 0.02`
  - Runner self-hosted dev-server + `xvfb-run` pour headful
  - Squelettes poses dans `cms/e2e/`

- [ ] **Phase 4 — Deploy + rollback auto** (30 min)
  - SSH OVH → pull + migrate + up --build
  - Health check retry 30x6s = 3min avant rollback
  - Endpoint `/api/health` pose dans `cms/src/endpoints/health.ts`
  - A brancher dans `payload.config.ts`

- [ ] **Phase 5 — Monitoring** (15 min)
  - Ajout de `cms.veridian.site` au healthcheck systemd dev-server
  - Alerte Telegram down > 2min
  - Alerte backup Postgres > 24h

### P1 — Fix critiques

- [ ] **Fix auto-seed formBlock**
  Actuellement le script seed-from-code ne sauvegarde pas les blocks
  `formBlock` (API accepte mais ne persiste pas, surement un champ relation
  qui echoue silencieusement). Workaround V1 : ajouter le bloc manuellement
  via l'UI admin.
  Investigation : logs CMS lors du POST, verifier format attendu du champ
  `form` (id numerique, objet, relationship type).

- [ ] **Fix plugin-search + multi-tenant**
  Le hook afterChange de `@payloadcms/plugin-search` cree un doc search sans
  tenant → ValidationError → rollback silencieux. Solution : custom
  beforeChange hook qui injecte le tenant depuis le doc source. A tester
  sur un tenant dedie, puis reactiver le plugin.

### P2 — Enrichissement fonctionnel

- [ ] **Script unique `provision-client.ts` tout-en-un**
  Enchainer : seed-from-code + creation user humain + magic link +
  creation projet CF Pages via API + Deploy Hook + stockage sur tenant.
  Objectif : 1 commande = client operationnel en < 3 min.

- [ ] **Auto-creation CF Pages via API** (vs clic-bouton UI)
  Endpoint `POST /accounts/:id/pages/projects`. Challenge : config build
  (root, command, env vars) via API.

- [ ] **Auto-connexion GitHub → CF Pages via API**
  Installation GitHub App + binding projet. Complexe mais interessant.

- [ ] **Storage R2 Cloudflare pour images**
  `@payloadcms/storage-s3` configure avec endpoint R2. Evite explosion
  disque VPS (deja 72%). Migration : script qui re-upload medias existants.

- [ ] **Custom email templates** (magic link + welcome) avec MJML
  Pattern deja utilise dans le skill `notifuse-templates`. Branding
  Veridian complet.

### P3 — UI / UX avances

- [ ] **Catalogue dynamique avec filtres editables** (pour clients e-commerce)
  Collections Products + Categories + **Filters** (slug/type/field/mergeable/options).
  Le client peut dans son admin :
    - Creer un filtre "Marque" avec valeurs libres
    - Fusionner 2 filtres existants en 1
    - Reordonner les filtres (drag-n-drop Payload natif via `order`)
    - Activer/desactiver un filtre par page categorie
  Cote site : block `CategoryPage` + API route Next qui match produits.
  Effort ~2-3 jours pour catalogue bien ficele (pas un POC).
  A faire quand premier client catalogue arrive (ex: Apical Informatique).

- [ ] **Profils de tenants** (UI / collections variables par client)
  Pour les clients complexes (catalogue, boutique, blog multi-auteurs),
  ajouter un champ `tenant.profile` et activer conditionnellement des
  collections via `admin.condition`. Pattern inspire de l'exemple officiel
  `~/.claude/docs/payload-examples/multi-tenant/`. Effort ~1 jour. A faire
  quand premier client "complexe" arrive, pas avant.

- [ ] **Polish admin Payload "pro"** (au-dela du white-label basique)
  L'admin actuel est fonctionnel mais neutre (type Supabase dashboard).
  Pour donner un vrai "wow effect" sur les demos clients :
    - Override `admin.components` pour Dashboard/ListView/EditView custom
    - Widgets dashboard : "dernieres pages publiees", "vues 7j" (analytics)
    - ListView en preview cards au lieu de tableau pour les Pages
    - Sidebar de presets/templates sur EditView
  Effort ~1 jour. **Ne PAS faire avant un besoin client concret** — l'admin
  actuel est deja mieux qu'un WordPress pour la plupart des PME.

### 🌟 AXE STRATEGIQUE LONG TERME — Editeur visuel premium

> **Decision Robert (2026-04-25)** : a terme, Veridian doit avoir un
> editeur de pages visuel "wow" pour **justifier des prix de site eleves**
> face aux clients. C'est un differentiateur business, pas une feature
> technique optionnelle.
>
> Pas de date imposee — moment opportun a definir, mais c'est dans la
> trajectoire du produit.

**Vision** : quand un prospect compare Veridian avec un freelance WordPress
a 1500€, il doit dire "ah, l'admin c'est tres different, je peux modifier
mon site comme sur Webflow" → ça permet de tarifer ~3000-5000€ en creation
+ maintenance plus elevee.

**Phase 1 — Etat actuel (V1 prod)**
- Pattern `blocks` Payload natif + iframe side-by-side
- Suffisant pour les premieres PME (Morel, Tramtech, Dupont BTP) qui
  viennent de WordPress
- Permet de livrer ET facturer ces premiers clients pour generer cashflow

**Phase 2 — Tester `@delmaredigital/payload-puck`** (quand le plugin sera mur)
- Plugin communautaire qui ajoute Puck Editor dans Payload
- npm : `@delmaredigital/payload-puck` (https://github.com/delmaredigital/payload-puck)
- Ce que ca apporte : click-to-edit visuel sur canvas + Puck AI (generation
  par prompt) + fields custom (MediaField, ColorPicker, Padding, etc.)
- Etat 2026-04-25 : 58 stars, v0.6.23, **bug de securite access control
  fixe le 6 avril 2026** → trop jeune pour un multi-tenant
- **A re-evaluer** quand le plugin aura :
    - v1.0+ (API stable)
    - 500+ stars (adoption)
    - 6 mois sans bug de securite critique
    - Compat multi-tenant officiellement testee
- Effort integration : ~1-2 jours pour adapter Hero/Services/etc. en
  composants Puck

**Phase 3 — Eventuelle solution custom** (si Puck reste pas mur)
- Fork des bases (Payload natif + Puck open-source MIT) pour faire
  un editeur Veridian premium
- Coherent avec ton modele plateforme : fields custom, AI, integrations
  Veridian Analytics intégrées, etc.
- **Coût realiste : 1-2 mois de dev solo + maintenance a vie**
- A justifier par : minimum 3-5 clients a tarif eleve qui paient ce
  differenciateur, ou demande explicite d'un client haut de gamme

**Decision moment** : pas avant que :
- ✅ V1 prod soit stable (~prochaine session)
- ✅ 1-2 vrais clients soient livres avec V1 (cashflow generee)
- ✅ Retour client confirme : "l'admin pourrait etre plus visuel" est une
  vraie objection commerciale, pas un nice-to-have

**Quand ca arrive, ressources utiles** :
- Plugin reference : https://github.com/delmaredigital/payload-puck
- Starter exemple : https://github.com/delmaredigital/dd-starter
- POC simple : https://github.com/Copystrike/puckload-poc
- Doc Puck : https://puckeditor.com
- Pattern Payload custom field : `~/.claude/docs/payload/custom-components/`

- [ ] **Click-to-edit inline sur la preview** (Webflow-style)
  **Pas natif Payload**, sur leur roadmap. Solution custom = injection
  script dans site preview, detection clics sur `data-cms-field="X"`,
  ouverture admin sur le bon champ. 2-3 jours dev + maintenance. **A ne
  PAS faire avant 5+ clients payants.**

- [ ] **Logo du client dans SON admin** (vs logo Veridian generique)
  Composant custom qui lit `tenant.logo` et override `admin.components.graphics.Icon`.
  Feature "wow" relativement simple. ~2h.

- [ ] **Collection `SiteSettings` globale par tenant**
  Pour tout ce qui n'est pas block/page : fonts, favicon custom, couleurs
  brand (primary/accent), politique cookies. A ajouter quand plusieurs
  clients ont des besoins de branding avance.

- [ ] **Custom CSS admin** (au-dela du white-label default)
  Override des CSS variables Payload pour avoir du vert Veridian en
  primary, corners plus arrondis, shadows douces. ~30 min.

- [ ] **Pre-seed images** (Unsplash ou AssetBank) dans le seed
  Actuellement le client voit un CMS avec 0 medias. Pre-seeder 3-4 photos
  d'exemple par site pour demonstration visuelle immediate.

### P4 — Tests et qualite

- [ ] Tests e2e d'isolation multi-tenant dans la CI (clé artisan ne voit
  pas restaurant) → couverture explicite du risque #1 de securite.

- [ ] Charger plusieurs langues FR/EN/DE sur les sites clients (feature
  `localization` native Payload).

## Decisions techniques

### 2026-04-24 — Architecture V1 validee

- **Postgres** (pas MongoDB) — coherent avec stack Veridian
- **1 seule instance multi-tenant** (pas N instances) — tenant isolation
  via plugin multi-tenant officiel
- **Auto-deploy CF Pages connecte a git** par client (pas de workflow
  GH Actions custom) — scale infini sans maintenance
- **Content-first pattern** : `src/content/*.ts` = source de verite initiale
- **Magic links** via SMTP Brevo (pas link natif Payload)
- **Plugin-search desactive** V1 (incompat multi-tenant)
- **Plugin multi-tenant en DERNIER** dans l'ordre des plugins (sinon il
  ne wrappe pas les collections ajoutees par les autres plugins)

### Choix a valider plus tard

- **i18n sur les sites** — pour l'instant sites mono-lang FR. Payload a
  une `localization` config native, a activer si un client bilingue arrive.
- **Versionning Git des migrations** — actuellement migrations dans le
  repo, commit a chaque changement de schema. OK pour 1 dev. A revoir si
  une equipe rejoint.

## Bugs connus

- **formBlock auto-seed silencieusement rejete** (voir P1) — workaround
  manuel via UI admin.
- **Cookie tenant obsolete apres reset DB** — fix = re-selectionner un
  tenant dans le dropdown admin.
- **Super-admin voit 0 docs sans tenant selectionne** (comportement
  volontaire du plugin multi-tenant) — pas un bug.

## Metriques de succes V1

- ✅ Admin CMS en FR, white-label, light mode
- ✅ 3 tenants isoles testes (clés API ne franchissent pas la frontiere)
- ✅ 3 sites live sur CF Pages (demo/artisan/restaurant)
- ✅ Magic link fonctionnel via Brevo
- ✅ Header + Footer editables par tenant
- ✅ Pages avec 7 types de blocks
- ✅ SEO par page
- ✅ Formulaires editables par le client (avec reserve sur auto-seed formBlock)
- ⏳ Prod deployed → objectif prochaine session
