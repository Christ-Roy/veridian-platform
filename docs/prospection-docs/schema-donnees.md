# Schema des données scrapées — scan.db

> **Ce fichier doit être mis à jour à chaque ajout/modification de colonne dans la DB.**
> Voir la section "Où sont définies les colonnes" en fin de document.

## Vue d'ensemble

Le scan visite jusqu'à **4 pages par domaine** :
1. **Homepage** (HTTPS puis HTTP fallback)
2. **Mentions légales** (lien `mentions-legales`, `legal`, `cgu`, `cgv`)
3. **Page contact** (lien `contact`, `nous-contacter`, `contactez-nous`)
4. **Page à propos** (lien `a-propos`, `about`, `qui-sommes-nous`, `notre-societe`, `equipe`)

Les données sont extraites par regex, parsing HTML et JSON-LD (schema.org).

---

## Table `domains`

Table de suivi de l'état du scan pour chaque domaine.

| Colonne | Type | Description |
|---------|------|-------------|
| `domain` | TEXT PK | Nom de domaine (ex: `menuiserie-durand.fr`) |
| `status` | TEXT | État : `todo`, `done`, `error`, `excluded`, `redflag` |
| `error_msg` | TEXT | Message d'erreur ou raison d'exclusion |
| `scanned_at` | TEXT | Timestamp ISO du scan |

---

## Table `results`

Table principale contenant toutes les données extraites.

### Identité de l'entreprise

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `domain` | TEXT PK | — | Nom de domaine |
| `societe_name` | TEXT | Homepage, legal, about | Nom de la société. Priorité : JSON-LD > copyright footer (`© 2024 Nom`) > `og:site_name` > titre `<title>`. Nettoyé via `clean_societe_name()` (filtre URLs, artefacts, > 80 chars) |
| `societe_name_source` | TEXT | — | Source du nom : `jsonld`, `copyright_footer`, `og_site_name`, `title`, `mentions_legales`, `about_page` |
| `siret` | TEXT | Legal, homepage | SIRET 14 chiffres. Regex après mot-clé "siret/siren". Filtre les tout-zéros et tout-même-chiffre |
| `siren` | TEXT | Legal, homepage | SIREN 9 chiffres. 9 premiers du SIRET, ou standalone après mot-clé "siren" |
| `rcs` | TEXT | Legal | Inscription RCS (ex: `RCS Paris 123 456 789`) |
| `capital` | TEXT | Legal | Capital social (ex: `10 000`) — regex après "capital...€/euros" |
| `forme_juridique` | TEXT | Legal | Forme juridique détectée : SARL, SAS, SASU, EURL, SA, SCI, SNC, SCOP, EI, EIRL, Auto-entrepreneur, Micro-entreprise |
| `tva_intracom` | TEXT | Legal | N° TVA intracommunautaire (ex: `FR12345678901`) |
| `dirigeant_nom` | TEXT | Legal | Nom du dirigeant. Extraction en 2 étapes : 1) regex rôle (gérant, président, directeur...) 2) regex nom (Prénom Nom avec casse). Filtre blacklist célébrités et mots parasites |
| `address` | TEXT | Homepage, legal, contact, JSON-LD | Adresse postale (ex: `12 rue de la Paix`). Regex : numéro + type voie + nom voie. JSON-LD `streetAddress` prioritaire |
| `code_postal` | TEXT | Homepage, legal, contact, JSON-LD | Code postal 5 chiffres. Sources : JSON-LD `postalCode` > regex CP+Ville > fallback footer (3000 derniers chars) |
| `ville_mentionnee` | TEXT | Homepage, legal, contact, JSON-LD | Ville. Sources : JSON-LD `addressLocality` > regex CP+Ville. Filtre faux positifs (RN, BP, CS, Cedex) |
| `code_naf` | TEXT | — | Code NAF. **Non peuplé par le scan** — réservé pour enrichissement futur |
| `date_creation_mentionnee` | TEXT | Legal | Année de création (regex "depuis/créée en/fondée en YYYY") |

