# Plan de cleanup prod — Phase 0b

> Suite de [prod-inventory-audit.md](prod-inventory-audit.md). 5 décisions à valider par Robert.
> Une fois validées, ce document devient le runbook d'exécution.

## Principes de sécurité (non négociables)

1. **Backup AVANT chaque action irréversible** : `docker inspect`, `docker exec ... pg_dump`,
   ou copie du volume vers `/home/ubuntu/forensics/2026-05-13-cleanup/`.
2. **Stop ≠ rm** : on stoppe d'abord, on attend 24h pour voir si rien ne casse, ON REMOVE après.
3. **Volumes en DERNIER** : on garde les volumes même après suppression du container pendant
   au moins 1 semaine.
4. **Ordre du moins critique au plus critique** : zombies évidents d'abord, Supabase en dernier.
5. **Test prod après chaque étape** : `curl -I` sur tous les endpoints + `obs check`.

## 5 décisions à valider — questions pour Robert

### Décision 1 — Supabase entière (12 containers, 38 CRIT, ~3 Go RAM)

**Question** : on kill toute la stack Supabase ou on la garde patchée ?

**Pour kill** :
- Hub migré vers Auth.js → plus besoin de Supabase Auth
- 0 trafic réel sur `api.app.veridian.site` (que du bot scanning)
- Storage déjà unhealthy
- 38 CVE CRITICAL = surface d'attaque massive
- Image `darthsim/imgproxy:v3.8.0` datée de 2022, jamais maintenue
- Libère ~3 Go RAM + ~7 Go disk

**Pour keep** :
- Hub + Prospection ont encore des env vars Supabase (boot tentatives ?)
- Données potentiellement importantes dans `compose-parse-digital-alarm-974mhw_supabase-db-data`
- Studio peut servir à visualiser des données legacy

**Action si KILL** :
1. Backup volumes Supabase DB via `pg_dump` (~5 min)
2. Vérifier que Hub + Prospection démarrent OK sans Supabase (suppr env vars `NEXT_PUBLIC_SUPABASE_*`)
3. Stop containers Supabase (12 containers)
4. Attendre 7 jours
5. `docker rm` les containers + supprimer le compose Dokploy
6. Garder les volumes Supabase encore 1 mois "au cas où"

➡️ **Recommandation : KILL** (gain énorme sécu + RAM, données déjà legacy).

### Décision 2 — Volumes `infra_*` et `00-global-saas_*` (~1.6 Go)

**Question** : kill direct ou dump d'abord ?

Ces volumes datent de l'époque "compose direct via `infra/docker-compose.yml`" avant migration
Dokploy. Aucun container actif ne les utilise. Mais ils contiennent potentiellement des dumps
historiques.

**Le plus gros** : `infra_notifuse-db-data` (666M). Si on n'a pas un dump récent de Notifuse, on
perd l'historique.

**Action recommandée** :
1. `pg_dump` les volumes DB (`infra_notifuse-db-data`, `infra_supabase-db-data`, `infra_twenty-db-data`)
   vers `/home/ubuntu/backups/legacy-volumes/2026-05-13/`
2. Archive sur dev-pub (sauvegarde croisée)
3. `docker volume rm` une fois les dumps validés
4. Garder les dumps 6 mois minimum

➡️ **Recommandation : BACKUP puis KILL**.

### Décision 3 — `code-prospection-saas-db-1` + volume `code_prospection-saas-data`

**Question** : kill avec backup ou kill brut ?

Stack `xelXB17eNlesUlHqHJCtY` supprimée 2026-05-11 (mémoire P0.0) mais le container DB et son
volume ont survécu. Ce sont sûrement les données qui étaient dans Prospection avant la mise en
prod actuelle.

**Action recommandée** :
1. `pg_dump code-prospection-saas-db-1` vers backup
2. Stop + rm container
3. Garder le volume 1 mois

➡️ **Recommandation : BACKUP puis KILL container, garder volume 1 mois**.

### Décision 4 — `compose-program-digital-application-vb1x5n` (CrowdSec limbo)

**Question** : reconstruire le compose proprement (via Git provider) ou kill et passer au WAF applicatif ?

Le container `code-crowdsec-1` tourne mais son compose Dokploy n'existe plus (que des `.bak`/`.disabled`/`.draft`).
Le bouncer (`code-crowdsec-traefik-bouncer-1`) a crashé et n'est plus relancé.

