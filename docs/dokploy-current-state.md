# Etat actuel Dokploy — Snapshot 2026-04-10

> **Snapshot fige au 2026-04-10 ~11h00** via API tRPC read-only (`compose.one`).
> Re-generer avec : `/tmp/gen_dokploy_md.py` apres refresh des dumps dans `/tmp/dokploy-audit-local/`.
> Source de verite vivante = Dokploy lui-meme, ce fichier est un audit de reference.

## Resume chiffre

- **22 composes** au total sur le VPS Dokploy (prod + staging + prod-clone)
- **17 composes audites** dans ce document (prod + staging, hors prod-clone)
- **100% en `sourceType: raw`** — aucun compose en `sourceType: git` ou `github`
- **Pattern reel prod valide** : `raw + GHCR` (CI build+push GHCR, Dokploy pull image)
  utilise par `prospection-fr`, `dashboard`, `asset-bank`, `linkedin-dashboard`,
  et toutes les declinaisons staging
- **Services YAML-only upstream** (pas de GHCR, pas de build custom) : `supabase`,
  `twenty`, `notifuse`, `crowdsec`, `sablier`, `internal-tools` — candidats ideaux
  pour migration vers `sourceType: git` (plan Phase 2, 4)

## Decouvertes notables

1. **`prospection-fr` n'est PAS en `sourceType: git`** malgre ce que dit le skill
   `migrate-to-git.md` : il est en `raw` avec `customGitUrl` residuel pointant sur
   l'ancien repo `git@github.com:Christ-Roy/prospection.git` (repo archive depuis
   la migration monorepo `veridian-platform`). Le pattern valide en prod est
   "code dans git + CI build GHCR + compose raw pull image", pas "Dokploy clone".
2. **`prospection-saas`** (Internal Tools/prod) est du legacy pre-monorepo a
   supprimer (confirme par Robert). A traiter en Phase 6 cleanup.
3. **124 env vars partagees** sur `crowdsec`, `notifuse`, `supabase`, `twenty`,
   `internal-tools` : probablement herites de l'environnement Dokploy
   `KmNwdMqLi9ye4xZ57WsnC` (SaaS Veridian/production). `dashboard` en a 128
   (124 herites + 4 specifiques probablement).
4. **`internal-tools`** est un meta-compose qui embarque les domaines Traefik
   de `prospection-fr`, `linkedin-dashboard`, `asset-bank` simultanement. A
   clarifier avant migration — risque de double-routing.
5. **`saas-staging`** (17422 chars, 27 services) = la stack staging complete
   unifiee. C'est le pendant de `infra/docker-compose.staging.yml` dans le repo.
   **Candidat prioritaire** pour migration `sourceType: git` pointant sur
   `infra/docker-compose.staging.yml` — le fichier est deja en git.

## Tableaux par environnement
<!-- contenu genere par /tmp/gen_dokploy_md.py -->


## Internal Tools / production

| Compose | ID | sourceType | customGitUrl | composePath | Build | GHCR | Services | EnvVars | Volumes | Domains |
|---------|-----|-----------|--------------|-------------|-------|------|---------:|--------:|--------:|---------|
| `asset-bank` | `JISyqhpPi6ba6xDe1c8Bs` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 1 | 3 | assets.internal.veridian.site |
| `freeswitch-sip` | `IEcX8UuvTbbMVR-JC72jp` | `raw` | - | `./docker-compose.yml` | - | yes | 1 | 0 | 1 | - |
| `internal-tools` | `1VDKsnwbLtl55_LAtilXS` | `raw` | - | `./docker-compose.yml` | - | - | 4 | 124 | 5 | prospection.internal.veridian.site, linkedin.internal.veridian.site |
| `linkedin-dashboard` | `VHAE-M9UD4EfkNUnkt7os` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 1 | 1 | linkedin.internal.veridian.site |
| `prospection-fr` | `YF1ogCCM2z729b2BMEAb8` | `raw` | git@github.com:Christ-Roy/prospection.git (main) | `./docker-compose.yml` | - | yes | 2 | 7 | 1 | prospection.internal.veridian.site |
| `prospection-saas` | `xelXB17eNlesUlHqHJCtY` | `raw` | - | `./docker-compose.yml` | - | yes | 4 | 3 | 1 | - |

