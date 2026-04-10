# Analytics — UI Review queue (solo polish)

> Beta POC — l'UI sera forcement minimaliste au debut. Les reviews concernent
> surtout la coherence avec le Hub et les ecrans admin.
>
> **Workflow** :
> 1. `cd analytics && npm run dev` (port a definir, probablement 3002)
> 2. Polish avec Next dev, commit direct (pas encore de CI stricte en beta)
> 3. Cocher + archiver

---

## A reviewer

_(vide — app pas encore creee)_

**Format entree** :

```markdown
### [YYYY-MM-DD] Nom page/composant
- **Contexte** : sprint P1.2, livre par teammate <nom>
- **URL dev** : http://localhost:3002/path
- **URL prod beta** : https://analytics.app.veridian.site/path
- **Fichiers** : `analytics/src/app/path/page.tsx`
- **A polish** :
  - [ ] Coherence avec le Hub (meme design system)
  - [ ] Badge BETA visible
  - [ ] Empty states (pas de data = message explicite)
  - [ ] Responsive
- **Notes agent** : ...
```

---

## Priorites polish beta

Pages qui **vont** etre livrees et qu'il faudra polish en solo :

1. `/dashboard` — vue principale client (graphiques, stats)
2. `/dashboard/integration` — page "Comment integrer" (critique pour l'adoption)
3. `/admin/sip-upload` — upload CSV logs OVH
4. `/admin/sip-mapping` — CRUD mapping lignes SIP ↔ tenants
5. `/login` — login simple

---

## Reviewed (archive)

_(rien encore reviewe)_
