#!/bin/bash
# Generate .env.prod.example from .env.prod with randomized internal secrets
set -e

ENV_PROD=".env.dev.example"
ENV_EXAMPLE=".env"

echo "🔄 Génération de $ENV_EXAMPLE depuis $ENV_PROD"

# Générer secrets
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
SECRET_KEY_BASE=$(openssl rand -base64 32 | tr -d '\n')
PG_META_CRYPTO_KEY=$(openssl rand -base64 32 | tr -d '\n')
VAULT_ENC_KEY=$(openssl rand -base64 32 | tr -d '\n')
NOTIFUSE_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n')
TWENTY_APP_SECRET=$(openssl rand -base64 32 | tr -d '\n')
DASHBOARD_PASSWORD=$(openssl rand -hex 16)
LOGFLARE_PUBLIC=$(openssl rand -base64 32 | tr -d '\n')
LOGFLARE_PRIVATE=$(openssl rand -base64 32 | tr -d '\n')

# Générer JWT tokens Supabase
HEADER='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
ANON_PAYLOAD='eyJpc3MiOiJzdXBhYmFzZS1leGFtcGxlIiwicmVmIjoiZXhhbXBsZSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzM1MzAwMDAwLCJleHAiOjIwNTA4NzY4MDB9'
SERVICE_PAYLOAD='eyJpc3MiOiJzdXBhYmFzZS1leGFtcGxlIiwicmVmIjoiZXhhbXBsZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MzUzMDAwMDAsImV4cCI6MjA1MDg3NjgwMH0'
ANON_SIG=$(openssl rand -hex 32)
SERVICE_SIG=$(openssl rand -hex 32)
ANON_KEY="${HEADER}.${ANON_PAYLOAD}.${ANON_SIG}"
SERVICE_ROLE_KEY="${HEADER}.${SERVICE_PAYLOAD}.${SERVICE_SIG}"

# Copier et remplacer avec perl (plus robuste que sed)
cp "$ENV_PROD" "$ENV_EXAMPLE"

perl -pi -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_EXAMPLE"
perl -pi -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_EXAMPLE"
perl -pi -e "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$SECRET_KEY_BASE|" "$ENV_EXAMPLE"
perl -pi -e "s|^PG_META_CRYPTO_KEY=.*|PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY|" "$ENV_EXAMPLE"
perl -pi -e "s|^VAULT_ENC_KEY=.*|VAULT_ENC_KEY=$VAULT_ENC_KEY|" "$ENV_EXAMPLE"
perl -pi -e "s|^NOTIFUSE_SECRET_KEY=.*|NOTIFUSE_SECRET_KEY=$NOTIFUSE_SECRET_KEY|" "$ENV_EXAMPLE"
perl -pi -e "s|^TWENTY_APP_SECRET=.*|TWENTY_APP_SECRET=$TWENTY_APP_SECRET|" "$ENV_EXAMPLE"
perl -pi -e "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD|" "$ENV_EXAMPLE"
perl -pi -e "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" "$ENV_EXAMPLE"
perl -pi -e "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" "$ENV_EXAMPLE"
perl -pi -e "s|^LOGFLARE_PUBLIC_ACCESS_TOKEN=.*|LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC|" "$ENV_EXAMPLE"
perl -pi -e "s|^LOGFLARE_PRIVATE_ACCESS_TOKEN=.*|LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_PRIVATE|" "$ENV_EXAMPLE"

echo "✅ $ENV_EXAMPLE généré avec succès !"
echo ""
echo "✅ Secrets randomisés :"
echo "   - POSTGRES_PASSWORD, JWT_SECRET, SECRET_KEY_BASE"
echo "   - PG_META_CRYPTO_KEY, VAULT_ENC_KEY"
echo "   - NOTIFUSE_SECRET_KEY, TWENTY_APP_SECRET"
echo "   - DASHBOARD_PASSWORD"
echo "   - ANON_KEY, SERVICE_ROLE_KEY (JWT tokens)"
echo "   - LOGFLARE tokens"
echo ""
echo "✅ Conservés (clés API externes) :"
echo "   - Cloudflare, SMTP, Stripe, OpenAI"
