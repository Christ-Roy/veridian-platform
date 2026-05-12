# Disaster Recovery — Veridian

> Procédures de restauration en cas d'incident grave.
> RPO cible : 24h (perte de données acceptée max). RTO cible : 30 min (temps de restore).

## Source de vérité des backups

| App | DB container prod | Backup R2 | Schedule | Rétention |
|---|---|---|---|---|
| Prospection | `code-prospection-saas-db-1` | `r2:veridian-backups/prospection/` | 04:00 UTC quotidien (cron `/etc/cron.d/veridian-backups`) | 30 jours |
| Veridian-core (Hub + Analytics) | `compose-parse-multi-byte-feed-ywg73b-veridian-core-db-1` | `r2:veridian-backups/veridian-core/` | 04:10 UTC quotidien | 30 jours |
| Verger-shop | `verger-shop-ozjjew-postgres-1` | `r2:veridian-backups/verger-shop/` | 04:20 UTC quotidien | 30 jours |
| CMS | `veridian-cms-postgres-prod` | `r2:veridian-backups/cms/` | 04:00 UTC quotidien (cron `/etc/cron.d/cms-backup`) | 30 jours |
| Notifuse | `compose-transmit-open-source-microchip-k9lvap-notifuse-postgres-1` | `r2:veridian-backups/notifuse/` | configuré ailleurs (Dokploy ? à confirmer) | ? |
| Twenty | `compose-parse-optical-array-lvh5md-twenty-postgres-1` | `r2:veridian-backups/twenty/` | configuré ailleurs | ? |
| Supabase | `compose-parse-digital-alarm-974mhw-supabase-db-1` | `r2:veridian-backups/supabase/` | configuré ailleurs | ? |

Sync R2 → local KDE : `0 7 * * *` (rclone sync vers `~/backups/veridian/`).

## Scripts de référence

- **Backup** : `~/Bureau/veridian-platform-infra/infra/scripts/backup-postgres.sh`
  (déployé sur prod-pub:/home/ubuntu/backup-postgres.sh)
- **Restore** : `~/Bureau/veridian-platform-infra/infra/scripts/restore-db.sh`
  (à utiliser depuis local KDE, restore dans Postgres temporaire localhost:15999)

## Scénario A — DB d'une app corrompue ou perdue

**Symptôme** : queries qui retournent des données aberrantes, erreurs `relation does not exist`, ou la DB ne démarre plus.

### Étape 1 — Stop l'app (sans toucher à la DB)

```bash
DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
ssh prod-pub "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' \
  -d '{\"json\":{\"composeId\":\"<APP_COMPOSE_ID>\"}}' \
  http://localhost:3000/api/trpc/compose.stop"
```

### Étape 2 — Test restore dans un Postgres temporaire D'ABORD

⚠️ Ne JAMAIS restore direct en prod. Toujours valider d'abord :

```bash
~/Bureau/veridian-platform-infra/infra/scripts/restore-db.sh prospection
# Sortie : DB temporaire sur localhost:15999, smoke test des tables
```

Si le smoke test passe (counts non-aberrants), le backup est valide.

### Étape 3 — Backup AVANT de toucher la DB prod (au cas où)

```bash
ssh prod-pub "set -a; source /home/ubuntu/.backup-env; set +a; /home/ubuntu/backup-postgres.sh prospection-pre-restore code-prospection-saas-db-1 postgres prospection"
```

### Étape 4 — Restore en prod

**Méthode A : Drop + recreate + restore** (si DB corrompue mais container OK) :

```bash
# Connexion à la DB prod
ssh prod-pub "docker exec -it code-prospection-saas-db-1 psql -U postgres"

# Dans psql :
DROP DATABASE prospection;
CREATE DATABASE prospection;
\q

# Restore depuis le dump R2 (depuis local)
rclone copy r2:veridian-backups/prospection/prospection_<date>.sql.gz /tmp/
scp /tmp/prospection_<date>.sql.gz prod-pub:/tmp/
ssh prod-pub "gunzip -c /tmp/prospection_<date>.sql.gz | docker exec -i code-prospection-saas-db-1 psql -U postgres -d prospection"
```

**Méthode B : Recreate volume** (si DB totalement perdue) :

```bash
DKEY=$(grep '^DOKPLOY_API_KEY=' ~/credentials/.all-creds.env | cut -d= -f2)
# Stop DB container
ssh prod-pub "docker stop code-prospection-saas-db-1"
# Backup et delete le volume corrompu
ssh prod-pub "docker volume rename code_prospection-saas-data code_prospection-saas-data-corrupted-$(date +%Y%m%d)"
# Redeploy la stack (Dokploy recrée un volume vide)
ssh prod-pub "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' -d '{\"json\":{\"composeId\":\"<DB_COMPOSE_ID>\"}}' http://localhost:3000/api/trpc/compose.redeploy"
# Restore comme méthode A étape 4
```

### Étape 5 — Restart app + smoke test

```bash
ssh prod-pub "curl -s -X POST -H 'x-api-key: $DKEY' -H 'Content-Type: application/json' \
  -d '{\"json\":{\"composeId\":\"<APP_COMPOSE_ID>\"}}' \
  http://localhost:3000/api/trpc/compose.redeploy"

# Test endpoint
curl -sf https://prospection.app.veridian.site/api/health
```

### Étape 6 — Ping Robert + log incident

```
[INCIDENT] DB <app> restored from <date> backup
Cause: <symptôme initial>
Data loss window: <max 24h> (backup du <date>)
Action: restore from R2 → prod → smoke OK
Next: post-mortem dans runbooks/incidents/
```

## Scénario B — Volume Docker perdu (cas 2026-05-08)

Container DB démarre mais retourne `relation does not exist` ou DB vide.