### Contacts

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `emails` | TEXT (JSON) | Homepage, legal, contact | JSON array d'emails (max 10). Filtrés : extensions images, hash Sentry/Wix, domaines techniques (wix.com, ovh.net...), placeholders (votre@, example.com) |
| `email_principal` | TEXT | — | Meilleur email pour prospection. Priorité : email sur domaine propre > `contact@`/`info@` > premier de la liste |
| `phones` | TEXT (JSON) | Homepage, contact, JSON-LD | JSON array de téléphones normalisés en `0XXXXXXXXX`. Sources : 1) `<a href="tel:">` (le plus fiable) 2) regex dans texte visible (hors `<script>`, `<style>`, `<svg>`, attributs HTML). Filtre faux numéros CSS/RGB et numéros répétitifs |
| `phone_principal` | TEXT | — | Meilleur téléphone pour prospection. Priorité : mobile (06/07) > VoIP (09) > fixe (01-05) |
| `phone_type` | TEXT | — | Type du phone_principal : `fixe`, `mobile`, `voip`, `special`, `autre` |
| `social_linkedin` | TEXT | Homepage, JSON-LD | URL page LinkedIn `/company/...`. Sources : href regex + JSON-LD `sameAs` |
| `social_facebook` | TEXT | Homepage, JSON-LD | URL page Facebook |
| `social_instagram` | TEXT | Homepage, JSON-LD | URL page Instagram |
| `social_twitter` | TEXT | Homepage, JSON-LD | URL page Twitter/X |
| `social_youtube` | TEXT | Homepage | URL chaîne YouTube (`/channel/`, `/c/`, `/@`, `/user/`) |
| `has_contact_form` | INTEGER | Homepage, contact | 1 si balise `<form>` détectée |
| `has_chat_widget` | INTEGER | Homepage | 1 si widget chat détecté (Crisp, Intercom, Tawk.to, HubSpot, Zendesk, Drift, LiveChat) |
| `has_cookie_banner` | INTEGER | Homepage | 1 si bandeau cookies/RGPD détecté (solution nommée ou générique) |
| `cookie_banner_name` | TEXT | Homepage | Nom de la solution : tarteaucitron, axeptio, cookiebot, onetrust, didomi, complianz, cookie-law-info, quantcast, sirdata, cookiefirst (NULL si générique ou absent) |

