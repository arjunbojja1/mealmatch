# bitcamp-2026

Hackathon monorepo with a React frontend and a FastAPI backend.

## Tech Stack

- Frontend: React + Vite + ESLint
- Backend: FastAPI + Uvicorn (Pipenv-managed)
- Automation: Makefile + GitHub Actions CI

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.13
- Pipenv (`pip install pipenv`)

## Quick Start

1. Clone and enter the repository.
2. Create local environment files:
	- `cp .env.example .env`
	- `cp backend/.env.example backend/.env`
	- `cp frontend/.env.example frontend/.env`
3. Install dependencies:
	- `make setup`
4. Run services in separate terminals:
	- Backend: `make dev-backend`
	- Frontend: `make dev-frontend`

Frontend is served by default at `http://localhost:5173`.
Backend API is served by default at `http://127.0.0.1:8000`.
Interactive API docs are available at `http://127.0.0.1:8000/docs`.

## API Endpoints

- `GET /health` → `{"status":"ok"}`
- `GET /api/v1/hello` → `{"message":"Hello from FastAPI"}`
- `POST /api/v1/echo` with body `{"text":"hello"}` → `{"echoed_text":"hello","length":5}`

Example requests:

- `curl http://127.0.0.1:8000/health`
- `curl http://127.0.0.1:8000/api/v1/hello`
- `curl -X POST http://127.0.0.1:8000/api/v1/echo -H "Content-Type: application/json" -d '{"text":"hello"}'`

## Common Commands

- `make help` — list available commands
- `make setup` — install all dependencies
- `make lint` — run frontend lint
- `make build` — build frontend for production
- `make smoke` — compile-check backend Python files

## Repository Layout

```text
backend/
	main.py
  feature1/
  feature2/
frontend/
  src/
```

## Team Workflow for Hackathon Speed

- Keep backend/frontend contracts documented in PR descriptions.
- Merge often using small PRs to reduce conflicts.
- Run `make lint && make smoke` before pushing.
- CI must stay green on every PR.