# MealMatch – Bitcamp 2026

A real-time website that helps restaurants share surplus food with nearby communities, reducing food waste and improving food access.

---

## 🌍 Overview

MealMatch is a full-stack web platform that connects:

* 🍽 Restaurants with surplus food
* 🤝 Community partners (shelters, pantries)
* 📍 Individuals looking for same-day meals

Restaurants can post available food near closing time, and users can claim it through a structured, real-time system with controlled pickup slots and smart prioritization.

This project focuses on **speed, fairness, and real-world usability**.

---

## 🚨 Problem

* Restaurants throw away large amounts of edible food daily
* Many people struggle to access meals
* Existing solutions are:

  * Not real-time
  * Hard to coordinate
  * Not accessible to everyone

---

## 💡 Solution

MealMatch is a **real-time website** where:

* Restaurants post surplus food listings
* Users browse nearby available food
* Pickup is scheduled through time slots
* Listings update instantly as food is claimed

The system prioritizes urgency, proximity, and fairness to maximize successful redistribution.

---

## ⚡ Core Features

### 🍽 Food Listings

* Post surplus food (type, quantity, dietary tags)
* Set pickup windows
* Auto-expiration system

### 📍 Real-Time Feed

* View nearby available food
* Filter by dietary preferences
* See countdown timers

### ⏱ Pickup Slots

* 10–15 minute time windows
* Limited capacity per slot
* Prevents overcrowding

### 🔔 Smart Notifications

* Location-based alerts
* Preference-based filtering

### 🧠 Expiration-Aware Prioritization

* Listings closer to expiration are prioritized
* Nearby users are notified first
* Unclaimed food is escalated to shelters/pantries

👉 This ensures food is distributed before it goes to waste

---

## 🏗 Tech Stack

### Frontend

* React + Vite
* ESLint for code quality

### Backend

* Python + FastAPI
* Uvicorn server
* Pipenv for dependency management

### Database

* PostgreSQL (core data)
* Redis (caching + real-time updates)

### DevOps / Tooling

* Makefile for automation
* GitHub Actions CI

---

## 📦 Prerequisites

* Node.js 20+
* npm 10+
* Python 3.13
* Pipenv (`pip install pipenv`)

---

## 🚀 Quick Start

1. Clone the repository and navigate into it

2. Create environment files:

```
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Install dependencies:

```
make setup
```

4. Run services in separate terminals:

Backend:

```
make dev-backend
```

Frontend:

```
make dev-frontend
```

---

## 🌐 Local Development

* Frontend: http://localhost:5173
* Backend API: http://127.0.0.1:8000
* API Docs (Swagger): http://127.0.0.1:8000/docs

---

## 🔌 API Endpoints

### Health Check

```
GET /health
→ {"status": "ok"}
```

### Example Routes

```
GET /api/v1/hello
→ {"message": "Hello from FastAPI"}

POST /api/v1/echo
Body: {"text":"hello"}
→ {"echoed_text":"hello","length":5}
```

---

## 🧠 Future / Advanced Features

* Smart matching (fairness + priority system)
* AI demand prediction
* No-show prediction
* Route optimization for partners
* SMS-based access for non-smartphone users
* Impact dashboard (meals saved, CO₂ reduced)

---

## 🗂 Repository Structure

```
backend/
  main.py
  feature1/
  feature2/

frontend/
  src/
```

---

## ⚙️ Common Commands

* `make help` — list available commands
* `make setup` — install dependencies
* `make dev-backend` — run FastAPI server
* `make dev-frontend` — run React app
* `make lint` — run frontend lint
* `make build` — build frontend
* `make smoke` — backend compile check

---

## ⚡ Development Workflow

* Keep frontend/backend contracts aligned
* Use small PRs and merge frequently
* Run before pushing:

```
make lint && make smoke
```

* Ensure CI passes on every PR

---

## 🎯 Hackathon Focus

This project is designed to demonstrate:

* Real-time systems design
* Scalable food redistribution
* Practical social impact
* Clean full-stack architecture

---

## 🧾 One-Line Pitch

MealMatch is a real-time website that redistributes surplus restaurant food to nearby communities through smart prioritization, structured pickups, and live availability.

---
