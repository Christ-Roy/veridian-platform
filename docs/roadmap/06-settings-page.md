# 06 — Page Settings

## Contexte
Pas de page de configuration. Les filtres par défaut, le nombre de résultats par page, le masquage des doublons, etc. ne sont pas configurables.

## Objectif
Page `/settings` avec toutes les préférences utilisateur, stockées en DB (pipeline_config).

## Détail

### Sections

#### Affichage
- Onglet par défaut (Or / Argent / Bronze)
- Nombre de résultats par page (25 / 50 / 100)
- Colonnes visibles dans la table (checkboxes)
- Masquer doublons SIREN par défaut (toggle)

#### Filtres par défaut
- Niveau qualité par défaut (Standard / Strict / Ultra-strict)
- Score minimum par défaut (slider 0-100)
- Département(s) par défaut
- Taille d'entreprise par défaut

#### Scoring
- Pondérations des 5 dimensions (sliders)
- Seuils Or/Argent/Bronze (sliders)
- Recalculer les scores (bouton avec confirmation)

#### Configs sauvegardées
- Liste des configurations de filtres sauvegardées
- Renommer / supprimer / définir comme défaut

## Stockage
Tout dans `pipeline_config` (clé/valeur) :
```
settings.default_tab = "or"
settings.page_size = "50"
settings.hide_duplicates = "1"
settings.min_score = "15"
settings.default_department = "69,42,38"
settings.quality_preset = "strict"
settings.scoring_weights = "{\"tech\":30,\"business\":20,\"sector\":20,\"company\":15,\"data\":15}"
settings.scoring_thresholds = "{\"or\":70,\"argent\":45,\"bronze\":20}"
filter_config.ma_config_lyon = "{...}"
filter_config.ma_config_national = "{...}"
```

## Fichiers impactés
- Nouveau : `dashboard/src/app/settings/page.tsx`
- Nouveau : `dashboard/src/components/dashboard/settings-form.tsx`
- Modifié : `dashboard/src/lib/queries/pipeline.ts` — CRUD pipeline_config
- Modifié : `dashboard/src/app/api/` — endpoint settings
