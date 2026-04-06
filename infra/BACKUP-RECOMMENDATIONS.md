# Recommandations Backup - Stack Production

## ✅ Améliorations Appliquées

1. ✅ **Bug critique corrigé** : Les 3 dumps SQL ont maintenant des noms distincts
2. ✅ **Nettoyage automatique** : Les dumps sont supprimés après backup (EXEC_AFTER)
3. ✅ **Certificats SSL sauvegardés** : Volume `letsencrypt` ajouté
4. ✅ **Healthcheck ajouté** : Vérification toutes les 12h
5. ✅ **Support S3/Object Storage** : Configuration prête (à activer)
6. ✅ **Notifications** : Configuration prête (à activer)

---

## 🎯 Fonctionnalités Avancées à Implémenter

### 1. Tests de Restauration Automatiques

**Problème** : Un backup non testé = pas de backup. Tu ne sais jamais si une archive est corrompue avant d'en avoir besoin.

**Solution** : Créer un job hebdomadaire qui :
1. Prend le dernier backup
2. Crée un container PostgreSQL temporaire
3. Tente de restaurer les dumps
4. Vérifie l'intégrité des données
5. Envoie un rapport

**Script exemple** : `infra/scripts/test-restore.sh`
```bash
#!/bin/bash
# Test de restauration hebdomadaire

LATEST_BACKUP=$(ls -t ./backups/*.tar.gz | head -1)
echo "Testing restore of: $LATEST_BACKUP"

# Extraction
tar -xzf "$LATEST_BACKUP" -C /tmp/restore-test/

# Test PostgreSQL restore
docker run --rm -v /tmp/restore-test:/backups postgres:15 \
  psql -U postgres -d postgres < /backups/supabase_dump.sql

# Vérifier exit code
if [ $? -eq 0 ]; then
  echo "✅ Restore test PASSED"
  # Envoyer notification succès
else
  echo "❌ Restore test FAILED"
  # Envoyer alerte critique
fi

# Cleanup
rm -rf /tmp/restore-test
```

**Cron** : `0 4 * * 0` (tous les dimanches à 4h)

---

### 2. Backup des Secrets (.env)

**Problème** : Ton fichier `.env` contient toutes les clés critiques mais n'est jamais sauvegardé.

**Solution** : Backup chiffré du .env dans un endroit sécurisé

**Script** : `infra/scripts/backup-secrets.sh`
```bash
#!/bin/bash
# Backup chiffré du .env

GPG_RECIPIENT="admin@veridian.site"  # Ton email GPG

# Chiffrer le .env
gpg --encrypt --recipient "$GPG_RECIPIENT" \
  --output ./backups/env-backup-$(date +%Y%m%d).gpg \
  ./.env

# Uploader vers S3 (bucket privé)
aws s3 cp ./backups/env-backup-*.gpg \
  s3://veridian-secrets-backup/ \
  --storage-class GLACIER

# Garder seulement les 30 derniers backups locaux
ls -t ./backups/env-backup-*.gpg | tail -n +31 | xargs rm -f
```

**⚠️ Important** : Garde une copie de ta clé GPG privée dans un coffre-fort physique ou un gestionnaire de mots de passe sécurisé.

---

### 3. Point-in-Time Recovery (PostgreSQL)

**Problème** : Les dumps quotidiens ne permettent pas de revenir à un état précis (ex: 2h avant un incident).

**Solution** : Activer l'archivage des WAL (Write-Ahead Logs) PostgreSQL

**Configuration** :
```yaml
# docker-compose.prod.yml
supabase-db:
  environment:
    POSTGRES_ARCHIVE_MODE: "on"
    POSTGRES_ARCHIVE_COMMAND: "cp %p /archive/wal/%f"
  volumes:
    - ./wal-archive:/archive/wal
```

**Avantage** : Restauration à n'importe quel point dans le temps (avec une granularité de quelques secondes).

