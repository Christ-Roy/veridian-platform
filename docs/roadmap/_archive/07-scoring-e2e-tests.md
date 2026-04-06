# 07 — Tests E2E du scoring technique + optimisation automatique

## Contexte
On a un workflow de tests E2E pour les extractors (scripts/tests_e2e/) qui valide les regex
d'extraction sur des cas synthetiques et des fixtures reelles. On veut la meme chose pour
le scoring technique (tech_score).

## Objectif
1. Un jeu de donnees de reference avec des sites notes manuellement (tech_score attendu)
2. Un agent en boucle qui teste differentes ponderations et trouve la meilleure equation
3. Des tests de non-regression comme pour extractors.py

## Detail

### 1. Dataset de reference
Creer `tests_e2e/scoring/dataset.json` avec des sites reels :
```json
[
  {
    "domain": "example-vieux-site.fr",
    "signals": {
      "has_responsive": 0, "has_https": 0, "has_old_html": 1,
      "copyright_year": 2015, ...
    },
    "expected_score_range": [40, 60],
    "human_verdict": "eclate_au_sol",
    "notes": "Site de plombier annees 2000, tables de layout, pas de mobile"
  },
  ...
]
```

Populer ce dataset :
- Extraire 50-100 sites de la DB avec des profils variés (sites modernes, vieux, moyens)
- Les noter manuellement (Robert) avec un verdict : "eclate_au_sol", "vieillissant", "correct", "moderne"
- Definir un score attendu (range)

### 2. Script de test
`tests_e2e/scoring/run_scoring_tests.py` :
- Charge le dataset
- Applique la formule de scoring actuelle
- Verifie que chaque site tombe dans son range attendu
- Rapport : nb pass/fail, sites mal classés, distribution

### 3. Agent optimiseur (experimental)
Un script qui tourne en boucle et teste des variations de ponderations :
- Genere des variantes de la formule (modifier les poids +/- 20%)
- Evalue chaque variante sur le dataset de reference
- Mesure : correlation avec les verdicts humains, precision du classement
- Garde la meilleure formule

Metriques d'evaluation :
- Les "eclate_au_sol" doivent avoir score > 40
- Les "moderne" doivent avoir score < 10
- La separation entre categories doit etre maximale
- Pas de faux positifs (site moderne note comme eclate)

### 4. Workflow continu
Comme pour extractors.py :
1. Trouver un site mal classé dans le dashboard
2. L'ajouter au dataset avec le verdict correct
3. Lancer les tests → le nouveau cas echoue
4. Ajuster les ponderations
5. Relancer → tous les tests passent
6. Commit

## Questions ouvertes
- Faut-il un script Python ou TypeScript pour les tests ? (Python serait coherent avec les tests extractors existants)
- L'agent optimiseur est-il un script standalone ou un sous-agent Claude ?
- Quel est le seuil minimum de cas dans le dataset avant de faire confiance à l'optimisation ? (probablement 100+)

## Priorite
Basse pour l'instant — le scoring actuel fonctionne. A lancer quand on aura des retours empiriques de Robert sur la qualite du tri.

## Fichiers a creer
- `tests_e2e/scoring/dataset.json` — jeu de donnees de reference
- `tests_e2e/scoring/run_scoring_tests.py` — tests de non-regression
- `tests_e2e/scoring/optimize_weights.py` — agent optimiseur (experimental)
- `tests_e2e/scoring/README.md` — documentation du workflow