**Option A — Reconstruire** : créer `infra/services/crowdsec/docker-compose.yml` propre, le
brancher en Git provider Dokploy, redéployer la stack proprement. Le container actuel `code-crowdsec-1`
sera remplacé par un nouveau (perte de l'apprentissage local ~4 jours mais récupérable).

**Option B — Kill et WAF applicatif** : la TODO infra P2.2 mentionne "WAF applicatif" comme
alternative. Plus simple, mais demande du dev dans chaque app Next.js.

➡️ **Recommandation : Option A reconstruire** (CrowdSec marche bien, on a investi dedans).
   Le faire en premier dans l'agent infra (`agents/crowdsec.md`).

### Décision 5 — 4 zombies composes Dokploy (sans containers)

| Slug | Action proposée |
|---|---|
| `compose-copy-mobile-card-hy9a9f` | Vérifier contenu, supprimer via API Dokploy |
| `compose-generate-bluetooth-alarm-rtemgt` | Idem |
| `compose-input-back-end-application-t364gq` | Idem |
| `compose-program-digital-application-vb1x5n` | Garder le dossier (contient les backups CrowdSec), supprimer le compose Dokploy actif (déjà fait de facto vu qu'aucun docker-compose.yml actif). Ne touche pas aux `.bak`/`.disabled`. |

**Action** : `DELETE /api/trpc/compose.delete` via API Dokploy avec `deleteVolumes:false`
(on protège les volumes au cas où).

## Ordre d'exécution (une fois Robert a validé)

### Étape 1 — Zombies safe (sans risque)

1. `docker rm code-crowdsec-traefik-bouncer-1` (déjà exited)
2. Backup 3 dirs zombies `compose-copy-mobile-card-hy9a9f`, `compose-generate-bluetooth-alarm-rtemgt`, `compose-input-back-end-application-t364gq` vers `/home/ubuntu/forensics/`
3. Delete via API Dokploy (3 stacks)
4. Test prod : `curl -I` tous endpoints + `obs check`

### Étape 2 — Images mortes (très safe)

5. `docker rmi traefik:v3.6.7 aquasec/trivy:latest fbonalair/traefik-crowdsec-bouncer:latest`
6. Vérif `docker image prune --dry-run`
7. Si OK → `docker image prune -f`

### Étape 3 — Volumes orphelins (avec backup)

8. Pour chaque volume DB orphelin : démarrer un container temporaire postgres pour `pg_dump`
   ```bash
   docker run --rm -v infra_notifuse-db-data:/var/lib/postgresql/data \
     -v /home/ubuntu/backups/legacy-volumes/2026-05-13:/backup \
     postgres:17-alpine sh -c "pg_dumpall -U postgres > /backup/infra_notifuse-db-data.sql"
   ```
9. Rsync backups vers dev-pub
10. `docker volume rm` pour les non-DB d'abord (mailpit, redis, storage minuscules)
11. `docker volume rm` pour les DB après backup confirmé

### Étape 4 — DB orpheline prospection-saas

12. `pg_dump code-prospection-saas-db-1` → backup
13. `docker stop code-prospection-saas-db-1`
14. Attendre 7 jours
15. `docker rm` + suppression compose Dokploy si pas déjà fait

### Étape 5 — Supabase (si décision KILL)

16. Vérifier env vars Supabase dans Hub + Prospection, les commenter en local
17. Redéployer Hub + Prospection sans les env vars Supabase
18. Smoke test 24h
19. `pg_dump` Supabase DB
20. Stop containers Supabase (12 containers)
21. Attendre 7 jours
22. `docker rm` + delete compose Dokploy
23. `docker volume rm` (garder backups 1 mois)

### Étape 6 — CrowdSec reconstruct (mon scope agent infra)

24. Voir [agents/00-infra.md](agents/00-infra.md) section "CrowdSec reconstruct"

## Procédure de rollback (si ça casse)

À chaque étape :

1. **Restaurer un container stoppé** : `docker start <name>`
2. **Restaurer une stack delete** : recréer dans Dokploy UI avec le compose backupé
3. **Restaurer un volume** : `docker run -v <new-vol>:/data -v /backup:/backup postgres:X sh -c "psql -U postgres < /backup/X.sql"`
4. **Vérifier prod** : `curl -I` sur tous les endpoints, `obs check security`

## Status

- [ ] Décision 1 — Supabase (kill/keep)
- [ ] Décision 2 — Volumes legacy (backup+kill/keep)
- [ ] Décision 3 — DB prospection-saas (backup+kill)
- [ ] Décision 4 — CrowdSec compose (reconstruire/kill)
- [ ] Décision 5 — 4 zombies Dokploy (kill)

Robert valide → on exécute Étapes 1-6 dans l'ordre, avec test prod entre chaque.