## Internal Tools / staging

| Compose | ID | sourceType | customGitUrl | composePath | Build | GHCR | Services | EnvVars | Volumes | Domains |
|---------|-----|-----------|--------------|-------------|-------|------|---------:|--------:|--------:|---------|
| `asset-bank-staging` | `G8jNGM4ppQ928DnvRd-mI` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 0 | 0 | assets.staging.veridian.site |
| `freeswitch-staging` | `0Bd7mpwIxH7p8B2ykxSq7` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 0 | 1 | - |
| `linkedin-staging` | `MvnMADZSaWXeVa6hp-YVq` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 0 | 0 | linkedin.staging.veridian.site |
| `prospection-staging` | `j4wqH-42gbeZini9_Ls2k` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 0 | 1 | prospection.staging.veridian.site |
| `sablier` | `gA9J9T3qH_VK-UMhihwVr` | `raw` | - | `./docker-compose.yml` | - | - | 2 | 0 | 1 | - |

## SaaS Veridian / production

| Compose | ID | sourceType | customGitUrl | composePath | Build | GHCR | Services | EnvVars | Volumes | Domains |
|---------|-----|-----------|--------------|-------------|-------|------|---------:|--------:|--------:|---------|
| `crowdsec` | `-yhkpTC6N_zh0FxNwAKJa` | `raw` | - | `./docker-compose.yml` | - | - | 5 | 124 | 3 | - |
| `dashboard` | `Rnt_Jz4BhkcyEJ2D6Bugb` | `raw` | - | `./docker-compose.yml` | - | yes | 2 | 128 | 0 | app.veridian.site |
| `notifuse` | `WN0jglLj5bDIrXUFZHNmw` | `raw` | - | `./docker-compose.yml` | - | - | 6 | 124 | 3 | notifuse.app.veridian.site |
| `supabase` | `xhlNGckdeiH1ZdSqZv2HT` | `raw` | - | `./docker-compose.yml` | - | - | 15 | 124 | 16 | api.app.veridian.site |
| `twenty` | `8zdqAAD1lkZFVAwuZ5USv` | `raw` | - | `./docker-compose.yml` | - | - | 9 | 124 | 5 | twenty.app.veridian.site |

## SaaS Veridian / staging

| Compose | ID | sourceType | customGitUrl | composePath | Build | GHCR | Services | EnvVars | Volumes | Domains |
|---------|-----|-----------|--------------|-------------|-------|------|---------:|--------:|--------:|---------|
| `saas-staging` | `0f3uUHxT5kUdJuZWdApm0` | `raw` | - | `./docker-compose.yml` | - | yes | 27 | 32 | 10 | - |

## Details par compose

### `asset-bank` (Internal Tools / production)

- **Compose ID** : `JISyqhpPi6ba6xDe1c8Bs`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (408 chars)
- **Services detectes** : `asset-bank`, `dokploy-network`
- **Env vars** : 1 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 3
- **Domaines Traefik** : assets.internal.veridian.site
- **appName interne Dokploy** : `compose-index-bluetooth-driver-sm2qyo`

### `freeswitch-sip` (Internal Tools / production)

