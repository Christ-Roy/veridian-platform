# Prochaine Session — Setup Dev Local Hot-Reload

> Date: 2026-03-31 | Objectif: environnement de dev rapide pour polish UI
> Lire ce fichier en premier avant de commencer le travail front-end.

## Contexte

Le backend est complet (76/79 items, 96%). Il reste du polish UI a faire.
On a besoin d'un env de dev avec **hot-reload** pour iterer vite sur l'UI.

## Strategie: Dev server distant avec rsync

Le PC local (mail, 8Go RAM) est limite pour faire tourner Postgres + Next.js dev.
Le dev server (37.187.199.185, 7.6Go RAM) a deja tout en place.

**Approche: rsync local → dev server + next dev en hot-reload sur le serveur.**

```
Local (KDE)                      Dev Server (37.187.199.185)
┌─────────────┐    rsync -az    ┌──────────────────────────┐
│ Code source │ ──────────────→ │ ~/prospection-dev/       │
│ (edit local)│    on save      │ next dev (port 3001)     │
│             │                 │ ↕ Postgres (5432)        │
│ Browser     │ ←───────────── │ Hot-reload via SSH tunnel │
│ localhost:  │    SSH tunnel   │                          │
│ 3001        │                 │ 438K leads en DB         │
└─────────────┘                 └──────────────────────────┘
```

**Avantages:**
- Hot-reload Next.js (pas de npm run build a chaque changement)
- DB staging avec 438K vrais leads (pas 50 leads de test)
- Pas de Postgres local a gerer
- Le code reste editable en local avec ton editeur habituel

## Setup pas a pas

### 1. Preparer le dev server

```bash
# SSH sur le dev server
ssh dev-pub

# Creer le dossier de dev (separe du staging Docker)
mkdir -p ~/prospection-dev
cd ~/prospection-dev

# Cloner le repo
git clone https://github.com/Christ-Roy/prospection.git .
cd dashboard
npm ci

# Creer le .env.local pointe vers la DB staging
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://postgres:prospection-staging-2026@localhost:5432/prospection?connection_limit=5

# Pas de Supabase (mode outil interne = pas d'auth, pas de tenant)
# Decommente pour tester avec auth:
# SUPABASE_URL=http://localhost:8000
# NEXT_PUBLIC_SUPABASE_URL=https://saas-api.staging.veridian.site
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...LJrB1f
# SUPABASE_SERVICE_ROLE_KEY=eyJhbG...hfFE-D

APP_URL=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
TENANT_API_SECRET=dev-secret

# Plan limits (optionnel, defaults OK)
# PLAN_LIMIT_FREEMIUM=300
# PLAN_LIMIT_PRO=100000
EOF

# Lancer Prisma generate
npx prisma generate
```

### 2. Connecter le dev server a la DB staging

```bash
# La DB staging tourne dans Docker, pas accessible directement depuis l'hote
# Option A: port forward depuis le container
ssh dev-pub "docker exec compose-bypass-bluetooth-feed-tbayqr-prospection-db-1 echo 'DB accessible'"

# Option B: ajouter un port expose au compose (deja fait si on ajoute au compose)
# Pour l'instant, on peut utiliser docker network pour acceder directement
# Le dev server est deja sur le meme reseau Docker

# Trouver l'IP du container DB
ssh dev-pub "docker inspect compose-bypass-bluetooth-feed-tbayqr-prospection-db-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"
# → utiliser cette IP dans DATABASE_URL au lieu de localhost
```

### 3. Script rsync automatique (local)

```bash
#!/bin/bash
# scripts/dev-sync.sh — a lancer en local
# Sync le code local vers le dev server a chaque modification

LOCAL_DIR="$HOME/Bureau/veridian-platform/prospection/dashboard/"
REMOTE_DIR="ubuntu@37.187.199.185:~/prospection-dev/dashboard/"
SSH_KEY="$HOME/.ssh/id_rsa_ovh"

# Sync initial
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env.local' \
  --exclude 'prisma/migrations' \
  -e "ssh -i $SSH_KEY" \
  "$LOCAL_DIR" "$REMOTE_DIR"

echo "Initial sync done. Watching for changes..."

# Watch for changes (necessite inotifywait: sudo apt install inotify-tools)
while inotifywait -r -e modify,create,delete --exclude 'node_modules|\.next|\.git' "$LOCAL_DIR"; do
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env.local' \
    --exclude 'prisma/migrations' \
    -e "ssh -i $SSH_KEY" \
    "$LOCAL_DIR" "$REMOTE_DIR"
  echo "$(date +%H:%M:%S) Synced"
done
```

