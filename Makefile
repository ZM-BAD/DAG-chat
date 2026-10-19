.DEFAULT_GOAL := help

.PHONY: help install dev dev-frontend dev-backend \
        docker docker-build docker-stop docker-clean \
        test test-frontend lint typecheck format format-check check security precommit build clean

help: ## Show all available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# Dependencies

install: ## Install all dependencies from lockfiles
	uv sync --frozen
	cd frontend && npm ci

# Local Development

dev: ## Start frontend + backend locally
	./start.sh --all

dev-frontend: ## Start frontend only
	./start.sh --frontend

dev-backend: ## Start backend only
	./start.sh --backend

stop: ## Stop all local services
	./start.sh --stop

# Docker

docker: ## Start all services with Docker Compose
	docker compose up --build

docker-build: ## Build Docker images
	docker compose build

docker-stop: ## Stop Docker Compose services
	docker compose down

docker-clean: ## Stop and remove Docker volumes (deletes all data)
	@echo "WARNING: This will delete all database data!"
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v

# Quality

test: ## Run backend tests
	.venv/bin/python -m pytest backend/tests/ -v

test-frontend: ## Run frontend unit tests
	cd frontend && npm test

lint: ## Run backend and frontend linters
	.venv/bin/ruff check backend/
	@set +e; .venv/bin/pylint --fail-under=9 $$(git ls-files '*.py'); status=$$?; \
		if [ $$((status & 35)) -ne 0 ]; then exit $$status; fi
	cd frontend && npm run lint

typecheck: ## Run Python and TypeScript type checks
	.venv/bin/mypy backend
	cd frontend && npx tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit

format: ## Run all formatters
	.venv/bin/ruff format backend/
	cd frontend && npm run format

format-check: ## Check backend and frontend formatting
	.venv/bin/ruff format --check backend/
	cd frontend && npm run format:check

check: lint format-check typecheck test test-frontend ## Run all local quality gates

security: ## Scan secrets and audit Python/frontend dependencies
	.venv/bin/pre-commit run gitleaks --all-files
	.venv/bin/pip-audit --progress-spinner off
	npm audit --registry=https://registry.npmjs.org --audit-level=high
	cd frontend && npm audit --registry=https://registry.npmjs.org --audit-level=high

precommit: ## Run all pre-commit hooks
	.venv/bin/pre-commit run --all-files

# Build

build: ## Build frontend for production
	cd frontend && npm run build

# Cleanup

clean: ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist
