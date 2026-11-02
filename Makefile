.PHONY: up down logs dev-api dev-web test lint

up:            ## Run the whole stack in Docker → http://localhost:8080
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api worker simulator

dev-api:       ## Backend without Docker: SQLite, in-memory bus, embedded simulator
	cd backend && DATABASE_URL=sqlite+aiosqlite:///./vigil.db EVENT_BUS=memory SCORING_MODE=inline \
		EMBEDDED_SIMULATOR=true uv run uvicorn app.main:app --reload --port 8000

dev-web:       ## Vite dev server → http://localhost:5173
	cd frontend && npm run dev

test:
	cd backend && uv run pytest
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run typecheck
