#!/usr/bin/env bash
# Rebuild + deploy du site demo-cms sur CF Pages
# Usage : ./redeploy.sh
set -euo pipefail
cd "$(dirname "$0")"
echo "→ Build (fetch Payload + export static)..."
npm run build
echo "→ Deploy Cloudflare Pages..."
npx wrangler pages deploy out --project-name=demo-cms-veridian --branch=main --commit-dirty=true
echo "✅ https://demo-cms.veridian.site"
