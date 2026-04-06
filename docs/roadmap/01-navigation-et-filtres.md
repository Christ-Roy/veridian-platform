# 01 — Navigation et filtres

## Contexte
La page Segments actuelle a une sidebar arborescente avec 7+ segments racine (Top Leads, TPE, PME, Grosse, Cold Calling, Poubelle, Rhône 69...) qui se marchent dessus. L'utilisateur veut une navigation claire et rapide.

## Objectif
Remplacer le système actuel par une navigation en 2 axes :
1. **Sidebar gauche** = domaines métier (NAF groupés) — fixe, toujours visible
2. **Navbar top** = filtres globaux (qualité, géo, taille, presets) — via des sidebars droite élégantes

## Détail

### Sidebar gauche — Domaines métier
La sidebar ne contient QUE les secteurs d'activité, chacun étant un agglomérat de codes NAF :

| Domaine | Codes NAF |
|---------|-----------|
| Tous les secteurs | (pas de filtre NAF) |
| BTP / Construction | 41.*, 43.* |
| Santé / Paramédical | 86.* |
| Beauté / Bien-être | 96.02*, 96.04, 96.09 |
| Immobilier | 68.* |
| Restauration / Hôtellerie | 55.*, 56.* |
| Auto / Garage | 45.* |
| Commerce de détail | 47.* |
| Droit / Comptabilité | 69.* |
| Ingénierie / Architecture | 71.* |
| Informatique / Digital | 58.*, 62.*, 63.* |
| Conseil / Services | 70.*, 73.*, 74.*, 78.*, 82.* |
| Formation / Enseignement | 85.4*, 85.5* |
| Nettoyage / Entretien | 81.* |
| Réparation / Maintenance | 33.*, 95.* |
| Transport / Logistique | 49.*, 52.*, 53.* |
| Sport / Loisirs | 93.* |
| Industrie / Fabrication | 10-32.* |
| Assurance / Finance | 64.*, 65.*, 66.* |

Chaque item affiche le count (nombre de prospects dans le filtre actif).
Clic = filtre la table. Multi-sélection possible (Ctrl+clic).

### Navbar top — Onglets qualité Or/Argent/Bronze
3 onglets horizontaux dans la barre du haut (à côté ou sous la nav principale) :

| Onglet | Icone | Couleur | Filtre |
|--------|-------|---------|--------|
| **Or** | Trophy/Crown | amber-500 | NAF_GOLD + eclate_score >= 2 + enriched |
| **Argent** | Medal | gray-400 | NAF_SILVER + eclate_score >= 1 + enriched |
| **Bronze** | Circle | orange-700 | Ni gold ni silver, enriched, has_phone |

Par défaut : **Or** sélectionné.

### Navbar top — Boutons filtres (ouvrent des sidebars droite)

Au lieu de dropdowns classiques, chaque filtre ouvre une **sidebar droite** (à la place de la fiche prospect) avec une UI de configuration riche :

#### Bouton "Géographie" (icone MapPin)
Ouvre sidebar droite avec :
- Carte de France interactive (SVG, clic par département)
- Multi-sélection départements
- Heatmap du nombre de prospects par département
- Boutons rapides : "AURA", "IDF", "National"
- Compteur : "X prospects dans la sélection"

#### Bouton "Taille" (icone Building)
Ouvre sidebar droite avec :
- Radio : Individuel (EI, 0-2 salariés) / PME (3-249) / Grande (250+)
- Option "Only 06/07" (mobile uniquement) — toggle
- Slider min-max effectifs (0 à 500+)
- Slider min-max CA (0 à 10M+)
- Formes juridiques checkboxes (SAS, SARL, EI, SA, SCI)

#### Bouton "Qualité données" (icone Shield)
Ouvre sidebar droite avec :
- 3 presets cliquables :
  - **Standard** : SIRET + téléphone valide
  - **Strict** : + enrichi API + eclate >= 1 + pas siren_polluter + pas phone_shared
  - **Ultra-strict** : + NAF top 50 + mobile ou email dirigeant + copyright <= 2022 + pas plateforme hébergée
- Toggle "Masquer doublons SIREN" (ne garde que le meilleur domaine par SIREN)
- Slider "Tech score minimum" (défaut : 15, en dessous = pas chargé)

### Sauvegarde des configurations
- Bouton "Sauvegarder config" dans chaque sidebar
- Configs stockées dans `pipeline_config` table (pas de localStorage)
- Dropdown "Charger config" pour retrouver les configs sauvegardées
- Config par défaut appliquée à l'ouverture de la page

## Règles
- RIEN dans le localStorage — tout en DB (pipeline_config)
- Sidebar droite = même espace que la fiche prospect (pas les deux en même temps)
- Les counts dans la sidebar gauche doivent être rapides (< 1s) — utiliser des index ou du cache
- Filtre tech_score minimum = filtre côté SQL (pas côté client), pour ne pas charger de données inutiles
- Le changement de filtre ne recharge pas la page — juste un fetch API + mise à jour de la table

## Fichiers impactés
- `dashboard/src/components/dashboard/segment-page.tsx` → refonte complète
- `dashboard/src/lib/segments.ts` → simplifier, ne garder que les domaines métier
- `dashboard/src/lib/queries/segments.ts` → adapter les requêtes
- `dashboard/src/components/dashboard/advanced-filters.tsx` → remplacer par les sidebars
- Nouveaux composants : `FranceMap.tsx`, `QualityTabs.tsx`, `FilterSidebar.tsx`, `ConfigManager.tsx`
