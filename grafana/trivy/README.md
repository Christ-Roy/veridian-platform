# Trivy — scanner CVE on-demand Veridian

> Conteneur Trivy lance en mode ephemere (`docker compose run --rm`) pour
> scanner les images Docker tournant en prod / dev. Pas de service
> permanent : zero RAM en idle, scan a la demande.

## Pourquoi ce dossier vit ici (grafana/trivy/)

Trivy est consomme par le CLI `obs` (`grafana/cli/`) et a terme par la CI
GitHub Actions. Co-localiser avec le CLI evite la dispersion : tout ce qui
sert a l'observabilite / audit securite vit dans `grafana/`.

Ce n'est pas un service applicatif tournant en permanence — il n'a donc
pas sa place dans `infra/` (qui contient les services long-running).

## Deploiement

Le compose file doit etre present sur les hosts qui scannent (`prod-pub`,
`dev-pub`). Trois options pour deployer :

1. **Sync via Syncthing** (si configure pour ce dossier)
2. **Rsync manuel** :
   ```bash
   rsync -av grafana/trivy/ prod-pub:/home/ubuntu/veridian/grafana/trivy/
   rsync -av grafana/trivy/ dev-pub:/home/ubuntu/veridian/grafana/trivy/
   ```
3. **Git pull** dans un clone du repo sur les hosts (si configure)

Apres deploiement, premier pull (la base CVE descend a ce moment) :
```bash
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && docker compose pull trivy'
```

## Usage manuel (sans `obs`)

```bash
# Scan d'une image specifique
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && \
  docker compose run --rm trivy image traefik:v3.0'

# Forcer toutes severities (override env var)
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && \
  TRIVY_SEVERITY=CRITICAL,HIGH,MEDIUM docker compose run --rm trivy image nginx:1.25'

# Format table lisible humain
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && \
  TRIVY_FORMAT=table docker compose run --rm trivy image hub:latest'

# Scan + exit code 1 si critical/high (mode CI)
ssh prod-pub 'cd /home/ubuntu/veridian/grafana/trivy && \
  TRIVY_EXIT_CODE=1 docker compose run --rm trivy image hub:latest'
```

## Usage via `obs` (recommande)

```bash
obs check security              # vue concise + drill-down
obs security images             # liste tous les containers + nb CVE
obs security images <container> # detail CVE d'un container
```

## Maintenance

- **Bump de version Trivy** : editer `docker-compose.yml`, PR, redeploy.
- **Revue trimestrielle de `.trivyignore`** : retirer les CVE patchees,
  re-justifier les exceptions restantes.
- **Maj base CVE** : Trivy la pull automatiquement au demarrage (sauf si
  `TRIVY_SKIP_DB_UPDATE=true`). La base est cachee dans le volume nomme
  `veridian-trivy-cache`. Pour forcer un refresh complet :
  ```bash
  docker volume rm veridian-trivy-cache
  ```
  (sera recree au prochain scan, +30s au premier run apres reset)

## Performance attendue

| Scenario | Duree |
|---|---|
| Premier run apres install (DL base CVE 400 Mo) | 30-60s |
| Run normal sur image ~200 Mo (cache chaud) | 5-15s |
| Image lourde 1 Go+ (Twenty, Supabase) | 20-40s |
| 30 images en parallele (4 SSH paralleles, cache chaud) | 2-4 min |
