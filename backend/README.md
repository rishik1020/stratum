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
- Upgrade off SQLModel 0.0.8, which pins the app to Pydantic v1
- Self-host an Overpass instance (or switch to a paid provider) if speed-limit
  coverage matters at scale — see "Speed limits" below

## Speed limits

The Safety score judges speeding against real road limits from OpenStreetMap
(`app/speed_limits.py`), not the flat 120 km/h placeholder it used to use — that
placeholder meant a drive through a 30 km/h street never registered as speeding
at all.

How it works:

- **Tiles, cached.** Roads are fetched per ~3 km tile from Overpass and cached
  in the `roadtile` table for 30 days. Repeat drives down the same roads cost
  nothing, and everyone in a race after the first is a pure cache hit.
- **Warmed during the drive.** Each telemetry sample queues a background fetch
  for its tile (`warm_tile`). By the time the drive ends, scoring reads locally.
  This matters more than it sounds: the public Overpass servers were measured
  answering one identical query in 1.6s and, twenty minutes later, 35s.
- **Untagged roads fall back to their `highway=` class.** Only ~5% of ways in
  Hyderabad carry a `maxspeed` tag, so most limits come from the class table.
- **It declines rather than guesses.** If under 60% of a drive's points land on
  a known road, the whole lookup returns nothing and the drive is scored with no
  speeding penalty at all. A missing penalty is a much smaller error than one
  invented from a road the driver was never on.
- **It never blocks a drive.** Overpass being slow, throttling, or down costs a
  bounded wait once, then a 5-minute backoff.

`analytics.py` stays pure — it receives limits as a plain list and does no I/O.
