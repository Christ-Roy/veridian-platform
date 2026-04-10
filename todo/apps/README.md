# TODO par app — Index

> Suivi detaille par app du monorepo Veridian. Complement de `../TODO-LIVE.md`
> qui reste la source de verite strategique (ordre des sprints, arbitrages).
>
> **Regle** : les agents doivent lire `TODO.md` de l'app concernee AVANT de coder,
> et mettre a jour ce fichier + creer une entree dans `UI-REVIEW.md` a chaque
> livraison UI.

## Structure

Chaque dossier d'app contient :
- **`TODO.md`** — backlog detaille, sous-taches en cours, bugs connus, decisions
  techniques, notes agents. Tenu a jour au fil de l'eau par les teammates qui
  bossent sur l'app.
- **`UI-REVIEW.md`** — file d'attente de polish UI pour Robert en session solo
  standalone (hors sprint). Chaque nouvelle page/composant livre par un agent
  = une entree ici. Robert traite tranquillement avec Next dev quand il a le
  temps, sans ralentir les sprints.

## Apps

| App | Dossier | Stack | Status |
|-----|---------|-------|--------|
| **Hub** | [`hub/`](./hub/TODO.md) | Next.js 14, Auth.js, Prisma, Stripe | Prod — en construction |
| **Prospection** | [`prospection/`](./prospection/TODO.md) | Next.js 15, Prisma, Playwright | Prod — stable |
| **Notifuse** | [`notifuse/`](./notifuse/TODO.md) | Go (fork upstream) | A forker (P1.3) |
| **Analytics** | [`analytics/`](./analytics/TODO.md) | Next.js 15, Prisma | A creer (P1.2 beta POC) |
| **Twenty** | [`twenty/`](./twenty/TODO.md) | OSS hands-off (API GraphQL) | Prod — boite noire |

## Workflow agent

Quand un agent bosse sur une app X :

1. **Au demarrage** : lire `todo/apps/X/TODO.md` pour comprendre l'etat, les
   decisions deja prises, les bugs connus, ce qui est en cours.
2. **Pendant le sprint** : cocher les sous-taches, noter les decisions techniques
   (ADR light), noter les blockers.
3. **A la livraison UI** : creer une entree dans `todo/apps/X/UI-REVIEW.md` avec
   la page livree, URL dev, points a polish suspectes, screenshot a prendre.
4. **A la fin de la tache** : mettre a jour l'etat (version, sante, dernier deploy),
   archiver les sous-taches terminees dans "Recently shipped" du fichier.

## Workflow Robert (sessions polish solo)

Quand Robert a du temps entre les sprints :

1. Ouvrir `todo/apps/<app>/UI-REVIEW.md`
2. Prendre les entrees non cochees en ordre
3. Lancer l'app en dev (`npm run dev` dans `<app>/`)
4. Polish tranquillement, commit direct sur staging (ou PR si gros changement)
5. Cocher l'entree dans `UI-REVIEW.md`, archiver en bas quand terminee
