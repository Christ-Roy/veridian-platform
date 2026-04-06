# 05 — Performance et optimisation

## Contexte
La page Segments met 20-40s à charger à cause des COUNT(*) sur 2.8M lignes pour chaque segment.
Les stats de la page Dashboard prennent 18s au second appel.
C'est inutilisable pour du cold calling rapide.

## Objectif
Toutes les pages chargent en < 2s. La table de leads en < 1s.

## Actions

### 1. Filtre tech_score minimum par défaut
Ne jamais charger les leads avec `prospect_score < 15` (ou le seuil configuré).
Ça élimine la majorité de la DB (1.5M excluded + beaucoup de leads sans signal).
```sql
WHERE prospect_score >= :min_score  -- ajouté à toutes les requêtes leads
```

### 2. Cache des counts sidebar
Les counts par secteur changent rarement. Stratégie :
- Calculer les counts au démarrage du serveur et les stocker en mémoire (ou dans pipeline_config)
- Invalider le cache quand un filtre global change
- Ou bien : endpoint `/api/segments/counts` avec header `Cache-Control: max-age=300`

### 3. Matérialiser prospect_score + index
```sql
CREATE INDEX idx_results_prospect_score ON results(prospect_score DESC);
CREATE INDEX idx_results_score_dept ON results(prospect_score DESC, dept_computed);
CREATE INDEX idx_results_score_naf ON results(prospect_score DESC, api_code_naf);
```

### 4. Pagination côté SQL
Déjà en place (LIMIT/OFFSET) mais s'assurer que le OFFSET utilise un index.
Pour les gros offsets, passer en cursor-based pagination (WHERE rowid > last_rowid).

### 5. Stats pré-calculées
Les stats Dashboard (Total leads, Enrichis, Avec email, etc.) peuvent être pré-calculées :
- Table `stats_cache` avec `key TEXT, value INTEGER, updated_at TEXT`
- Recalculées toutes les 5 min via un cron ou au premier accès si stale

### 6. SQLite ANALYZE
Lancer `ANALYZE` après les gros INDEX pour que le query planner utilise les stats.

## Fichiers impactés
- `dashboard/src/lib/db.ts` — nouveaux index, ANALYZE
- `dashboard/src/lib/queries/stats.ts` — cache
- `dashboard/src/lib/queries/segments.ts` — filtre min score
- `dashboard/src/app/api/segments/counts/route.ts` — cache header