### Données techniques

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `final_url` | TEXT | Homepage | URL finale après redirections (max 5 redirects) |
| `http_status` | INTEGER | Homepage | Code HTTP. -1 = timeout, -2 = erreur connexion |
| `has_https` | INTEGER | Homepage | 1 si l'URL finale commence par `https://` |
| `response_time_ms` | INTEGER | Homepage | Temps de réponse en millisecondes |
| `html_size` | INTEGER | Homepage | Taille du HTML en bytes |
| `server_header` | TEXT | Homepage | Header HTTP `Server` (ex: `Apache/2.4`, `nginx`) |
| `powered_by` | TEXT | Homepage | Header HTTP `X-Powered-By` brut (ex: `PHP/5.4.45`, `ASP.NET`, `Express`). Révèle la techno backend. NULL si absent (nginx/Apache cachent souvent ce header) |
| `php_version` | TEXT | Homepage | Version PHP extraite de `X-Powered-By` (ex: `5.4.45`, `7.4.33`, `8.2.0`). PHP < 7 = dette technique majeure + faille de sécurité. NULL si pas PHP |
| `has_security_headers` | INTEGER | Homepage | 1 si au moins 1 header de sécurité parmi : Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options. Absent = site pas maintenu |
| `security_headers_count` | INTEGER | Homepage | Nombre de headers de sécurité présents (0-4). 0 = négligence totale, 4 = site bien configuré |
| `last_modified_header` | TEXT | Homepage | Header HTTP `Last-Modified` brut (ex: `Tue, 15 Nov 2022 12:45:26 GMT`). Plus fiable que copyright_year pour détecter un site abandonné. NULL si absent |
| `doctype` | TEXT | Homepage | Type de DOCTYPE : `html5`, `xhtml1.0`, `xhtml1.1`, `html4`, `other`, ou NULL. XHTML/HTML4 = site garanti >10 ans |
| `h1_count` | INTEGER | Homepage | Nombre de balises `<h1>` (max 99). 0 ou >1 = mauvais SEO / site amateur |
| `title` | TEXT | Homepage | Contenu de `<title>` (max 200 chars) |
| `meta_description` | TEXT | Homepage | Contenu de `<meta name="description">` (max 300 chars) |
| `generator` | TEXT | Homepage | Contenu de `<meta name="generator">` (ex: `WordPress 6.4.2`) |
| `cms` | TEXT | Homepage | CMS détecté : `wordpress`, `joomla`, `drupal`, `prestashop`, `typo3`, `spip`. Détection par generator + paths (`/wp-content/`, `/wp-includes/`, etc.) |
| `cms_version` | TEXT | Homepage | Version du CMS extraite du generator |
| `platform_name` | TEXT | Homepage | Plateforme hébergée : `wix`, `shopify`, `squarespace`, `webflow`, `jimdo`, `weebly`, `duda`. Détection par marqueurs dans le HTML |
| `has_responsive` | INTEGER | Homepage | 1 si `<meta name="viewport">` présent |
| `has_favicon` | INTEGER | Homepage | 1 si `<link rel="icon">` ou variantes |
| `has_old_html` | INTEGER | Homepage | 1 si tags obsolètes : `<font>`, `<center>`, `<marquee>`, `<frameset>`, `<frame>`, `bgcolor=` |
| `has_flash` | INTEGER | Homepage | 1 si `.swf` ou `shockwave-flash` détecté |
| `has_layout_tables` | INTEGER | Homepage | 1 si `<table>` avec `width=`, `cellpadding`, `cellspacing` ou `bgcolor=` (mise en page par tableaux, années 2000) |
| `inline_style_count` | INTEGER | Homepage | Nombre d'attributs `style=""` (max 9999). Beaucoup = code fait main / vieux site |
| `inline_js_events_count` | INTEGER | Homepage | Nombre d'événements JS inline (`onclick=`, `onmouseover=`, `onload=`, etc., max 999). Beaucoup = code spaghetti / vieux site fait main |
| `has_old_images` | INTEGER | Homepage | 1 si `<img>` avec `.gif` ou `.bmp` |
| `has_phpsessid` | INTEGER | Homepage | 1 si cookie `PHPSESSID` détecté (PHP brut sans framework moderne) |
| `jquery_version` | TEXT | Homepage | Version jQuery (ex: `1.12.4`). Vieilles versions = dette technique |
| `bootstrap_version` | TEXT | Homepage | Version Bootstrap (ex: `3.3.7`) |
| `has_ie_polyfills` | INTEGER | Homepage | 1 si html5shiv, respond.js, selectivizr, css3-mediaqueries (polyfills IE8/9) |
| `placeholder_links_count` | INTEGER | Homepage | Nombre de `href="#"` ou `javascript:void` (max 999). Site bâclé / template non fini |
| `imgs_missing_alt_pct` | INTEGER | Homepage | % d'images sans attribut `alt` (accessibilité) |
| `has_hreflang` | INTEGER | Homepage | 1 si balises `hreflang` (site multilingue) |
| `has_whatsapp` | INTEGER | Homepage | 1 si lien WhatsApp (`wa.me/`) |
| `has_viewport_no_scale` | INTEGER | Homepage | 1 si `user-scalable=no` ou `maximum-scale=1` (mauvaise pratique mobile) |
| `copyright_year` | INTEGER | Homepage | Année copyright la plus récente. Stratégie élargie : `© 2024` > range `© 2015-2024` > inversé `2024 ©` > fallback footer. Plage 2000-2026 |
| `analytics_type` | TEXT | Homepage | Type analytics : `GA4`, `UA_deprecated`, `GTM+GA4`, `GTM`, `matomo`, `plausible`, `none` |
| `has_facebook_pixel` | INTEGER | Homepage | 1 si `fbq()` ou `facebook.com/tr` |
| `has_linkedin_pixel` | INTEGER | Homepage | 1 si `_linkedin_partner_id` ou `snap.licdn.com` |
| `has_google_ads` | INTEGER | Homepage | 1 si `adsbygoogle`, `googlesyndication`, `google_ads`, `conversion/async`. **⚠ Capte AdSense (éditeur) autant qu'annonceur — fiabilité faible pour le scoring** |
| `has_schema_org` | INTEGER | Homepage | 1 si `schema.org` ou `application/ld+json` |
| `has_og_tags` | INTEGER | Homepage | 1 si `property="og:"` (Open Graph) |
| `has_canonical` | INTEGER | Homepage | 1 si `rel="canonical"` |
| `has_meta_keywords` | INTEGER | Homepage | 1 si `<meta name="keywords">` présent. Google ignore cette balise depuis 2009 → signal de vieux SEO non maintenu |
| `has_noindex` | INTEGER | Homepage | 1 si `<meta name="robots" content="...noindex...">` détecté dans html_no_comments. Site de staging, suspendu ou erreur SEO grave → pas un bon prospect. Gère les 2 ordres d'attributs (name/content et content/name) |
| `has_modern_images` | INTEGER | Homepage | 1 si `.webp`, `.avif` ou `srcset=` |
| `has_minified_assets` | INTEGER | Homepage | 1 si `.min.css` ou `.min.js` |
| `has_compression` | INTEGER | Homepage | 1 si header `Content-Encoding` présent (gzip/brotli) |
| `has_cdn` | INTEGER | Homepage | 1 si Cloudflare, Fastly, Akamai ou CDN77 détecté dans headers |
| `has_mixed_content` | INTEGER | Homepage | 1 si site HTTPS chargeant des ressources (src/href) en HTTP. Exclut les namespaces XML (w3.org) et schema.org. Signal de négligence technique |
| `has_lorem_ipsum` | INTEGER | Homepage | 1 si texte Lorem ipsum détecté (lorem ipsum, dolor sit amet, consectetur adipiscing). Signal de site abandonné / template non configuré. Exclut les commentaires HTML |
| `page_builder_name` | TEXT | Homepage | Nom du page builder WordPress détecté : elementor, divi, wpbakery, beaver-builder, avada, oxygen, brizy (NULL si aucun). Détection via marqueurs CSS/data-attrs dans html_no_comments |
| `js_framework_name` | TEXT | Homepage | Framework JS front-end détecté : nextjs, react, nuxtjs, vue, angular, svelte (NULL si aucun). Anti-lead : site moderne = pas besoin de refonte. Priorité : Next.js > React, Nuxt.js > Vue. Détection via marqueurs spécifiques (id="__next", data-reactroot, data-v-, ng-version, etc.) dans html_no_comments |
| `css_framework_name` | TEXT | Homepage | Framework CSS détecté : tailwind, bulma, foundation (NULL si aucun). Bootstrap est déjà dans bootstrap_version. Tailwind = anti-lead (site moderne). Détection via marqueurs spécifiques (CDN URLs, noms de fichiers CSS) dans html_no_comments |
| `has_trust_signals` | INTEGER | Homepage | 1 si widget/badge d'avis vérifiés détecté (Trustpilot, Avis Vérifiés, TripAdvisor, Trusted Shops, eKomi, Guest Suite, Société des Avis Garantis, Custplace, etc.). Détection via marqueurs spécifiques (classes CSS, domaines widgets) dans html_no_comments. Signal de maturité business |
| `agency_signature` | TEXT | Homepage | Nom de l'agence web ayant créé le site, extrait de mentions "réalisé par", "conçu par", "créé par", "développé par", "propulsé par", "powered by", "conception :", "création du site :". Extrait le texte du lien `<a>` si présent, sinon le texte brut. Exclut CMS/plateformes (WordPress, Wix, etc.) et commentaires HTML. NULL si non trouvé |
| `language` | TEXT | Homepage | Attribut `lang` de `<html>` (ex: `fr`, `fr-FR`) |