**Inconvénient** : Espace disque supplémentaire (10-50 GB selon l'activité).

---

### 4. Monitoring avec Prometheus + Grafana

**Métriques essentielles** :
- Taille des backups (trend)
- Temps d'exécution
- Taux de succès (%)
- Espace disque restant
- Âge du dernier backup réussi

**Stack à ajouter** :
```yaml
# docker-compose.prod.yml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus-data:/prometheus

grafana:
  image: grafana/grafana:latest
  volumes:
    - grafana-data:/var/lib/grafana
```

**Exporteur custom** : Script Python qui expose des métriques Prometheus
```python
# metrics-exporter.py
from prometheus_client import Gauge, start_http_server
import os
import time

backup_size = Gauge('backup_size_bytes', 'Size of latest backup')
backup_age = Gauge('backup_age_seconds', 'Age of latest backup')

def collect_metrics():
    latest = max(os.listdir('./backups'), key=lambda x: os.path.getctime(f'./backups/{x}'))
    backup_size.set(os.path.getsize(f'./backups/{latest}'))
    backup_age.set(time.time() - os.path.getctime(f'./backups/{latest}'))

start_http_server(9100)
while True:
    collect_metrics()
    time.sleep(60)
```

---

### 5. Backup Incrémental avec BorgBackup

**Problème** : Des backups complets quotidiens de 10+ GB deviennent coûteux en stockage.

**Solution** : Remplacer `offen/docker-volume-backup` par BorgBackup

**Avantages** :
- Déduplication (économie 70-90% d'espace)
- Compression intelligente
- Chiffrement natif
- Backups incrémentiaux ultra-rapides

**Configuration** :
```yaml
backup:
  image: nold360/borgmatic:latest
  volumes:
    - ./borgmatic.yml:/etc/borgmatic/config.yaml
    - /var/run/docker.sock:/var/run/docker.sock:ro
```

**Config** : `borgmatic.yml`
```yaml
location:
  source_directories:
    - /backup
  repositories:
    - ssh://backup@backup-server/~/repos/veridian

retention:
  keep_daily: 7
  keep_weekly: 4
  keep_monthly: 6

hooks:
  before_backup:
    - docker exec supabase-db pg_dump ...
  after_backup:
    - docker exec supabase-db rm ...
```

---

### 6. Multi-Destination avec Rclone

**Objectif** : Envoyer les backups vers plusieurs destinations (géo-redondance)

**Destinations recommandées** :
1. Serveur DEV (ovhh) - SFTP
2. Scaleway Object Storage (France)
3. AWS S3 Glacier (EU)
4. Backblaze B2 (US)

**Configuration** :
```yaml
backup:
  environment:
    BACKUP_COPY_TARGETS: |
      rclone:scaleway:veridian-backup
      rclone:aws-glacier:veridian-backup
      rclone:backblaze:veridian-backup
```

**Coût** : ~10-20€/mois pour 500 GB géo-redondés

---

## 📋 Variables d'Environnement à Ajouter

Ajouter dans `infra/.env` :

```bash
# ===== BACKUP CONFIGURATION =====

# SSH/SFTP vers serveur DEV
BACKUP_SSH_HOST=backup.veridian.dev
BACKUP_SSH_PORT=22
BACKUP_SSH_USER=backup
BACKUP_SSH_PATH=/home/backup/veridian

# Chiffrement (générer avec: openssl rand -base64 32)
BACKUP_ENCRYPTION_KEY=your-32-char-key-here

# Notifications (optionnel)
BACKUP_WEBHOOK_URL=https://hooks.slack.com/services/...
# ou
BACKUP_WEBHOOK_URL=https://notifuse.app.veridian.site/api/webhooks/backup

# S3/Object Storage (optionnel)
BACKUP_S3_BUCKET=veridian-backups
BACKUP_S3_KEY=AKIA...
BACKUP_S3_SECRET=...
BACKUP_S3_ENDPOINT=s3.fr-par.scw.cloud  # Scaleway Paris
```

---

## 🚨 Checklist Disaster Recovery

**À tester au moins 1 fois par trimestre** :

- [ ] Restaurer un dump SQL dans un container PostgreSQL vierge
- [ ] Vérifier l'intégrité des certificats Let's Encrypt restaurés
- [ ] Tester la restauration des volumes Docker
- [ ] Vérifier que le .env chiffré peut être déchiffré
- [ ] Mesurer le temps de restauration complète (RTO)
- [ ] Documenter la procédure de restauration étape par étape

**RTO Target** : < 4 heures pour restauration complète
**RPO Target** : < 24 heures (backup quotidien)

---

## 📊 Coûts Estimés

| Service | Capacité | Coût/mois |
|---------|----------|-----------|
| Serveur DEV (actuel) | SFTP illimité | 0€ (déjà payé) |
| Scaleway Object Storage | 500 GB | ~2.50€ |
| AWS S3 Glacier Deep | 500 GB | ~1€ |
| Backblaze B2 | 500 GB | ~2.50€ |
| **Total géo-redondance** | - | **~6€/mois** |

---

## 🎯 Roadmap Recommandée

### Phase 1 (Urgent - Cette semaine)
- [x] Corriger le bug EXEC_BEFORE (3 dumps distincts)
- [x] Ajouter EXEC_AFTER (nettoyage)
- [x] Sauvegarder le volume letsencrypt
- [x] Ajouter healthcheck

### Phase 2 (Court terme - Ce mois-ci)
- [ ] Configurer les notifications (Slack/Discord/Notifuse)
- [ ] Activer S3/Object Storage (Scaleway)
- [ ] Créer un script de test de restauration
- [ ] Documenter la procédure de restauration

### Phase 3 (Moyen terme - 3 mois)
- [ ] Implémenter les tests de restauration automatiques (hebdomadaires)
- [ ] Activer la géo-redondance (2-3 destinations)
- [ ] Setup monitoring Prometheus + Grafana
- [ ] Backup chiffré du .env

### Phase 4 (Long terme - 6 mois)
- [ ] Migrer vers BorgBackup pour backups incrémentiaux
- [ ] Implémenter Point-in-Time Recovery (WAL archiving)
- [ ] Setup alerting 24/7 (PagerDuty/OpsGenie)

---

## 📚 Documentation Complémentaire

- [Docker Volume Backup - Official Docs](https://github.com/offen/docker-volume-backup)
- [PostgreSQL Backup Best Practices](https://www.postgresql.org/docs/current/backup.html)
- [BorgBackup Guide](https://borgbackup.readthedocs.io/)
- [AWS S3 Glacier Deep Archive Pricing](https://aws.amazon.com/s3/pricing/)

---

**Dernière mise à jour** : 8 février 2026
**Responsable** : DevOps Team
**Prochaine revue** : Mai 2026