- **Compose ID** : `IEcX8UuvTbbMVR-JC72jp`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (449 chars)
- **Services detectes** : `freeswitch`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-generate-bluetooth-alarm-rtemgt`

### `internal-tools` (Internal Tools / production)

- **Compose ID** : `1VDKsnwbLtl55_LAtilXS`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (1857 chars)
- **Services detectes** : `prospection-fr`, `linkedin-dashboard`, `asset-bank`, `dokploy-network`
- **Env vars** : 124 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 5
- **Domaines Traefik** : prospection.internal.veridian.site, linkedin.internal.veridian.site, assets.internal.veridian.site
- **appName interne Dokploy** : `compose-copy-mobile-card-hy9a9f`

### `linkedin-dashboard` (Internal Tools / production)

- **Compose ID** : `VHAE-M9UD4EfkNUnkt7os`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (923 chars)
- **Services detectes** : `linkedin-dashboard`, `dokploy-network`
- **Env vars** : 1 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : linkedin.internal.veridian.site
- **appName interne Dokploy** : `compose-quantify-solid-state-microchip-ft7svu`

### `prospection-fr` (Internal Tools / production)

- **Compose ID** : `YF1ogCCM2z729b2BMEAb8`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Git URL (inactif en raw)** : `git@github.com:Christ-Roy/prospection.git` (branch `main`)
- **Compose path** : `./docker-compose.yml`
- **Services detectes** : `prospection-fr`, `dokploy-network`
- **Env vars** : 7 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : prospection.internal.veridian.site
- **appName interne Dokploy** : `compose-input-back-end-application-t364gq`

### `prospection-saas` (Internal Tools / production)

- **Compose ID** : `xelXB17eNlesUlHqHJCtY`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (1922 chars)
- **Services detectes** : `prospection-saas-db`, `prospection-saas`, `prospection-saas-data`, `dokploy-network`
- **Env vars** : 3 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-index-solid-state-card-d7uu39`

### `asset-bank-staging` (Internal Tools / staging)

- **Compose ID** : `G8jNGM4ppQ928DnvRd-mI`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (470 chars)
- **Services detectes** : `asset-bank`, `dokploy-network`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 0
- **Domaines Traefik** : assets.staging.veridian.site
- **appName interne Dokploy** : `compose-synthesize-redundant-transmitter-3qiduj`

### `freeswitch-staging` (Internal Tools / staging)

- **Compose ID** : `0Bd7mpwIxH7p8B2ykxSq7`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (464 chars)
- **Services detectes** : `freeswitch`, `freeswitch-recordings`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-navigate-1080p-firewall-13ocbr`

### `linkedin-staging` (Internal Tools / staging)

- **Compose ID** : `MvnMADZSaWXeVa6hp-YVq`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (471 chars)
- **Services detectes** : `linkedin-dashboard`, `dokploy-network`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 0
- **Domaines Traefik** : linkedin.staging.veridian.site
- **appName interne Dokploy** : `compose-navigate-optical-port-md2tvi`

### `prospection-staging` (Internal Tools / staging)

- **Compose ID** : `j4wqH-42gbeZini9_Ls2k`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (625 chars)
- **Services detectes** : `prospection-fr`, `dokploy-network`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : prospection.staging.veridian.site
- **appName interne Dokploy** : `compose-program-1080p-feed-qbf9h5`

### `sablier` (Internal Tools / staging)

- **Compose ID** : `gA9J9T3qH_VK-UMhihwVr`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (363 chars)
- **Services detectes** : `sablier`, `dokploy-network`
- **Env vars** : 0 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 1
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-override-virtual-feed-mkr9j2`

### `crowdsec` (SaaS Veridian / production)