### Signaux commerciaux (pitch)

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `has_pdf_menu` | INTEGER | Homepage | 1 si lien vers PDF contenant "menu", "carte", "tarif" ou "prix" dans le href ou texte du lien. Argument : "Vos clients mobile doivent DL un PDF pour voir vos prix" |
| `has_broken_social` | INTEGER | Homepage | 1 si lien vers facebook.com/ ou instagram.com/ (home) au lieu d'une page spécifique. Argument : "Vous envoyez vos visiteurs sur l'accueil Facebook" |
| `has_tel_link` | INTEGER | Homepage | 1 si `<a href="tel:...">` trouvé (téléphone cliquable sur mobile). Si absent avec téléphone affiché = argument pitch |
| `has_form_mailto` | INTEGER | Homepage | 1 si `<form action="mailto:...">`. Technique des années 90/2000 qui ouvre le client mail au lieu d'envoyer |
| `has_spam_seo` | INTEGER | Homepage | 1 si site hacké : viagra, cialis, casino online, "[marque] pas cher", texte chinois/cyrillique sur site FR |
| `has_wp_obsolete_plugin` | INTEGER | Homepage | 1 si plugin WP premium obsolète détecté (Slider Revolution < 6.0, WPBakery < 6.0). Faille sécurité + licence expirée |
| `has_redirect_annuaire` | INTEGER | Homepage | 1 si le domaine redirige vers un annuaire (PagesJaunes, Travaux.com, Houzz, Facebook, Yelp, MeilleursArtisans). Alias de is_directory_redirect |
| `is_directory_redirect` | INTEGER | Homepage | 1 si final_url contient un domaine d'annuaire/réseau social et que le domaine original n'est pas dans l'URL |
| `hosting_provider` | TEXT | Headers | Hébergeur détecté via cookies/headers (ex: "ovh_legacy_shared") |
| `ovh_cluster_legacy` | INTEGER | Headers | 1 si cluster OVH ancien (< 030) ou plan legacy (90plan, 240plan) détecté dans les cookies |
| `has_zombie_plugins` | INTEGER | Homepage | Alias de has_wp_obsolete_plugin (rétro-compat Gemini) |

