.PHONY: help dev prod down deploy-preprod

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start dev environment (HTTP + Mailpit)"
	@echo "  make dev-logs      - Show dev logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod          - Start prod environment (HTTPS + Let's Encrypt)"
	@echo "  make prod-logs     - Show prod logs"
	@echo ""
	@echo "Common:"
	@echo "  make down          - Stop all services"
	@echo ""
	@echo "Pre-Production:"
	@echo "  make deploy-preprod - Deploy to GCP pre-prod VM"

# Development
dev:
	doppler run --project app-veridian --config dev -- \
		docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

dev-logs:
	doppler run --project app-veridian --config dev -- \
		docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Production
prod:
	doppler run --project app-veridian --config prd -- \
		docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-logs:
	doppler run --project app-veridian --config prd -- \
		docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Common
down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Pre-Production
deploy-preprod:
	bash pre-prod/deploy.sh