- **Compose ID** : `-yhkpTC6N_zh0FxNwAKJa`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (1417 chars)
- **Services detectes** : `crowdsec`, `crowdsec-traefik-bouncer`, `infra_crowdsec-db`, `infra_crowdsec-config`, `dokploy-network`
- **Env vars** : 124 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 3
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-program-digital-application-vb1x5n`

### `dashboard` (SaaS Veridian / production)

- **Compose ID** : `Rnt_Jz4BhkcyEJ2D6Bugb`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (2533 chars)
- **Services detectes** : `web-dashboard`, `dokploy-network`
- **Env vars** : 128 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 0
- **Domaines Traefik** : app.veridian.site
- **appName interne Dokploy** : `compose-parse-digital-bandwidth-xfd9mu`

### `notifuse` (SaaS Veridian / production)

- **Compose ID** : `WN0jglLj5bDIrXUFZHNmw`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (2352 chars)
- **Services detectes** : `notifuse-postgres`, `notifuse`, `infra_notifuse-db-data`, `infra_notifuse-data`, `dokploy-network`, `notifuse-internal`
- **Env vars** : 124 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 3
- **Domaines Traefik** : notifuse.app.veridian.site
- **appName interne Dokploy** : `compose-transmit-open-source-microchip-k9lvap`

### `supabase` (SaaS Veridian / production)

- **Compose ID** : `xhlNGckdeiH1ZdSqZv2HT`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (11710 chars)
- **Services detectes** : `kong`, `studio`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`, `functions`, `supabase-db`, `infra_supabase-db-data`, `infra_supabase-storage-data`, `infra_db-config`, `dokploy-network`, `supabase-internal`
- **Env vars** : 124 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 16
- **Domaines Traefik** : api.app.veridian.site
- **appName interne Dokploy** : `compose-parse-digital-alarm-974mhw`

### `twenty` (SaaS Veridian / production)

- **Compose ID** : `8zdqAAD1lkZFVAwuZ5USv`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (3997 chars)
- **Services detectes** : `twenty-postgres`, `twenty-redis`, `twenty-server`, `twenty-worker`, `infra_twenty-db-data`, `infra_twenty-redis-data`, `infra_twenty-storage`, `dokploy-network`, `twenty-internal`
- **Env vars** : 124 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : NON
- **Volumes/bind mounts** : 5
- **Domaines Traefik** : twenty.app.veridian.site
- **appName interne Dokploy** : `compose-parse-optical-array-lvh5md`

### `saas-staging` (SaaS Veridian / staging)

- **Compose ID** : `0f3uUHxT5kUdJuZWdApm0`
- **Status Dokploy** : done
- **Source type** : `raw`
- **Raw YAML inline dans Dokploy** (17422 chars)
- **Services detectes** : `supabase-db`, `kong`, `auth`, `rest`, `realtime`, `storage`, `meta`, `studio`, `web-dashboard`, `prospection-db`, `prospection`, `twenty-postgres`, `twenty-redis`, `twenty-server`, `twenty-worker`, `notifuse-postgres`, `notifuse`, `staging-supabase-db`, `staging-supabase-storage`, `staging-prospection-db`, `staging-twenty-db`, `staging-twenty-redis`, `staging-twenty-storage`, `staging-notifuse-db`, `staging-notifuse-data`, `dokploy-network`, `supabase-internal`
- **Env vars** : 32 (gerees dans Dokploy UI)
- **Build custom** : NON (images upstream)
- **Image GHCR** : OUI (pattern raw+GHCR)
- **Volumes/bind mounts** : 10
- **Domaines Traefik** : (aucun)
- **appName interne Dokploy** : `compose-bypass-bluetooth-feed-tbayqr`


## Notes d'interpretation

- Colonne **Build** : `yes` si le compose contient `build:` (build Docker local) — **aucun compose** n'a ca en prod, tous utilisent des images pre-buildees
- Colonne **GHCR** : `yes` si le compose reference une image `ghcr.io/christ-roy/...` → signal fort du pattern raw+GHCR
- Colonne **Services** : services parses dans le YAML (best-effort regex, peut inclure les volumes/networks du dump brut)
- Colonne **EnvVars** : lignes `KEY=value` dans le champ `env` Dokploy (pas le bloc `environment:` du YAML)
- Colonne **Volumes** : occurrences de bind mounts `:/chemin` dans le YAML

## Composes non audites (environnement prod-clone)

L'environnement `prod-clone` du projet SaaS Veridian contient 6 composes
(`supabase-clone`, `notifuse-clone`, `twenty-clone`, `prospection-saas-clone`,
`prod-clone-unified`, `dashboard-clone`) qui servent de pre-production CI-like
avec volumes prod-like pour tester les migrations avant deploy reel. Ils ne
sont pas audites en detail dans ce document mais seront traites en Phase 7 du
plan de migration (memes regles que la prod).
