# Prompt prochaine session — Analytics deploy prod + Prospection PWA

> Copier-coller ce prompt au début de la prochaine session Claude Code.
> Supprimer ce fichier après usage.

---

## Contexte

Session précédente (2026-04-14 soir) : on a enrichi tout le backend analytics
(schema Prisma 55+ champs, tracker.js v2, bot detection, rate limit IP, spam
referrer blocklist, 264 unit tests + 5 core E2E passent). Le code est prêt
localement mais PAS déployé en prod.

## Tâche 1 — Deploy analytics en prod (PRIORITAIRE)

L'app tourne déjà sur `analytics.app.veridian.site` (container Dokploy,
image `ghcr.io/christ-roy/analytics:latest`, DB Postgres avec 39 pageviews
existants). Il faut deployer le nouveau code.

### Steps

1. Lire `todo/apps/analytics/TODO.md` et la memory `session_2026-04-14_analytics_backend.md`
2. Vérifier que le Dockerfile inclut `prisma migrate deploy` au start
   (sinon l'ajouter — c'est une migration additive safe)
3. Générer un `VISITOR_HASH_SALT` : `openssl rand -hex 32`
4. L'ajouter dans le docker-compose.yml Dokploy sur prod :
   `/etc/dokploy/compose/compose-synthesize-virtual-transmitter-i9bv43/code/docker-compose.yml`
5. Commit tout le code analytics modifié + push main
6. La CI (`.github/workflows/analytics-ci.yml`) va : lint → test → build → push GHCR
7. Suivre la CI avec `gh run watch`
8. Quand l'image est poussée : redeploy Dokploy (ou `docker compose pull && docker compose up -d`)
9. Vérifier :
   - `curl https://analytics.app.veridian.site/api/health` → 200
   - `curl https://analytics.app.veridian.site/tracker.js | head -5` → doit contenir "v2" ou "signals"
   - Lancer les 5 core E2E : `npx playwright test tests/e2e/11-tracker-e2e-demo.spec.ts`
   - Vérifier le status du tenant demo : `curl -H "x-admin-key: <key>" https://analytics.app.veridian.site/api/admin/tenants/demo-analytics/status`

### Notes
- Les 39 pageviews existants auront `interacted=false` → ne seront plus comptés dans le dashboard (acceptable, data de test)
- Le site `demo.veridian.site` pointe vers `analytics-staging.veridian.site` dans son layout.tsx. Après deploy prod, il faudra le repointer vers `analytics.app.veridian.site` (ou garder staging si on veut séparer les environnements)
- Admin key prod : voir `~/.claude/skills/analytics-provision/SKILL.md`

## Tâche 2 — Prospection PWA + Push notifications

Robert veut une version mobile de Prospection avec notifications push pour :
- Rappels pipeline (stage `a_rappeler` → notif à la date/heure programmée)
- Démos planifiées (stage `site_demo` → notif veille + jour J)
- Nouveau lead assigné

Voir `todo/apps/prospection/TODO.md` section "A faire prochaine session" pour le détail.

L'app Analytics a déjà une implémentation PWA + Push fonctionnelle
(`analytics/public/sw.js`, `analytics/app/api/push/*`, table `PushSubscription`)
— s'en inspirer pour Prospection. Mêmes VAPID keys.

Prospection a déjà un `CalendarDialog` et un `NotificationBell` (in-app) —
les connecter au système push.
