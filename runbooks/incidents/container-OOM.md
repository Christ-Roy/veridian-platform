# Incident — Container OOM (Out Of Memory)

## Symptômes

- App répond 502 / Connection refused
- `obs check infra` → CRIT sur RAM host (>90%)
- `docker ps -a` → container en `Exited (137)` (= SIGKILL OOM)
- `dmesg | tail` → "Out of memory: Killed process"

## Triage

### Étape 1 — Qui mange la RAM ?

```bash
ssh prod-pub "free -h && docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'" | head -20
# Trier par RAM desc
```

### Étape 2 — Pattern OOM

```bash
ssh prod-pub "dmesg -T | grep -i 'out of memory' | tail -10"
ssh prod-pub "journalctl -k --since '1h ago' | grep -i oom"
```

## Fix

### A. Container avec leak mémoire connu

```bash
docker restart $CONTAINER
# Attendre 30s, vérifier qu'il revient à RAM normale
# Si revient à 100% en < 10 min → vraie leak, à fix dans le code
```

### B. RAM host pleine, pas de leak

```bash
# Identifier les containers qui peuvent être arrêtés sans impact
# (typiquement : staging, dev, vieilles instances)
docker stop $NON_CRITICAL_CONTAINER

# Si OVH : upgrade RAM via panel OVH (1h pour appliquer)
# Si dev : possible compose -f docker-compose.dev.yml down
```

### C. Container critique avec ENV/limits manquantes

Vérifier que le compose Dokploy a bien des `deploy.resources.limits.memory` :

```yaml
deploy:
  resources:
    limits:
      memory: 2G  # adapter au profil de l'app
    reservations:
      memory: 256M
```

Sans ces limits, un container peut prendre toute la RAM et OOM-killer
sélectionne le plus gros (parfois Postgres !).

## Anti-récidive

- `obs check infra` quotidien (alerte si RAM > 80% sur 5 min)
- Limits memory dans tous les composes (cf `runbooks/standards/`)
- Si récurrent : VPS upgrade ou app refactor

## Liens

- `runbooks/standards/docker-healthchecks.md` (limits standards)
- TODO P0.2 (obs monitoring) ✅ déjà en place