### Signaux business

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `has_mentions_legales` | INTEGER | Homepage | 1 si lien vers page mentions légales trouvé et page accessible (HTTP 200) |
| `has_devis` | INTEGER | Homepage | 1 si mots-clés : "devis", "devis gratuit", "demander un devis", "estimation gratuite", "tarifs", "nos prix", "grille tarifaire" |
| `has_ecommerce` | INTEGER | Homepage | 1 si signaux e-commerce : "panier", "add-to-cart", "woocommerce", "boutique en ligne", "ajouter au panier", "prestashop" |
| `has_recruiting_page` | INTEGER | Homepage | 1 si mots-clés recrutement : "recrute", "recrutement", "carriere", "emploi", "rejoignez-nous" |
| `has_blog` | INTEGER | Homepage | 1 si lien vers `/blog`, `/actualit`, `/news` |
| `has_google_maps` | INTEGER | Homepage | 1 si intégration Google Maps (maps.google, google.com/maps, maps.googleapis) |
| `has_horaires` | INTEGER | Homepage | 1 si mots-clés horaires : "horaires", "ouvert du", "heures d'ouverture", "lundi", "mardi" |
| `has_booking_system` | INTEGER | Homepage | 1 si plateforme de réservation en ligne détectée (Calendly, Doctolib, Planity, Reservio, SimplyBook, ClicRDV, Timify). Détection via domaines spécifiques dans html_no_comments. Signal business positif : entreprise de service active qui investit dans l'acquisition |
| `has_newsletter_provider` | INTEGER | Homepage | 1 si outil d'emailing/newsletter détecté (Mailchimp, Brevo/Sendinblue, ActiveCampaign, ConvertKit, MailerLite, HubSpot). Détection via marqueurs techniques (domaines formulaires, CDN scripts, classes CSS) dans html_no_comments. Signal business positif : maturité marketing, volonté de construire une audience |
| `has_certifications` | INTEGER | Homepage | 1 si certification professionnelle française détectée (Qualibat, RGE, Qualiopi, Datadock, Qualifelec, Qualipac, Qualigaz, Qualibois, Qualipv, OPQIBI). Artisan certifié avec site vétuste = lead premium. RGE détecté par word boundary pour éviter faux positifs (orangerie, hébergement) |
| `certifications_list` | TEXT | Homepage | Liste des certifications trouvées séparées par virgule (ex: `qualibat,rge`), triée alphabétiquement, dédupliquée. NULL si aucune |
| `has_app_links` | INTEGER | Homepage | 1 si lien App Store (apps.apple.com/xx/app) ou Google Play (play.google.com/store/apps) détecté dans html_no_comments. Signal business : budget tech élevé (dev + maintenance app mobile) |
| `has_lazy_loading` | INTEGER | Homepage | 1 si lazy loading détecté : `loading="lazy"` (HTML5 natif) ou `<img/iframe data-src=` (libs JS lazysizes, lozad). Signal de modernité, absence = site > 3 ans. Utilise html_no_comments_lower |
| `nb_pages_internes` | INTEGER | Homepage | Nombre de liens internes détectés (max 999) |
| `mots_cles_metier_trouves` | TEXT (JSON) | Homepage | JSON array de mots-clés métier trouvés (max 20). 4 catégories : BTP (plombier, électricien...), ProfLib (avocat, dentiste...), Commerce (restaurant, coiffeur...), Services (nettoyage, formation...) |

