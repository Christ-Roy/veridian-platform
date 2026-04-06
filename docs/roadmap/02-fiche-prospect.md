# 02 — Fiche prospect (lead-sheet)

## Contexte
La fiche prospect actuelle (sidebar droite) est un mur de texte avec des infos mal rangées, des boutons qui marchent pas bien (Maps), des curseurs qualification dupliqués, un statut dupliqué, et des notes qui nécessitent un clic "Sauvegarder" avec refresh.

## Objectif
Refaire la fiche prospect avec une UX propre, rangée par volets déroulants, avec sauvegarde temps réel.

## Détail

### Header de la fiche
En haut, toujours visible (pas dans un volet) :
- **Nom entreprise** (gros, bold)
- **Domaine** (lien cliquable vers le site)
- **Badge qualité** : Or / Argent / Bronze
- **Badge tech score** : couleur selon le score
- **Statut** : dropdown unique (A contacter, Appelé, Contacté, Intéressé, Pas intéressé, A rappeler, RDV, Client, Hors cible)
  - "Intéressé" → modale obligatoire pour ajouter une note
  - "Pas intéressé" → pas de note obligatoire
- **Boutons d'action rapide** (icones) :
  - Appeler (lance le softphone)
  - Email (ouvre compose)
  - A rappeler (ouvre modale calendrier / Google Calendar)
  - **Supprimer** (poubelle rouge, 1 clic → marque comme "hors_cible" et passe au suivant)

### Bouton Google Maps — corrigé
Actuellement lance la recherche avec le nom d'entreprise. Doit proposer un choix :
- Dropdown ou 3 boutons : "Chercher par domaine" | "Chercher par nom" | "Chercher par adresse"
- Par défaut : adresse si disponible, sinon nom, sinon domaine
- Ouvre dans un nouvel onglet (pas dans la fiche)

### Volets déroulants (accordéon)

#### Volet 1 — Entreprise (ouvert par défaut)
- Forme juridique, SIRET, SIREN
- Secteur (code NAF + libellé)
- Catégorie (PME/ETI/GE)
- Effectifs, CA
- Date de création
- Dirigeant : nom, qualité

#### Volet 2 — Contact
- Dirigeant : nom, qualité
- Téléphone principal + type (mobile/fixe) + badge validé
- Email principal
- Email dirigeant (si trouvé via SMTP)
- Aliases SMTP
- Réseaux sociaux (LinkedIn, Facebook, Instagram, Twitter)
- Formulaire de contact (oui/non)
- Chat widget (oui/non)

#### Volet 3 — Technique
- CMS / Plateforme
- Score technique (jauge visuelle)
- Eclate score (0-3 avec explication)
- Responsive, HTTPS, favicon
- Copyright year
- Vieux HTML, Flash, etc.
- Framework JS, CSS framework
- Analytics (GA4/GTM/Matomo)

#### Volet 4 — Notes & historique
- **Zone de notes** : textarea avec **sauvegarde auto** (debounce 500ms, pas de bouton sauvegarder)
  - Sauvegarde via PATCH `/api/outreach` avec le champ `notes`
  - Pas de rechargement de page
  - Indicateur discret "Sauvegardé" qui apparait brièvement
- Timeline des interactions : appels, emails, changements de statut
- Activités Claude (analyses IA)

#### Volet 5 — Follow-ups
- Liste des rappels programmés
- Bouton "Nouveau rappel" → modale avec date/heure + note
- Intégration Google Calendar (existante, à conserver)

### Éléments supprimés
- **Curseurs qualification** : dupliqués et inutiles → SUPPRIMÉS
- **Statut en bas de fiche** : dupliqué avec le header → SUPPRIMÉ
- **Boutons Planifier/Rappel/Audit/Terrain/Twenty** : remplacés par les actions du header

### Bouton "Dégager" (suppression rapide)
- Bouton poubelle rouge dans le header
- 1 clic → met le statut à "hors_cible"
- Passe automatiquement au prospect suivant dans la liste
- Pas de confirmation (mais réversible : on peut remettre "a_contacter" depuis l'historique)

## Sauvegarde temps réel
- Notes : debounce 500ms après arrêt de frappe → PATCH API
- Statut : changement immédiat → PATCH API
- Qualification : supprimée (pas de curseur)
- Aucun bouton "Sauvegarder" visible

## Règles
- Pas de localStorage — tout en DB
- Pas de rechargement de page pour sauvegarder
- Les volets se souviennent de leur état ouvert/fermé (config en DB)
- La fiche doit charger en < 500ms (une seule requête API)
- Le bouton "Dégager" est la seule action destructive, et elle est réversible

## Fichiers impactés
- `dashboard/src/components/dashboard/lead-sheet.tsx` → refonte complète
- `dashboard/src/lib/queries/activity.ts` → ajout sauvegarde auto notes
- `dashboard/src/app/api/outreach/route.ts` → endpoint PATCH notes
- Nouveaux composants : `LeadHeader.tsx`, `AccordionSection.tsx`, `AutoSaveNotes.tsx`, `GoogleMapsButton.tsx`