### Étape 1 — Identifier le bon volume historique

```bash
ssh prod-pub "docker volume ls --format '{{.Name}}\t{{.CreatedAt}}' | grep -i <app>"
# Lister par date de création — souvent une copie "ancien" existe encore
```

### Étape 2 — Inspecter le contenu du volume avant action

```bash
ssh prod-pub "docker run --rm -v <volume_name>:/data alpine ls -la /data | head"
```

### Étape 3 — Si l'ancien volume existe, le réutiliser

```bash
# Stop container actuel
ssh prod-pub "docker stop <db-container>"
# Modifier le compose pour pointer sur l'ancien volume
# OU rename volumes (delete le nouveau vide, rename ancien vers nouveau)
```

### Étape 4 — Si rien à récupérer, scénario A (restore from R2)

## Scénario C — VPS prod totalement HS

Estimation : 2-4h de restore complet.

### Étape 1 — Provisionner un nouveau VPS OVH

```bash
# Via OVH API (skill ovh-api) ou manager.ovh.com
# Spec : 16 GB RAM, 100 GB SSD, Ubuntu 24.04 LTS
```

### Étape 2 — Install Docker + Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

### Étape 3 — Restore Dokploy depuis backup config

Si on a `/etc/dokploy/db.sqlite` backupé :
```bash
ssh new-vps "sudo cp db.sqlite /etc/dokploy/db.sqlite && systemctl restart dokploy"
```

Sinon : recréer tous les projects + composes from scratch (long, ~2h).

### Étape 4 — Restore toutes les DBs depuis R2

Pour chaque app :
```bash
~/Bureau/veridian-platform-infra/infra/scripts/restore-db.sh <app>
# Une fois validé en temporaire, pousser sur la nouvelle prod
```

### Étape 5 — Reconfigurer DNS Cloudflare

```bash
# Via skill cloudflare-dns
# Mettre à jour tous les A records vers la nouvelle IP du VPS
```

### Étape 6 — Smoke test complet

```bash
~/Bureau/veridian-platform-infra/infra/scripts/check-traefik-unique-host.sh
# Curl tous les endpoints critiques
```

## Scénario D — Compromission sécurité (cas 2026-05-07 verger-shop)

⚠️ Toujours commencer par **forensique** avant tout cleanup.

### Étape 1 — Snapshot forensique AVANT kill

```bash
ssh prod-pub "mkdir -p /home/ubuntu/forensics/$(date +%Y-%m-%d-%H%M)-incident"
# Copy les binaires suspects, configs, logs
ssh prod-pub "docker cp <suspect-container>:/path/to/malware /home/ubuntu/forensics/.../"
ssh prod-pub "docker logs --tail 5000 <container> > /home/ubuntu/forensics/.../docker-logs.txt"
ssh prod-pub "docker inspect <container> > /home/ubuntu/forensics/.../docker-inspect.json"
```

### Étape 2 — Stopper le container compromis

```bash
ssh prod-pub "docker stop <suspect-container>"
ssh prod-pub "docker update --restart=no <suspect-container>"
```

### Étape 3 — Bloquer l'IP du C2 dans iptables OUTPUT

```bash
ssh prod-pub "sudo iptables -A OUTPUT -d <c2-ip> -j DROP"
ssh prod-pub "sudo iptables-save | sudo tee /etc/iptables/rules.v4"
```

### Étape 4 — Vérifier la non-propagation

```bash
# Autres containers : process / connexions / /tmp /var/tmp /dev/shm
ssh prod-pub "for c in \$(docker ps --format '{{.Names}}'); do docker top \$c | grep -iE 'xmrig|minerd|cpu-logind' && echo \"^ in \$c\"; done"
# Host : users, SSH keys, crontabs, services systemd, /etc/ld.so.preload, fichiers SUID, bash_history
ssh prod-pub "last -n 20; sudo cat /etc/ld.so.preload 2>/dev/null; sudo find / -perm -4000 -newer /var/log/syslog 2>/dev/null | head"
```

### Étape 5 — Roter TOUS les secrets exposés au container compromis

Considérer **tous** les ENV du container comme compromis (Stripe live key, AUTH_SECRET, DATABASE_URL, etc.). Procédure de rotation : `runbooks/secrets-rotation.md`.

### Étape 6 — Trouver le vecteur d'entrée AVANT de redéployer

Sans ça, les attaquants reviennent. Commencer par :
```bash
npm audit  # dans le repo de l'app concernée
trivy image <image:tag>  # CVE système
```

### Étape 7 — Patch + redeploy clean

Suivre le flow CI standard (push + auto-deploy).

### Étape 8 — Post-mortem

Rédiger dans `runbooks/incidents/<date>-<incident>.md` :
- Timeline
- Vecteur d'entrée confirmé
- Impact (secrets exposés, données exfiltrées)
- Actions correctives
- Leçons apprises

## Tests de restore obligatoires

- **Mensuel** : cron qui rejoue `restore-db.sh` sur une DB random (cf. `~/Bureau/veridian-platform-infra/infra/scripts/test-restore-monthly.sh`). Alert Telegram si fail.
- **Trimestriel** : disaster recovery dry run complet — simuler scénario C sur un VPS temporaire (~2h).

## Métriques cibles

- **RPO** (max data loss) : 24h (backup quotidien à 04:00 UTC)
- **RTO** (time to restore) :
  - Scénario A (DB corrompue) : 30 min
  - Scénario B (volume perdu) : 30 min
  - Scénario C (VPS HS) : 2-4h
  - Scénario D (compromission) : variable (selon forensique)

Si une app a besoin de RPO/RTO plus strict, ouvrir un ticket pour streaming replication ou WAL archiving.