### Classification (Phase 2, pré-scoring)

Colonnes écrites pendant le scan (`scan_sites.py`) et par `rescore_results.py` (v1, obsolète).

| Colonne | Type | Description |
|---------|------|-------------|
| `niveau` | TEXT | Classification pré-scoring : `gold`, `silver`, `poubelle`, `excluded`, `redflag` |
| `raison_exclusion` | TEXT | Raison d'exclusion. Valeurs possibles : parking, hebergeur_defaut, contenu_vide, redirect_facebook/linkedin/etc., http_NNN, redflag_asso, redflag_blog, redflag_blog_heberge, redflag_annuaire, redflag_spam, aucun_signal_business |
| `score_pertinence` | REAL | Score v1 (obsolète, remplacé par scoring v2 phase 3) |
| `score_business_signals` | REAL | Sous-score v1 (obsolète) |
| `score_tech_debt` | REAL | Sous-score v1 (obsolète) |
| `score_modernity_penalty` | REAL | Sous-score v1 (obsolète) |

### Scoring v2 (Phase 3, multiplicatif)

Calculé par `scripts/phase3_scoring/score_leads.py` (à implémenter).
Config complète : `scripts/phase3_scoring/scoring_config.py`.

Colonnes prévues (ajoutées par ALTER TABLE) :

| Colonne | Type | Description |
|---------|------|-------------|
| `score_final` | REAL | Score normalisé 0-100 (diviseur cible = 500) |
| `score_tech_debt_v2` | REAL | Points dette technique bruts (0-100, 28 signaux) |
| `score_tech_adjusted` | REAL | Après multiplicateur copyright |
| `score_business_proof` | REAL | Coefficient business (0.0-2.5, gatekeeper) |
| `score_sector_bonus` | REAL | Multiplicateur secteur × plateforme |
| `score_financial_mult` | REAL | Multiplicateur effectifs × forme juridique × CA |
| `scoring_version` | TEXT | Version du scoring (`v2`) |
| `scoring_details` | TEXT (JSON) | Détail de chaque signal matché (debug/audit) |
| `lead_class` | TEXT | Classification finale : `hot` (≥70), `warm` (≥40), `lukewarm` (≥20), `cold` (<20) |

**Formule** : `score_raw = TechDebt × CopyrightMult × BusinessProof × SectorBonus × FinancialMult`

**Kill switches** (score = 0) : entreprise fermée, procédure collective, association, excluded/redflag

### Enrichissement API

Colonnes ajoutées dynamiquement par `enrich_leads.py` (ALTER TABLE).

