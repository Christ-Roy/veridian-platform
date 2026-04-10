# Merging upstream Notifuse dans notre fork

> **TODO (sprint P1.3)** : documenter la procedure complete de rebase/merge de
> `Notifuse/notifuse main` dans `Christ-Roy/notifuse-veridian veridian`.
>
> Point critique : sans cette procedure, on ne pourra pas suivre les updates
> upstream et on accumulera de la dette. A rediger en meme temps que le fork
> actif.

## A documenter

- [ ] Pre-requis (remotes git configurees : `origin` + `upstream`)
- [ ] Commande de fetch upstream
- [ ] Strategie de merge : rebase ou merge commit ? (probablement rebase pour
      garder un diff clair)
- [ ] Resolution de conflits courants (lister les fichiers que Veridian modifie)
- [ ] Tests a faire tourner apres merge : tests natifs Notifuse (Go) + nos
      specs Veridian (provisioning, paywall, limites plan)
- [ ] Procedure de bump de version dans `.upstream-version`
- [ ] Workflow CI de validation : `notifuse-ci.yml` doit passer avant de
      pousser le merge sur `veridian`

## Notes

- Upstream semble actif (derniers tags v6.4 → v9.0 sur 2025-2026)
- On vise a suivre les tags stables (`vX.Y`), pas les commits intermediaires
- Script `ci/check-oss-versions.sh` existe deja et doit etre etendu pour
  alerter sur les bumps upstream Notifuse
