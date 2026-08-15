# Stratum Backend

FastAPI + SQLModel. SQLite locally, Postgres in the cloud (`DATABASE_URL`).
See the [root README](../README.md) for the module layout.

## Install dependencies

```bash
cd backend
python -m pip install -r requirements.txt
```

## Configuration

Set a strong signing secret before running anywhere other than local dev — JWTs
are signed with it, and the default is an insecure development key:

```bash
export STRATUM_SECRET_KEY="$(openssl rand -hex 32)"   # PowerShell: $env:STRATUM_SECRET_KEY = "..."
```

Against local SQLite this only logs a warning if unset. Against a real
database (`DATABASE_URL` set to Postgres) the app refuses to start without it
— see `app/auth.py`.

`/auth/login` (5/minute) and `/auth/signup` (10/hour) are rate-limited per IP
via `slowapi` — see `app/rate_limit.py`.

The server logs a warning on startup when this is unset.

## Run locally

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The database is created and migrated automatically on startup.

## Tests

```bash
python run_tests.py
```

## API Notes

Full interactive reference at `/docs` once running. The reads below are scoped
to participants — a valid token isn't enough, you have to have been in the
session (see `app/deps.py`).

- `POST /auth/signup` to create a user
- `POST /auth/login` to get a JWT token
- `GET /users/me` to fetch user profile
- `POST /vehicles` to add a vehicle
- `POST /sessions` to create a private sprint session
- `POST /sessions/join` to join by room code
- `POST /sessions/{session_id}/start` to start a session
- `POST /sessions/{session_id}/end` to end a session
- WebSocket: `/ws/sessions/{session_id}?token=...`

## Racing across multiple devices (live telemetry)

To collect telemetry from other phones/devices (not just the host machine):

1. **Make the API reachable.** Bind to all interfaces and find the host's LAN IP:
   `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Other devices then reach it
   at `http://<host-lan-ip>:8000`.
2. **Point the frontend at it.** Set `VITE_API_BASE_URL` (in `stratum-web-react/.env`)
   to that URL and run Vite with `--host` so phones can load the UI.
3. **Allow the new origin.** Set `STRATUM_ALLOWED_ORIGINS` to the exact frontend
   origin(s) the phones use (comma-separated).
4. **Serve over HTTPS.** Browsers only expose GPS (`navigator.geolocation`) in a
   *secure context* — HTTPS or `localhost`. A plain `http://<lan-ip>` page cannot
   read location. Use `mkcert` for LAN TLS, or a tunnel (ngrok / Cloudflare Tunnel)
   which gives HTTPS + WSS automatically. WebSockets must be `wss://` under HTTPS.
5. **Use real GPS devices, moving.** `coords.speed` is often `null` on desktops and
   when stationary; accurate speed/heading needs a phone with high-accuracy GPS.

Note: the in-memory WebSocket manager and SQLite are single-process. For many
concurrent racers across multiple API nodes, move live state to Redis pub/sub and
the database to Postgres (see `docs/ANALYTICS_ARCHITECTURE.md`).

## Next steps

- Move WebSocket rooms to Redis pub/sub so the API can run more than one
  instance (the current room manager is in-memory, so it can't)
- Map-match real road speed limits — the Safety score currently penalises
  against a flat 120 km/h placeholder (`analytics.DEFAULT_SPEED_LIMIT_KMH`),
  which never triggers in town
- Upgrade off SQLModel 0.0.8, which pins the app to Pydantic v1