| Colonne | Type | Source | Description |
|---------|------|--------|-------------|
| `api_nom_complet` | TEXT | API Recherche Entreprises | Nom complet de l'entreprise |
| `api_forme_juridique` | TEXT | API Recherche Entreprises | Nature juridique (label) |
| `api_code_naf` | TEXT | API Recherche Entreprises | Code activité principale NAF |
| `api_date_creation` | TEXT | API Recherche Entreprises | Date de création |
| `api_effectifs` | TEXT | API Recherche Entreprises | Tranche d'effectifs salariés |
| `api_ville` | TEXT | API Recherche Entreprises | Ville du siège social |
| `api_etat` | TEXT | API Recherche Entreprises | État administratif : `A` (Actif), `F` (Fermé) |
| `api_est_asso` | INTEGER | API Recherche Entreprises | 1 si association |
| `api_ferme` | INTEGER | — | 1 si `api_etat = 'F'` |
| `bodacc_procedure` | TEXT | API BODACC | Procédure collective (liquidation, redressement, sauvegarde) |
| `enriched` | INTEGER | — | 1=OK, 0=not_found, -1=invalid, -2=name_blacklisted |
| `enriched_date` | TEXT | — | Date d'enrichissement (YYYY-MM-DD) |
| `enriched_via` | TEXT | — | Méthode : `siren` (99% précision), `name_cp` (~67% précision), `name_cp_not_found`, `name_blacklisted` |

### Metadata scan

| Colonne | Type | Description |
|---------|------|-------------|
| `scan_date` | TEXT | Date du scan (YYYY-MM-DD) |
| `pages_scannees` | INTEGER | Nombre de pages scannées (1-4) |
| `scan_duration_ms` | INTEGER | Durée totale du scan du domaine en ms |

### Annuaire CNB (Conseil National des Barreaux) — croisement open data

