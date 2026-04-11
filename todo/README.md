# TODO — Veridian Platform

> Derniere mise a jour : 2026-04-10

## Structure

Le dossier `todo/` contient deux niveaux de suivi :

### 1. Suivi strategique global

- **[`TODO-LIVE.md`](./TODO-LIVE.md)** — source de verite unique pour le backlog.
  Priorise P0 → P3, avec :
  - Ordre des sprints
  - Arbitrages (pourquoi on fait X avant Y)
  - Standards cross-SaaS
  - Historique des sessions
  - **Section "⚠️ Chantiers douloureux"** en bas, a ne PAS commencer sans accord Robert
    (decommission Supabase, SSO avance, refactor trunk-based)

- **[`VISION-CROSS-APP.md`](./VISION-CROSS-APP.md)** — questions architecturales
  qui traversent plusieurs apps et qu'on ne peut pas traiter dans le TODO
  d'une seule app. Notamment :
  - Tenant cross-app sans re-consommer la periode d'essai Stripe
  - Onboarding magic link + strategie "bring to the SaaS doucement"

### 2. Suivi detaille par app

- **[`apps/`](./apps/README.md)** — un dossier par app du monorepo :
  - **[`apps/hub/`](./apps/hub/TODO.md)** — Hub SaaS (Next.js 14, Auth.js, Stripe)
  - **[`apps/prospection/`](./apps/prospection/TODO.md)** — Dashboard prospection B2B (Next.js 15, Prisma)
  - **[`apps/notifuse/`](./apps/notifuse/TODO.md)** — Notifuse fork (Go, API-only, a creer)
  - **[`apps/analytics/`](./apps/analytics/TODO.md)** — Analytics beta POC (Next.js 15, a creer)
  - **[`apps/twenty/`](./apps/twenty/TODO.md)** — Twenty hands-off (boite noire API GraphQL)

Chaque dossier d'app contient :
- **`TODO.md`** — backlog detaille, sous-taches, bugs connus, decisions techniques
- **`UI-REVIEW.md`** — file d'attente de polish UI pour Robert en session solo standalone

## Workflow

### Pour les agents (team sprint)

1. **Au demarrage** : lire `TODO-LIVE.md` pour l'ordre strategique, puis `apps/<app>/TODO.md`
   pour les details de l'app sur laquelle on bosse
2. **Pendant le sprint** : cocher les sous-taches au fil de l'eau, noter blockers et decisions
3. **A la livraison UI** : creer une entree dans `apps/<app>/UI-REVIEW.md`
4. **A la fin** : archiver les taches terminees en "Recently shipped" + update etat actuel

### Pour Robert (sessions polish solo)

1. Ouvrir `apps/<app>/UI-REVIEW.md`
2. Lancer l'app en dev (`cd <app> && npm run dev`)
3. Polish tranquillement avec Next dev, commit sur `staging`
4. Cocher + deplacer l'entree en "Reviewed"

Les sessions polish solo ne bloquent pas les sprints en cours — c'est du travail
parallele que Robert fait quand il a du temps.

## Regle d'or

- Les agents **livrent fonctionnel**, Robert **polish** apres
- Les agents **ne commencent jamais** un chantier douloureux sans instruction explicite
- Les TODO par app sont tenues a jour par les agents, pas archivees ni ignorees
