# DETTE-004 — Runner self-hosted dev-server saturation disque (buildx cache)

**Sévérité** : 🟡 moyenne (bloque les builds CI quand ça arrive)
**Découvert** : 2026-05-08 19:10 — fork Notifuse run 25574039155 fail "no space left on device"

## Contexte

Le runner self-hosted dev-server (`actions.runner.Christ-Roy-notifuse-veridian.veridian-dev-server-notifuse.service`) accumule du buildx cache à chaque run sans GC efficace.

**Ce qu'on a vu** :
- Disque dev-server à **99% (71G/72G)** au moment du fail
- `docker system df` : **6.3 GB de Build Cache reclaimable** (69 entries, 0 active)
- `docker buildx prune -af` libère 3-4 GB d'un coup
- Mais le cache se reconstruit immediatement au prochain build → cycle vicieux

**Symptôme typique** :
```
ERROR: failed to build: failed to solve: ResourceExhausted:
failed to compute cache key: write /var/lib/buildkit/runc-overlayfs/...
no space left on device
```

## Cause root

Le builder buildx créé par `docker/setup-buildx-action@v3` a une GC policy par défaut qui **ne purge pas assez** :

```
GC Policy rule#1:
 Keep Duration:  1440h0m0s    (60 jours !)
 Reserved Space: 7.451GiB
 Max Used Space: 54.02GiB
 Min Free Space: 13.97GiB
```

Avec `Max Used Space: 54 GiB` sur un disque de 72 GB, on tape la limite vite.

## Fix proposé

### Option A — Cleanup automatique en début de workflow (rapide, fix urgent)

Ajouter au début du job `build` dans `.github/workflows/veridian-ci.yml` :

```yaml
- name: Cleanup buildx cache before build (avoid disk saturation)
  run: |
    df -h /
    docker buildx prune -af --filter "until=24h" 2>&1 | tail -3 || true
    docker image prune -af 2>&1 | tail -3 || true
    df -h /
```

Effet : avant chaque build, on garde max 24h de cache. Coût : un peu plus lent au build (cache moins chaud).

### Option B — GC policy custom (mieux à terme)

Configurer le builder avec une GC policy plus agressive via `docker buildx create` :

```bash
docker buildx create --use \
  --buildkitd-flags '--max-parallelism=2' \
  --config /tmp/buildkit.toml
```

Avec `/tmp/buildkit.toml` :
```toml
[worker.oci]
  gc = true
  gckeepstorage = "10GB"  # vs 54 GB par défaut
[[worker.oci.gcpolicy]]
  keepBytes = "5GB"
  keepDuration = "168h"  # 7 jours vs 60 jours
```

### Option C — Augmenter la taille du disque dev-server

VPS OVH 72 GB — petit pour CI build cache + scraping pipeline + Postgres staging. Bumper à 120 GB serait raisonnable. Coût ~5€/mois supplémentaire.

## Recommandation

**Court terme** : Option A (cleanup début workflow). Patch simple, immédiat, anti-régression.

**Moyen terme** : Option B (GC policy custom) ou Option C (bump disque) selon coût.

## Liens

- Run failed : https://github.com/Christ-Roy/notifuse-veridian/actions/runs/25574039155
- Run réussi après cleanup manuel : (à update une fois validé)
