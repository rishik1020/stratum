# Stratum Backend MVP

This backend is built with FastAPI and SQLite for the first web MVP of Stratum.

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

The server logs a warning on startup when this is unset.

## Run locally

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Notes

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

- Add persistent session state in Redis
- Add invite link and lobby participant queries
- Add frontend integration for live telemetry
