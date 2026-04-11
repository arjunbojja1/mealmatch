SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup setup-backend setup-frontend dev dev-backend dev-frontend lint build smoke

help:
	@echo "Available commands:"
	@echo "  make setup         # Install backend and frontend dependencies"
	@echo "  make dev-backend   # Run FastAPI backend (http://127.0.0.1:8000)"
	@echo "  make dev-frontend  # Run frontend dev server"
	@echo "  make lint          # Run frontend lint"
	@echo "  make build         # Build frontend for production"
	@echo "  make smoke         # Run basic backend compile check"

setup: setup-backend setup-frontend

setup-backend:
    pip install pipenv
	pipenv install --dev

setup-frontend:
	npm ci --prefix frontend

dev:
	@echo "Run backend and frontend in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend:
	pipenv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	npm run dev --prefix frontend

lint:
	npm run lint --prefix frontend

build:
	npm run build --prefix frontend

smoke:
	pipenv run python -m compileall backend
