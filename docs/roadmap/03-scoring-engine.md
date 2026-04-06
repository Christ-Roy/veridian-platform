# 03 — Filtres configurables (remplace le scoring engine)

## Decision
Pas de score amalgame unique. A la place, 4 filtres independants configurables
dans une page Settings. Le tech_score existant est le seul score numerique,
utilise pour le tri d'affichage.

## Les 4 filtres

### Filtre 1 — Qualite lead (Or / Argent / Bronze / Historique)
Base sur la **qualite des donnees**, pas un score numerique.

| Tier | Criteres par defaut | Population (~) |
|------|---------------------|----------------|
| **Or** | enrichi SIREN + telephone + code NAF connu | ~189K (14%) |
| **Argent** | enrichi (siren OU name_cp) + telephone OU email, hors Or | ~217K (16%) |
| **Bronze** | a un signal (phone/email/siret), pas enrichi proprement, hors Or/Argent | ~485K (37%) |
| **Historique** | outreach.last_visited IS NOT NULL | variable |
| *Reste* | rien de contactable → pas affiche | ~433K (33%) |

Distribution cible : ~15% Or / ~35% Argent / ~50% Bronze (ajustable dans Settings).

Chaque critere est un toggle dans la page Settings :
- Or : requireEnrichedSiren, requirePhone, requireNaf, requireEffectifs
- Argent : requireEnriched, requirePhoneOrEmail
- Bronze : requireAnyContact

### Filtre 2 — Secteur NAF (du plus strict au plus large)
3 presets + mode custom :

| Preset | Description | Nb codes |
|--------|-------------|----------|
| **Ultra-strict** | Uniquement les meilleurs secteurs (sante, BTP, beaute, droit, archi, immo) | ~40 codes |
| **Strict** | Bons secteurs incluant auto, commerce, hotel, IT, conseil | ~70 codes |
| **Large** | Tous les secteurs sauf exclus | pas de filtre NAF |

Mode custom : checkboxes par domaine metier (18 domaines dans la sidebar).
Les codes NAF de chaque preset sont modifiables dans Settings.

### Filtre 3 — Taille entreprise
| Mode | Critere |
|------|---------|
| Individuel | effectifs 0-2 OU forme EI/auto-entrepreneur |
| PME | effectifs 3-249 |
| Grande | effectifs 250+ |
| Tous | pas de filtre |

Options avancees :
- Slider min/max effectifs
- Slider min/max CA
- Operateur ET/OU entre effectifs et CA
- Tous ces champs sont personnalisables dans Settings

### Filtre 4 — Tech debt (tri d'affichage)
Le tech_score existant (0-100+), utilise pour ORDER BY DESC.
- Seuil minimum configurable (defaut : 0) — en dessous, le prospect n'est pas charge
- Seuil "eclate au sol" configurable (defaut : 30) — highlight visuel

## Distribution observee (DB locale, 2.8M resultats)

### Population globale
- Total : 2 829 641
- Excluded : 1 462 607 (52%)
- Redflag : 43 255 (1.5%)
- Exploitable : 1 323 779 (47%)

### Enrichissement
- SIREN : 254 481 (9%)
- name_cp : 97 858 (3.5%)
- Non trouve : 303 549 (11%)
- Jamais enrichi : 2 159 063 (76%)

### Tech score
- 0-4 : 1.9M (67%) — sites "corrects"
- 5-9 : 392K (14%)
- 10-14 : 136K (5%)
- 15-19 : 82K (3%)
- 20-29 : 135K (5%)
- 30-39 : 44K (1.6%)
- 40-49 : 41K (1.5%)
- 50+ : 34K (1.2%) — sites eclates au sol

### Effectifs (353K avec data)
- NN : 162K (non renseigne)
- 01 (1-2) : 47K
- 02 (3-5) : 37K
- 03 (6-9) : 25K
- 11 (10-19) : 27K
- 12 (20-49) : 18K
- 21+ (50+) : ~20K

### CA (78K avec data)
- Inconnu : 2.75M
- < 100K : 8K
- 100K-500K : 17K
- 500K-2M : 14K
- 2M-5M : 8K
- 5M-10M : 5K
- > 10M : 26K

## Implementation
- Moteur de filtres : `dashboard/src/lib/filters.ts` (fait)
- Queries : `dashboard/src/lib/queries/prospects.ts`
- Page Settings : `dashboard/src/app/settings/page.tsx` (a faire)
- Stockage config : table `pipeline_config` (cle/valeur, existe deja)

## Fichiers impactes
- `dashboard/src/lib/filters.ts` — moteur de filtres (FAIT)
- `dashboard/src/lib/queries/prospects.ts` — queries avec filtres
- `dashboard/src/app/settings/page.tsx` — page config
- `dashboard/src/lib/queries/pipeline.ts` — CRUD pipeline_config
