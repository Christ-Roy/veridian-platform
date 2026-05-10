# Blue/green prospection — État 2026-05-10 13:39

## Statut : GREEN déployé en isolation, **EN ATTENTE VALIDATION ROBERT pour bascule**

## Composants

### BLUE (actif, sert prospection.app.veridian.site)
- Container : `compose-connect-redundant-firewall-l5fmki-prospection-authjs-1`
- Image : `ghcr.io/christ-roy/prospection:latest` (sha 41ae6d6b34ab)
- Build : hybride Supabase Auth + Prisma data
- Compose Dokploy : `0mJI-sSt6jcOMr_2QJ1iI` (project Internal Tools, env production)
- DB : `code-prospection-saas-db-1` (10.0.1.81)
- Status : `Up 2 days`, healthy

### GREEN (déployé, isolé sur prospection-green.app.veridian.site)
- Container : `compose-connect-back-end-panel-u6gl8u-prospection-greenauthjs-1`
- Image : `ghcr.io/christ-roy/prospection:staging` (sha 92b0c677dac5, 3 jours)
- Build : Auth.js v5 full + Prisma + Google OAuth + credentials provider
- Compose Dokploy : `J2f9wtBnrAO-86DE3_WMS` (créé via API 13:34)
- DB : **MÊME DB que BLUE** (`code-prospection-saas-db-1` à 10.0.1.81)
- Status : `Up 38s`, healthy
- Smoke test : `/api/health` 200 (`db:"ok"`, `leadCount:996657`), `/api/auth/providers` 200 (Google + credentials), `/login` 200, signin flow déclenche bcrypt compare correct

## Validation effectuée

- ✅ Auth.js v5 init OK (providers + csrf + session endpoints répondent)
- ✅ Prisma connecté à la BONNE DB (leadCount cohérent avec BLUE)
- ✅ Flow signin déclenche `auth.config.ts authorize()` → bcrypt compare (CredentialsSignin error sur fake creds = comportement attendu)
- ✅ Pas d'erreurs schema/migration
- ✅ Pas de collision Traefik (router GREEN distinct de BLUE)
- ✅ Aucun impact prod (BLUE inchangé, route prospection.app.veridian.site servie)

## Phase suivante (BASCULE) — REQUIRED VALIDATION ROBERT

Pour basculer GREEN → prod :

1. Test login réel sur `prospection-green.app.veridian.site` avec un compte Robert (vrai email + vrai password) pour confirmer que bcrypt match les hashes Supabase legacy
2. Update labels Traefik du compose GREEN pour pointer `Host(prospection.app.veridian.site)` (au lieu de `-green.`)
3. Update labels Traefik du compose BLUE pour pointer `Host(prospection-blue.app.veridian.site)` (préserve pour rollback)
4. Compose update + deploy via API Dokploy sur les 2 composes
5. Smoke test prod
6. Tag image `:rollback-pre-authjs-full-2026-05-10` côté GHCR
7. Surveillance 24h

Rollback en cas de problème : refaire l'inverse (5 secondes via labels Traefik).

## Risque résiduel identifié

Le compose carcasse `compose-index-solid-state-card-d7uu39` (ancien prospection-saas + sa DB) **a été redémarré tout seul** par Dokploy lors du compose.deploy de GREEN (alors que je l'avais mis en restart=no et YAML disabled). Re-stoppé manuellement, mais c'est un signal que Dokploy peut "réveiller" des composes qu'on croyait morts. **À surveiller : si on fait un autre compose.deploy plus tard, vérifier que d7uu39 ne se réveille pas**.

Solution durable : `compose.delete` API Dokploy sur les composes carcasses (au lieu de juste rename YAML). Mais destructif, donc validation Robert nécessaire avant.

## Fichiers/refs

- Compose green YAML : `/tmp/prospection-greenauthjs.yml` (local) + côté Dokploy
- Backup pré-bascule DB prospection : `~/backups/prospection-prebascule-20260510-1243.sql.gz` (469MB local)
- Pattern référence : `~/.claude/projects/-home-brunon5-Bureau-veridian-platform/memory/project_blue_green_pattern.md`
