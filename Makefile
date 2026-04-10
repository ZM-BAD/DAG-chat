.DEFAULT_GOAL := help

.PHONY: help install dev dev-frontend dev-backend \
        docker docker-build docker-stop \
        test lint format build clean

help: ## Show all available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Dependencies ──────────────────────────────────────────────

install: ## Install all dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install --legacy-peer-deps

# ── Local Development ─────────────────────────────────────────

dev: ## Start frontend + backend locally
	./start.sh --all

dev-frontend: ## Start frontend only
	./start.sh --frontend

dev-backend: ## Start backend only
	./start.sh --backend

stop: ## Stop all local services
	./start.sh --stop

# ── Docker ────────────────────────────────────────────────────

docker: ## Start all services with Docker Compose
	docker compose up --build

docker-build: ## Build Docker images
	docker compose build

docker-stop: ## Stop Docker Compose services
	docker compose down

docker-clean: ## Stop and remove Docker volumes (⚠ deletes all data)
	@echo "WARNING: This will delete all database data!"
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v

# ── Quality ───────────────────────────────────────────────────

test: ## Run backend tests
	cd backend && python -m pytest tests/ -v

lint: ## Run all linters
	cd backend && ruff check .
	cd frontend && npm run lint

format: ## Run all formatters
	cd backend && ruff format .
	cd frontend && npm run format

# ── Build ─────────────────────────────────────────────────────

build: ## Build frontend for production
	cd frontend && npm run build

# ── Cleanup ───────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist
