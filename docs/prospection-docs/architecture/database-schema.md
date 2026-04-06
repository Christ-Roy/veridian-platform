# Database Schema — Prospection

> Date: 2026-03-31 | Prisma 6.19.2 | PostgreSQL 15
> Migrations: 0001_init, 0002_add_tenant_id, 0003_composite_pk_multi_tenant

## Tables overview

| Table | Rows (staging) | PK | Multi-tenant | Description |
|-------|---------------|-----|--------------|-------------|
| results | 438K | domain | Non (shared) | Donnees prospects (web scan + enrichissement) |
| email_verification | ~45K | domain | Non | Verification SMTP emails dirigeants |
| phone_verification | ~200 | domain | Non | Validation telephone (Telnyx) |
| outreach | 0+ | (domain, tenant_id) | **Oui** | Suivi prospection (status, notes, qualification) |
| claude_activity | 0+ | id (auto) | **Oui** | Historique activites IA |
| followups | 0+ | id (auto) | **Oui** | Rappels planifies |
| outreach_emails | 0+ | id (auto) | **Oui** | Emails envoyes |
| call_log | 0+ | id (auto) | **Oui** | Journal d'appels (Telnyx) |
| lead_segments | 0+ | (domain, segment, tenant_id) | **Oui** | Segments manuels |
| pipeline_config | 0+ | (key, tenant_id) | **Oui** | Config pipeline (column order, settings) |
| pj_leads | ~4.6K | pj_id | Non | Leads Pages Jaunes |
| ovh_monthly_destinations | 0+ | (month, destination) | Oui | Suivi conso telephonie |

## Table `results` — colonnes principales

### Identite entreprise
domain (PK), societe_name, siret, siren, rcs, capital, forme_juridique, tva_intracom, dirigeant_nom, address, code_postal, ville_mentionnee, code_naf

### Contacts
email_principal, emails (JSON), phone_principal, phones (JSON), phone_type, social_linkedin, social_facebook, social_instagram, social_twitter, social_youtube, has_contact_form, has_chat_widget, has_whatsapp

### Technique web
final_url, http_status, has_https, response_time_ms, html_size, server_header, title, meta_description, language, doctype, has_noindex

### CMS / Frameworks
generator, cms, cms_version, platform_name, page_builder_name, js_framework_name, css_framework_name, jquery_version, bootstrap_version, agency_signature

### Signaux d'obsolescence
has_responsive, has_favicon, has_old_html, has_flash, has_old_images, has_phpsessid, has_ie_polyfills, has_layout_tables, copyright_year, has_modern_images, has_minified_assets, has_compression, has_cdn, has_lazy_loading

### Analytics / Marketing
analytics_type, has_facebook_pixel, has_linkedin_pixel, has_google_ads, has_schema_org, has_og_tags, has_canonical, has_cookie_banner

### Signaux business
has_mentions_legales, has_devis, has_ecommerce, has_recruiting_page, has_blog, has_google_maps, has_horaires, has_booking_system

### Enrichissement API gouv
enriched, enriched_via (siren/name_cp), api_nom_complet, api_forme_juridique, api_code_naf, api_date_creation, api_etat (A=active), api_categorie (PME/ETI/GE), api_effectifs, api_ca, api_ville, api_code_postal, api_dirigeant_prenom, api_dirigeant_nom, api_dirigeant_qualite, bodacc_procedure

### Scoring
tech_score (0-100), eclate_score, lead_flags, dept_computed, best_ville, best_cp

## Table `outreach` — PK composite (domain, tenant_id)

| Colonne | Type | Description |
|---------|------|-------------|
| domain | String | FK → results |
| tenant_id | UUID | Default: 00000000-0000-0000-0000-000000000000 |
| status | String | a_contacter, appele, contacte, interesse, pas_interesse, rappeler, rdv, client, hors_cible |
| contacted_date | String | Date du dernier contact |
| contact_method | String | email, phone, linkedin |
| notes | String | Notes libres |
| qualification | Float | Score 0-5 |
| last_visited | String | Derniere visite du prospect |
| position | Int | Ordre dans la colonne pipeline |

## Index

```sql
-- results (crees manuellement pour perf 438K)
idx_results_dept ON results(dept_computed)          -- 5.5ms au lieu de 213ms
idx_results_naf ON results(api_code_naf)
idx_results_ca ON results(api_ca DESC NULLS LAST)
idx_results_cms ON results(cms)
idx_results_enriched ON results(enriched)

-- operationnelles (via Prisma schema)
outreach: PK(domain, tenant_id)
pipeline_config: PK(key, tenant_id)
lead_segments: PK(domain, segment, tenant_id)
claude_activity: idx(tenant_id), idx(domain), idx(activity_type), idx(created_at DESC)
followups: idx(tenant_id), idx(domain), idx(status), idx(scheduled_at)
outreach_emails: idx(tenant_id), idx(domain), idx(sent_at)
call_log: idx(tenant_id), idx(domain), idx(started_at DESC)
```