Source : [data.gouv.fr/annuaire-des-avocats-de-france](https://www.data.gouv.fr/datasets/annuaire-des-avocats-de-france), ~80K avocats, MAJ mensuelle.
Croisé par : SIREN, téléphone, nom+CP, nom extrait du domaine.

| Colonne | Type | Description |
|---------|------|-------------|
| `cnb_nom` | TEXT | Nom de famille de l'avocat (annuaire CNB) |
| `cnb_prenom` | TEXT | Prénom de l'avocat |
| `cnb_raison_sociale` | TEXT | Raison sociale du cabinet (CNB) |
| `cnb_siren` | TEXT | SIREN du cabinet (CNB) |
| `cnb_adresse` | TEXT | Adresse postale officielle (CNB) |
| `cnb_cp` | TEXT | Code postal (CNB) |
| `cnb_ville` | TEXT | Ville (CNB) |
| `cnb_tel` | TEXT | Téléphone officiel (CNB) |
| `cnb_barreau` | TEXT | Nom du barreau d'inscription |
| `cnb_specialite1` | TEXT | Spécialité juridique n°1 |
| `cnb_specialite2` | TEXT | Spécialité juridique n°2 |
| `cnb_specialite3` | TEXT | Spécialité juridique n°3 |
| `cnb_date_serment` | TEXT | Date de prestation de serment |
| `cnb_langues` | TEXT | Langues parlées |
| `cnb_match_method` | TEXT | Méthode de croisement : `siren`, `telephone`, `nom_cp`, `domain_cp`, `domain_nom_unique`, `domain_nom_ville` |
| `est_encore_avocat` | INTEGER | 1 si trouvé dans l'annuaire CNB 2026, 0 sinon |
| `obsolescence_score` | INTEGER | Score d'obsolescence du site (0-14), somme de 14 signaux techniques |

### Colonnes calculées (matérialisées par le dashboard)

| Colonne | Type | Description |
|---------|------|-------------|
| `dept_computed` | TEXT | Département calculé : `COALESCE(api_departement, SUBSTR(code_postal, 1, 2))`. Indexé pour filtrage rapide |
| `tech_score` | INTEGER | Score dette technique (0-101). Somme de 17 signaux binaires. Indexé pour tri rapide |

---

## Filtres d'exclusion appliqués pendant le scan

### Exclusions dures (`check_exclusion`)
Appliquées avant toute extraction. Le domaine est marqué `excluded` :
- **HTTP non-200** : statut HTTP autre que 200
- **Contenu vide** : HTML < 500 caractères
- **Redirect social** : redirection vers facebook.com, linkedin.com, instagram.com, youtube.com, twitter.com, x.com
- **Parking** : mots-clés type "domain for sale", "coming soon", "site en construction"
- **Hébergeur par défaut** : pages "it works!", "welcome to nginx", "apache2 default page", "plesk"

### Red flags (`check_redflags`)
Appliquées après extraction homepage. Le domaine est marqué `redflag` :
- **Association** : 2+ mots-clés parmi "loi 1901", "association à but non lucratif", "bénévolat", etc.
- **Blog personnel** : "mon blog", "journal personnel", "mes voyages"
- **Blog hébergé** : URL contient `wordpress.com` ou `blogspot`
- **Annuaire** : titre contient "annuaire", "top 10", "comparatif"
- **Spam** : "casino en ligne", "viagra", "streaming gratuit"

---

## Où sont définies les colonnes

> **Point d'attention pour un futur refactor** : les définitions de colonnes sont dispersées dans 3 fichiers.

| Fichier | Ce qu'il définit |
|---------|-----------------|
| `scan_sites.py` — `SCHEMA` (l.63-163) | CREATE TABLE `domains` et `results` avec toutes les colonnes du scan |
| `scan_sites.py` — `RESULT_COLUMNS` (l.425-448) | Liste ordonnée pour INSERT — **doit matcher le SCHEMA** |
| `enrich_leads.py` — `new_cols` (l.185-190) | 11 colonnes ajoutées par ALTER TABLE (enrichissement API) |

**Risque actuel** : ajouter une colonne au SCHEMA sans l'ajouter à `RESULT_COLUMNS` (ou inversement) provoque un décalage silencieux. Un refactor vers un fichier centralisé (`db_schema.py`) éliminerait ce risque.

---

## Table `pj_leads` — Leads PagesJaunes AURA (~estimé 50-100K lignes)

Source : scraping PagesJaunes.fr (entreprises référencées, clients Solocal)
DB source : `data/pagesjaunes.db` → sync vers `data/scan.db`

| Colonne | Type | Description |
|---------|------|-------------|
| `pj_id` | TEXT PK | ID PagesJaunes (8 chiffres) |
| `name` | TEXT | Nom de l'entreprise |
| `rue` | TEXT | Rue |
| `code_postal` | TEXT | Code postal (5 chiffres) |
| `ville` | TEXT | Ville |
| `departement` | TEXT | Slug département (ex: "rhone-69") |
| `address_full` | TEXT | Adresse complète |
| `phone_principal` | TEXT | Téléphone principal |
| `phones` | TEXT | Tous les téléphones (JSON array) |
| `website_url` | TEXT | URL du site web (PJ ou trouvé) |
| `website_domain` | TEXT | Domaine extrait |
| `website_found_via` | TEXT | "pj" / "scan_db_siren" / "scan_db_name" / "domain_guess" / null |
| `activites_pj` | TEXT | Activités listées sur PJ |
| `categories` | TEXT | Catégories PJ où trouvé (JSON array) |
| `description` | TEXT | Description de l'entreprise |
| `nb_avis_pj` | INTEGER | Nombre d'avis PagesJaunes |
| `rating_pj` | TEXT | Note PJ |
| `siret` | TEXT | SIRET (14 chiffres) |
| `siren` | TEXT | SIREN (9 chiffres) |
| `api_nom_complet` | TEXT | Raison sociale officielle |
| `api_forme_juridique` | TEXT | Code forme juridique |
| `api_code_naf` | TEXT | Code NAF officiel |
| `api_date_creation` | TEXT | Date de création |
| `api_etat` | TEXT | "A" (active) / "F" (fermée) |
| `api_categorie` | TEXT | "PME" / "ETI" / "GE" / "TPE" |
| `api_effectifs` | TEXT | Tranche effectifs |
| `api_ca` | INTEGER | Chiffre d'affaires en euros |
| `api_dirigeant` | TEXT | Nom du dirigeant |
| `matched_domain` | TEXT | Domaine dans table `results` si trouvé |
| `matched_via` | TEXT | "siren" / "name_cp" / null |
| `pj_url` | TEXT | URL fiche PJ |
| `scraped_at` | TEXT | Date du scraping |
| `enriched_at` | TEXT | Date d'enrichissement API |
| `synced_at` | TEXT | Date de sync vers scan.db |

Relations :
- `pj_leads.matched_domain` → `results.domain` (optionnel, si croisement trouvé)
- `pj_leads.siren` peut correspondre à `results.siren` (même entreprise, source différente)