### 4. Lancer le dev server (sur le serveur distant)

```bash
# Terminal 1 (sur le dev server via SSH)
ssh dev-pub
cd ~/prospection-dev/dashboard
npm run dev -- -p 3001
# → Next.js dev server avec hot-reload sur port 3001
```

### 5. Tunnel SSH (local)

```bash
# Terminal 2 (local)
ssh -L 3001:localhost:3001 dev-pub -N
# → http://localhost:3001 dans ton browser = hot-reload
```

### 6. Workflow quotidien

```bash
# Terminal 1: sync auto
./scripts/dev-sync.sh

# Terminal 2: tunnel SSH
ssh -L 3001:localhost:3001 dev-pub -N

# Terminal 3 (optionnel): logs du dev server
ssh dev-pub "cd ~/prospection-dev/dashboard && npm run dev -- -p 3001"

# Edite le code localement → rsync auto → hot-reload dans le browser
```

## Alternative: Dev 100% local

Si tu preferes tout en local (plus simple mais 50 leads de test au lieu de 438K) :

```bash
cd ~/Bureau/veridian-platform/prospection/dashboard

# Lancer Postgres local
docker compose -f ../docker-compose.dev.yml up -d

# Seeder les donnees de test
../scripts/seed-dev.sh

# Copier l'env
cp .env.local.example .env.local

# Dev avec hot-reload
npm run dev
# → http://localhost:3000
```

## Fichiers cles pour le polish UI

```
dashboard/src/
├── app/
│   ├── (pages)/           ← Pages principales
│   │   ├── prospects/     ← Liste prospects (table, filtres)
│   │   ├── pipeline/      ← Kanban pipeline
│   │   ├── segments/      ← Navigation par segment
│   │   ├── historique/    ← Historique des visites
│   │   ├── settings/      ← Config utilisateur
│   │   └── guide/         ← Guide utilisation
│   ├── layout.tsx         ← Layout principal (sidebar, header)
│   └── globals.css        ← Styles globaux Tailwind
├── components/
│   ├── ui/                ← Composants shadcn/ui
│   ├── LeadTable.tsx      ← Table des prospects
│   ├── LeadDetail.tsx     ← Detail d'un prospect
│   ├── Pipeline.tsx       ← Kanban board
│   ├── Sidebar.tsx        ← Navigation laterale
│   └── ...
└── lib/
    ├── types.ts           ← Types TypeScript
    └── utils.ts           ← Utilitaires (formatCA, formatEffectifs...)
```

## Stack UI

| Lib | Usage |
|-----|-------|
| Tailwind CSS 4 | Styling |
| shadcn/ui (Radix) | Composants UI |
| @tanstack/react-table | Tables |
| recharts | Graphiques |
| lucide-react | Icones |
| cmdk | Palette de commandes |
| nuqs | URL search params state |
| sonner | Toast notifications |
| react-hook-form + zod | Formulaires |

---

## TODO — Setup env dev

- [ ] Installer inotify-tools localement (`sudo apt install inotify-tools`)
- [ ] Creer `scripts/dev-sync.sh` et le rendre executable
- [ ] Cloner le repo sur le dev server dans `~/prospection-dev/`
- [ ] `npm ci` sur le dev server
- [ ] Configurer `.env.local` avec l'IP de la DB Docker
- [ ] Exposer le port 5432 de prospection-db sur le dev server (ou utiliser l'IP container)
- [ ] Tester `npm run dev -- -p 3001` sur le dev server
- [ ] Tester le tunnel SSH `ssh -L 3001:localhost:3001 dev-pub -N`
- [ ] Verifier hot-reload: modifier un composant → voir le changement dans le browser
- [ ] (Optionnel) Configurer Supabase auth dans .env.local pour tester le flow complet
