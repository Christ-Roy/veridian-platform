# 04 — Carte de France interactive

## Contexte
Actuellement la sélection de département se fait via un dropdown texte ou des segments hardcodés (69, 42, 38, 01). L'utilisateur veut une carte de France interactive comme dans le projet chatex.fr.

## Objectif
Composant SVG carte de France avec sélection par clic sur département, multi-sélection, heatmap, zoom.

## Détail

### Composant `FranceMap.tsx`
- SVG de la France métropolitaine découpée par département (96 départements)
- Chaque département est un `<path>` cliquable
- Multi-sélection : Ctrl+clic ou clic toggle
- Couleur : heatmap basée sur le nombre de prospects (blanc → bleu foncé)
- Tooltip au hover : "Rhône (69) — 25 063 prospects"
- Boutons rapides en dessous :
  - "AURA" (01, 03, 07, 15, 26, 38, 42, 43, 63, 69, 73, 74)
  - "IDF" (75, 77, 78, 91, 92, 93, 94, 95)
  - "National" (tout sélectionner)
  - "Reset" (tout désélectionner)
- Compteur en bas : "X prospects dans la sélection actuelle"

### Données heatmap
Endpoint API : `GET /api/stats/by-department`
Retourne : `{ "69": 25063, "75": 62459, "59": 35866, ... }`
Calculé côté serveur avec index sur `dept_computed`.

### Zoom
- Clic sur un département = zoom SVG sur la zone
- Double-clic = dézoom
- Ou bien : pas de zoom géographique, juste un zoom visuel (scale CSS transform)

### Intégration
- Affiché dans la sidebar droite quand on clique "Géographie" dans la navbar
- Le changement de sélection = mise à jour du filtre global → re-fetch de la table

### Source SVG
- Utiliser un GeoJSON de la France (Natural Earth ou IGN simplifié)
- Convertir en SVG optimisé avec les `id` de département
- Ou utiliser une lib existante (d3-geo, react-simple-maps)
- Référence : le composant chatex.fr utilisait un SVG statique fait main

## Fichiers impactés
- Nouveau : `dashboard/src/components/dashboard/france-map.tsx`
- Nouveau : `dashboard/src/components/dashboard/france-map-data.ts` (paths SVG par département)
- Nouveau : `dashboard/src/app/api/stats/by-department/route.ts`
- Modifié : `dashboard/src/lib/queries/stats.ts` (query counts par département)

## Priorité
Moyenne — les filtres textuels suffisent pour démarrer, la carte est un bonus UX.
