# DETTE-003 — CI flaky tests sur apps + tests à la ramasse

**Sévérité** : 🟠 haute
**Découvert** : depuis plusieurs sessions (récurrent)
**Impact** : ralentit les ship, crée des faux positifs, érode la confiance dans la CI

## Contexte

La règle CLAUDE.md dit "**La CI est sacree** — si un test fail, on fixe le test ou le code. Pas de skip, pas de contournement". Mais en pratique :
- Tests skippés au fil des sessions sans tracking
- Tests flaky qui passent 1 fois sur 2 (timing, race conditions, network)
- CI temps explose sur certaines apps (>5min pour des unit tests)
- Pas de coverage stats / pas de seuil bloquant

## Apps concernées (à auditer)

| App | Repo / chemin | CI status | Action initiale |
|---|---|---|---|
| **hub** | `hub/`, `.github/workflows/hub-ci.yml` | tests minimaux (notifuse only), pas d'e2e create-tenant Twenty | écrire e2e signup → provision tenant |
| **prospection** | `prospection/`, repo Christ-Roy/prospection | pipeline complet (lint+test+e2e+docker+deploy) — solid | audit flaky |
| **analytics** | `analytics/` (à vérifier) | ? | audit |
| **cms** | `cms/` (Payload) | ? | audit |
| **notifuse** | `notifuse/` (fork) | ? | audit |

## Plan d'action

### Phase 1 : audit (1 session avec agent dédié)

Lancer un agent en parallèle qui :
1. Pour chaque app : lit le workflow CI, liste les tests
2. Lance les tests 5 fois de suite, identifie les flaky (passe pas 100%)
3. Mesure le temps total de chaque suite, identifie les outliers
4. Génère un rapport `audit-ci-<app>.md` avec :
   - Tests skipped (avec raison ou TODO)
   - Tests flaky (avec stack trace)
   - Tests > 30s (à optimiser)
   - Coverage gap (fichiers/fonctions non couverts)

### Phase 2 : fix prioritaire (par ordre de criticité)

1. **Tests flaky** : les rendre déterministes (mock timing, fixer port, seed DB cohérent, attendre les async correctement)
2. **Tests skipped sans raison** : soit les fixer, soit les supprimer (pas de skip silencieux)
3. **Tests > 30s** : profiler, optimiser ou paralléliser

### Phase 3 : optimisation continue

- **Cache plus agressif** : node_modules, build artifacts, docker layers via runner self-hosted
- **Tests en parallèle** : `jest --maxWorkers`, Playwright shards
- **Sélectif** : tests modifiés uniquement sur PR (via path filtering ou jest --findRelatedTests)
- **Coverage threshold bloquant** dès que stable
- **Métriques** : push CI duration / fail rate dans Veridian Analytics dashboard

## Workflow agent CI optimization

Quand on est en mode loop ou qu'on a du temps :

```
1. Lance un agent "ci-auditor" en background sur l'app à auditer
2. Lance un agent "test-fixer" sur les flaky identifiés
3. Lance un agent "ci-optimizer" qui propose et teste des optims (parallel, cache)
4. Tous les agents écrivent leurs trouvailles dans dette-technique/003-*-<app>.md
5. Lead (toi) review les PRs, merge celles qui ne cassent rien
```

Idée à creuser : créer un **skill `/ci-audit`** qui automatise ce flow.

## Comment tester

```bash
# Run tests d'une app 5x pour détecter flaky
cd hub && for i in 1 2 3 4 5; do npm test 2>&1 | tail -5; done

# Mesurer durée
time npm test

# Lister tests skipped
grep -r 'test.skip\|it.skip\|describe.skip\|xit\|xdescribe' src/ __tests__/

# Coverage check
npm test -- --coverage
```

## Questions ouvertes

- Faut-il un seuil de coverage bloquant maintenant ou attendre que les apps soient plus matures ?
- Self-hosted runner sur dev-server : monitoring de sa health, plan de fallback si HS ?
- Tests cross-app (hub provisionne Twenty + Notifuse) : où les ranger ? Probablement dans hub/__tests__/integration/.
