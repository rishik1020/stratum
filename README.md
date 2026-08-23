# Stratum

"Strava for Cars" — a real-time multiplayer sprint-driving app. FastAPI + SQLite
backend, React + Vite frontend, live telemetry over WebSocket, drive scoring,
and session replay. Also ships as a native Android app via Capacitor.

```
backend/            FastAPI app, migrations, analytics/scoring engine
stratum-web-react/  React + Vite + Tailwind frontend (+ android/, ios/ shells)
docs/               Architecture, deploy, native build
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
| `run-frontend.cmd` | Frontend only — http://127.0.0.1:3000 |
| **`run-phone.cmd`** | Backend + frontend over **HTTPS**, for testing on a phone on your Wi-Fi |
| `run-tunnel.cmd` | HTTPS tunnel to the **frontend** — reaches a phone anywhere, not just your Wi-Fi |
| `run-tunnel-backend.cmd` | HTTPS tunnel to the **backend**, for the installed APK |
| `db-snapshot.cmd` | Print a quick summary of the local database |

Then open **http://127.0.0.1:3000**. Stop a server with `Ctrl+C` in its window
(or just close the window).

> The two tunnel scripts are for different jobs — use one or the other, not
> both. See [docs/NATIVE_APK.md](docs/NATIVE_APK.md).

### Or run the commands manually

```bat
REM Backend  (http://127.0.0.1:8000, docs at /docs)
cd backend
python -m uvicorn app.main:app --reload --port 8000

REM Frontend (http://127.0.0.1:3000)
cd stratum-web-react
npm run dev
```

The frontend talks to same-origin `/api`, which Vite proxies to the backend
(HTTP **and** the telemetry WebSocket) — so there's nothing else to configure.

## Tests

```bat
cd backend && python run_tests.py
```

No pytest needed. (`pip install -r requirements-dev.txt` if you'd rather use it.)

```bat
cd stratum-web-react && npm run lint
```

## How it fits together

**Backend** (`backend/app/`)

| | |
|---|---|
| `main.py` | App assembly — CORS, lifespan, router registration. Nothing else. |
| `routers/` | One module per resource: auth, users, vehicles, sessions, telemetry. |
| `services.py` | Domain rules — score rollup at session end, room codes, abandoned-drive sweep. |
| `deps.py` | Authorization. Who is allowed to read which session. |
| `analytics.py` | Pure scoring engine over a telemetry stream. No DB, no I/O. |
| `models.py` / `schemas.py` | SQLModel tables / Pydantic request-response shapes. |
| `migrations/` | Alembic. Runs automatically on startup. |

**Frontend** (`stratum-web-react/src/`)

| | |
|---|---|
| `App.tsx` | Routes, auth guards, lazy-loaded screens. |
| `routes.ts` | Every path in one place. |
| `screens/` | One per route. |
| `components/` | Shared UI — live map, HUD, standings, charts. |
| `lib/` | `useUnits`, `useRouteSession`, `useSessionSocket`, formatters, chart theme. |
| `store.ts` | Zustand: token, user, vehicles, current session, unit preference. |

Session screens take their identity from the URL (`/sessions/:id/replay`), so
links are shareable and a refresh keeps you where you were.

## Checking the backend

- **Interactive API docs (Swagger):** http://127.0.0.1:8000/docs
- **OpenAPI JSON:** http://127.0.0.1:8000/openapi.json
- **Database summary:** `db-snapshot.cmd`

## Testing on a phone (real GPS + G-force)

Browsers only expose GPS and motion sensors over **HTTPS**, so `localhost` won't
cut it on a phone. Use the tunnel:

1. Start the app (`run-all.cmd`).
2. Run `run-tunnel.cmd` — it prints a `https://xxxxx.trycloudflare.com` URL.
3. Open that URL on your phone, allow location, tap "enable G-force".

The tunnel URL is **public** while it runs (it exposes your dev backend), so
close it (`Ctrl+C`) when you're done.

For the native app instead of the browser, see
[docs/NATIVE_APK.md](docs/NATIVE_APK.md).

## Configuration

| Env var | Where | Purpose |
|---|---|---|
| `STRATUM_SECRET_KEY` | backend | JWT signing key — **set a strong value in production** |
| `STRATUM_ALLOWED_ORIGINS` | backend | Comma-separated CORS origins for non-local frontends |
| `DATABASE_URL` | backend | Postgres in the cloud; falls back to local SQLite |
| `VITE_API_BASE_URL` | frontend | Absolute backend URL, baked in at build time (APK / prod web) |

The database is created and migrated automatically on startup — locally that's
`backend/app.db`. Delete it to start fresh.

## Deploying

See [docs/DEPLOY.md](docs/DEPLOY.md).
