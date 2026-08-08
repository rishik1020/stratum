# Stratum

"Strava for Cars" — a real-time multiplayer sprint-driving app. FastAPI + SQLite
backend, React + Vite frontend, live telemetry over WebSocket, drive scoring,
and session replay.

```
backend/            FastAPI app, SQLite, analytics/scoring engine
stratum-web-react/  React + Vite + Tailwind frontend
docs/               Architecture & design
```

## One-time setup

Requires **Python 3.10+** and **Node 18+**.

```bat
cd backend && python -m pip install -r requirements.txt
cd ..\stratum-web-react && npm install
```

## Run it (Windows — just double-click)

| Script | What it does |
|---|---|
| **`run-all.cmd`** | Starts backend **and** frontend, each in its own window. Start here. |
| `run-backend.cmd` | Backend only — http://127.0.0.1:8000 |
| `run-frontend.cmd` | Frontend only — http://127.0.0.1:5173 |
| `run-tunnel.cmd` | HTTPS tunnel for phone testing (run the frontend first) |

Then open **http://127.0.0.1:5173**. Stop a server with `Ctrl+C` in its window
(or just close the window).

### Or run the commands manually

```bat
REM Backend  (http://127.0.0.1:8000, docs at /docs)
cd backend
python -m uvicorn app.main:app --reload --port 8000

REM Frontend (http://127.0.0.1:5173)
cd stratum-web-react
npm run dev -- --port 5173
```

The frontend talks to same-origin `/api`, which Vite proxies to the backend
(HTTP **and** the telemetry WebSocket) — so there's nothing else to configure.

## Checking the backend

- **Interactive API docs (Swagger):** http://127.0.0.1:8000/docs — click any
  endpoint → "Try it out" to call it from the browser.
- **OpenAPI JSON:** http://127.0.0.1:8000/openapi.json
- **Run the analytics tests:** `cd backend && python tests/test_analytics.py`

## Testing on a phone (real GPS + G-force)

Browsers only expose GPS and motion sensors over **HTTPS**, so `localhost` won't
cut it on a phone. Use the tunnel:

1. Start the app (`run-all.cmd`).
2. Run `run-tunnel.cmd` — it prints a `https://xxxxx.trycloudflare.com` URL.
3. Open that URL on your phone, allow location, tap "enable G-force".

The tunnel URL is **public** while it runs (it exposes your dev backend), so
close it (`Ctrl+C`) when you're done.

## Configuration

| Env var | Where | Purpose |
|---|---|---|
| `STRATUM_SECRET_KEY` | backend | JWT signing key — **set a strong value in production** |
| `STRATUM_ALLOWED_ORIGINS` | backend | Comma-separated CORS origins for non-local frontends |
| `VITE_API_BASE_URL` | frontend | Point at an absolute backend instead of the `/api` proxy |

The DB is a local file (`backend/app.db`) created/migrated automatically on
startup. Delete it to start fresh.
