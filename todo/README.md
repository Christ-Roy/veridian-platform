# TODO — Veridian Platform

> Dernière mise à jour : 2026-04-06

## Structure

- **`TODO-LIVE.md`** — TODO vivant, édité au fil de l'eau (P0→P3)
- **`README.md`** — vue d'ensemble + index des roadmaps features

## Roadmaps features (ce qui reste)

Les roadmaps dans `prospection/roadmap/` décrivent les specs UI/UX détaillées.
Les fichiers archivés (faits ou obsolètes) sont dans `prospection/roadmap/_archive/`.

| Fichier | Sujet | Ce qui reste |
|---------|-------|-------------|
| `01-navigation-et-filtres.md` | Sidebar secteurs NAF + filtres sidebar droite | Sidebar secteurs, onglets Or/Argent/Bronze, sauvegarde config DB |
| `02-fiche-prospect.md` | Lead sheet UX | Sauvegarde auto notes, bouton "Dégager", Google Maps dropdown, timeline |
| `03-scoring-engine.md` | 4 filtres configurables | Page Settings scoring, distributions à recalculer sur Postgres |
| `04-carte-de-france.md` | Carte SVG interactive | API existe, composant SVG frontend manque |
| `06-settings-page.md` | Page /settings complète | Pondérations, configs sauvegardées, filtres par défaut |
| `09-workspaces-multi-user.md` | Multi-user workspace | Phase 3 (routes API workspace filter) + Phase 4-5 (UI switcher, KPI par workspace) |

## Priorités actuelles (avril 2026)

### P0 — Bloquant
- CI billing GitHub Actions à fixer (paiement échoué)
- checkTrialExpired = return false en prod (hack temporaire à recâbler)
- Rate-limit Supabase admin API (partiellement fait, à finaliser)
- Valider compte prod `robert.brunon@veridian.site`
- Lead quota freemium 300 leads + pricing par lot

### P1 — Prochaine session
- CI cache agressif (node_modules, .next/cache, playwright)
- Polish UI invitations
- Fix twenty.ts getQualifications post-refactor

### P2 — Court terme
- Self-hosted runner dev-server
- Tests e2e manquants (5 specs)
- Tests API smoke par domaine (7 fichiers)
- Monitoring/observabilité

### P3 — Long terme
- Dark mode (infra livrée, polish pages)
- Command palette (livrée)
- Mobile responsive (basique fait)
- SSO entreprise
- Séparer DBs Prospection/Supabase
