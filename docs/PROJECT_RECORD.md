# Stratum — Project Record & Technical Reference

> A study/record document of everything built so far: what Stratum is, the full
> tech stack, how the backend and frontend work, the live-telemetry and replay
> pipelines, the networking/tunnel setup, the build timeline, and how to run and
> inspect it. Read top-to-bottom or jump via the contents.

## Contents
1. What Stratum is
2. Architecture overview
3. Tech stack (every tool + why)
4. Backend — structure, data model, endpoints
5. The analytics & scoring engine
6. Frontend — structure, screens, components
7. Design system (minimal / premium)
8. The live telemetry pipeline
9. Session replay
10. Networking: same-origin proxy + HTTPS tunnels
11. Running the project
12. Inspecting the backend & data
13. Build timeline (what we did, in order)
14. Known limitations & the path to production / app stores
15. File map

---

## 1. What Stratum is

Stratum is a **"Strava for Cars"** — a real-time, multiplayer **sprint-driving** web
app. Drivers create or join a session ("sprint"), then their phones stream live
GPS + motion telemetry to a shared room. Everyone sees a live map, a Formula-1
style timing tower (gap to leader / interval to the car ahead), and after the
sprint they get a **Driving Score**, coach insights, and a **replay** of the drive.

Core idea (the data philosophy): **one raw ingest, many derived views.** Raw
telemetry is written once to an immutable stream; scores, leaderboards, charts,
and replays are all *recomputable projections* of that stream — raw data is never
destroyed.

---

## 2. Architecture overview

```
   Phone / Browser (React + Vite SPA)            Backend (FastAPI)            Storage
   ┌──────────────────────────┐  HTTP  /api  ┌────────────────────┐
   │ Screens + Zustand store   │ ───────────▶ │ REST endpoints      │ ──▶  SQLite (app.db)
   │ LiveMap (Leaflet)         │  WS   /ws    │ WebSocket manager   │       - users, vehicles
   │ TelemetryHUD / Standings  │ ◀──────────▶│ analytics engine    │       - sessions, participants
   └──────────────────────────┘ (Vite proxy) └────────────────────┘       - telemetry_point (raw stream)
```

- The frontend talks to **same-origin `/api`**, which the Vite dev server proxies
  to FastAPI (HTTP **and** the WebSocket). One origin → a single HTTPS tunnel can
  expose the whole app to a phone with no CORS or mixed-content issues.
- **Two pipelines, different SLAs:** live convoy positions fan out over WebSocket
  in near-real-time; scores/replays are computed on demand from the stored stream.

---

## 3. Tech stack (every tool + why)

### Backend
| Tool | Version | Why |
|---|---|---|
| **FastAPI** | 0.115.2 | Async Python web framework; auto OpenAPI docs |
| **Uvicorn** | 0.24.0 | ASGI server (`--reload` for dev) |
| **SQLModel** | 0.0.8 | ORM + Pydantic models in one (built on SQLAlchemy). NOTE: pulls **Pydantic v1.10** |
| **SQLite** | (stdlib) | Zero-config dev database (`backend/app.db`) |
| **python-jose** | 3.3.0 | JWT encode/decode (HS256) |
| **passlib + bcrypt** | 1.7.4 / 4.0.1 | Password hashing |
| **email-validator** | 2.3.0 | `EmailStr` validation |

### Frontend
| Tool | Version | Why |
|---|---|---|
| **React** | 18.2 | UI |
| **TypeScript** | 5.2 | Type safety |
| **Vite** | 5.x | Dev server + bundler; `/api` proxy |
| **Tailwind CSS** | 3.3 | Utility styling + design tokens |
| **Zustand** | 4.4 | Lightweight global state |
| **Recharts** | 3.8 | Analytics charts |
| **Leaflet** | 1.9.4 | Live map (CARTO dark tiles) |
| **lucide-react** | 0.292 | Icons |
| **axios** | 1.6 | HTTP client |

### Fonts (design system)
- **Instrument Serif** — editorial display headings + wordmark
- **Inter** — UI / body
- **JetBrains Mono** — all numerals / telemetry (tabular)

### Tooling / ops
- **cloudflared** — Cloudflare *quick* tunnel (random URL, no account, no warning page)
- **ngrok** — *stable* tunnel (reserved free domain; one-time browser warning page)
- Windows `.cmd` scripts to run everything; `snapshot.py` to read the DB

---

## 4. Backend — structure, data model, endpoints

```
backend/
  app/
    main.py        # FastAPI app, all routes, WebSocket endpoint, lifespan
    models.py      # SQLModel tables
    schemas.py     # Pydantic request/response models
    auth.py        # JWT + password hashing
    database.py    # engine, table creation, lightweight column migration
    analytics.py   # pure drive-metrics + scoring + coach engine
    ws_manager.py  # in-memory WebSocket room manager
  tests/test_analytics.py
  snapshot.py      # read-only DB snapshot tool
  app.db           # SQLite database (auto-created)
  requirements.txt
```

### Data model (`models.py`)
- **User** — `email`, `username`, `display_name`, `hashed_password`, `active_vehicle_id`,
  plus denormalised lifetime stats: `total_sessions`, `total_distance_m`,
  `total_wins`, `top_speed_kmh`.
- **Vehicle** — make/model/year/horsepower/torque/fuel_type/transmission/weight,
  `is_active`. Belongs to a User.
- **Session** (aliased `SprintSession`) — `host_user_id`, `name`, unique `room_code`
  (`STRAT-####`), `visibility`, `max_players`, `status` (`waiting|live|ended`),
  timestamps.
- **SessionParticipant** — join row linking user + vehicle + session; carries
  `ready`, `final_rank`, and per-race totals.
- **TelemetryPoint** — the **raw immutable stream**: `timestamp`, `latitude`,
  `longitude`, `speed_kmh`, `heading_deg`, `distance_delta_m`,
  `cumulative_distance_m`, `accuracy_m`, and the phone-extras **`altitude_m`** and
  **`g_force`**.

### Auth (`auth.py`)
- Signup/login issue a **JWT (HS256)** signed with `STRATUM_SECRET_KEY`.
- If that env var is unset, a dev fallback key is used **and a warning is logged**
  (must be a strong value in production).
- `get_user_from_token()` resolves a token → User; `get_current_user()` is the
  FastAPI dependency wrapper (the WebSocket handshake uses the former directly).

### Key endpoints (`main.py`)
- `POST /auth/signup`, `POST /auth/login` → `{access_token}`
- `GET/PATCH /users/me`, `GET /users/me/sessions`
- `POST/GET /vehicles`, `POST /vehicles/{id}/activate`, `DELETE /vehicles/{id}`
- `POST /sessions`, `GET /sessions/{id}`, `GET /sessions/room/{code}`
- `POST /sessions/join | /leave | /ready | /start | /end`
- `DELETE /sessions/{id}` — host-only; cascades telemetry → participants → session
- `GET /sessions/{id}/participants | /results | /telemetry | /drive-analytics`
- `WS /ws/sessions/{id}?token=...` — live telemetry in/out

### Notable backend details
- **Lifespan handler** (not the deprecated `@app.on_event`) creates tables on start.
- **CORS** allows any localhost port by default; set `STRATUM_ALLOWED_ORIGINS`
  (comma-separated) for real frontends.
- **Migration:** `database.py` adds new nullable columns (`altitude_m`, `g_force`)
  to an existing `app.db` via `ALTER TABLE` so data isn't wiped.
- **Session end** rolls the raw stream into per-racer results, assigns ranks
  (furthest distance wins), and folds totals into each user's lifetime stats.

---

## 5. The analytics & scoring engine (`analytics.py`)

Pure, deterministic functions over an ordered telemetry stream (no DB, no I/O →
trivially testable). Produces:

- **Metrics** — distance, duration, moving/idle time, avg/max/min speed, stop
  count, day/night ratio, fuel & CO₂ estimate (by fuel type; electric reports none).
- **Event detection** — harsh braking, rapid acceleration, sharp cornering
  (from heading change × speed), speeding ratio (vs a placeholder limit).
- **Driving Score (0–100)** — weighted blend of four sub-scores:
  - Safety (penalises aggressive/illegal/abrupt inputs per km)
  - Eco (rewards smooth throttle, low idle)
  - Comfort (rewards low jerk / consistent speed)
  - Performance (rewards sustained speed + strong-but-smooth acceleration)
  - `overall = 0.35·safety + 0.25·eco + 0.20·comfort + 0.20·performance`
- **Coach insights** — smooth-percentage summary, strengths, weaknesses, and plain
  English recommendations + explanations.

Covered by `tests/test_analytics.py` (7 deterministic tests: smooth vs aggressive
drives, speeding, day/night, electric fuel, insufficient data, idle/stops).

---

## 6. Frontend — structure, screens, components

```
stratum-web-react/src/
  main.tsx           # screen router (state-based, no react-router) + fade transitions
  store.ts           # Zustand store
  api.ts             # axios instance + WS URL (same-origin /api)
  index.css          # Tailwind layers + design-system classes
  vite-env.d.ts      # types for import.meta.env
  data/cars.ts       # vehicle catalog for the garage form
  components/
    Layout.tsx        # responsive shell: sidebar (desktop) / bottom tab bar (mobile)
    LiveMap.tsx       # Leaflet map; eased marker glide; mobile size-recalc
    TelemetryHUD.tsx  # gauge panel (Speed/Altitude/G-force/Heading/Distance/Top) + scrubber
    Standings.tsx     # F1 timing-tower list (gap to leader + interval to car ahead)
    DriveScorePanel.tsx # score ring + sub-bars + coach insights
    VehicleForm.tsx   # add-a-car form (catalog-driven)
  screens/
    AuthScreen, HomeScreen, GarageScreen, AnalyticsScreen, SettingsScreen,
    CreateSessionScreen, JoinSessionScreen, LobbyScreen, LiveScreen,
    ResultsScreen, ReplayScreen
```

### Navigation
`main.tsx` keeps the current screen in React state (no router). Hub screens
(Dashboard / Garage / Analytics / Settings) render inside `Layout`; session and
replay screens render full-screen. A subtle opacity fade plays on each change.

### State (`store.ts`)
Zustand store holds: `token`, `user`, `vehicles`, `activeVehicle`,
`currentSession`, `units` (km/h or mph), `replaySessionId`, and `analyticsFilter`
(`all | wins | podiums`). Token + current session + units persist to
`localStorage`.

### Screen flow
```
Auth → Dashboard → Garage (add + activate a vehicle)
                 ├─ Create Sprint ─┐
                 └─ Join by Code  ─┴─ Lobby → (host) Start → LIVE → (host) End → Results
                 Analytics (charts, Drive Score, filter, replay)
```
- Dashboard stat cards are **tappable** → Analytics (Wins card pre-filters to wins).
- Analytics has an **All / Wins / Podiums** filter, charts, the Drive Score panel,
  per-session delete (host) and replay buttons.

---

## 7. Design system (minimal / premium)

Chosen direction: calm, editorial, restrained — not neon/gamer.

- **Palette** (`tailwind.config.js`): near-black background `#0b0b0c`, elevated
  surfaces `#161618`, a single muted brass accent `#cda349` (`stratum-gold`) and a
  muted steel `#7aa2cc` (`stratum-blue`) for data. White text via opacity.
- **Type:** serif display headings (`.display`), uppercase tracked labels
  (`.eyebrow`), tabular mono numerals (`.stat-num`).
- **Components** (`index.css`): flat glassy `.card`, near-white pill `.btn-primary`,
  subtle `.btn-secondary`, unified `.field` inputs.
- **Mobile:** `overflow-x` guarded, `100dvh` full-screen heights, no tap-highlight
  flash, momentum scroll.

---

## 8. The live telemetry pipeline

```
 Phone: watchPosition (~1 Hz) + DeviceMotion (g-force)
   builds a frame {speed, lat/lng, heading, distance, altitude, g-force}
        │  send "telemetry.update" over WebSocket
        ▼
  FastAPI /ws/sessions/{id}
   1. writes a TelemetryPoint → SQLite (immutable stream)
   2. broadcasts the frame to everyone in the room (in-memory ConnectionManager)
        │
        ▼
  Other phones + you: TelemetryHUD gauges, LiveMap puck/trail, F1 standings update
```

- **Phone-derived metrics today:** Speed & Altitude (GPS), Heading, Distance, Top
  speed, and real **G-force** (DeviceMotion accelerometer; iOS needs a one-time
  permission tap). Engine metrics (RPM/gear/coolant/throttle) are **not** available
  from a phone — they'd need an OBD-II adapter, so the HUD is "OBD-ready" but those
  gauges are omitted for now.
- **Smoothness:** map markers ease toward each new position every frame, so they
  glide rather than snap on the ~1 Hz GPS cadence.
- **Latency reality:** the bottleneck is the **~1 Hz GPS sample rate**, not the
  network. Network+server+render is ~50–300 ms; perceived freshness refreshes about
  once per second. Browsers also throttle GPS when the screen locks.

---

## 9. Session replay (`ReplayScreen.tsx`)

- Fetches a finished session's full stored stream (`GET /sessions/{id}/telemetry`,
  which returns lat/lng/altitude/heading/speed/g-force/distance per racer).
- Plays it back through the **same TelemetryHUD** in `replay` mode with a scrubber,
  play/pause, restart, **1×–8× speed**, a per-racer gauge selector, and live
  standings at the playhead.
- **Interpolates** between the ~1 Hz samples (shortest-path angle lerp for heading)
  so playback is smooth.
- Entry points: "Watch replay" on Results, and a play icon on each ended session in
  Analytics.

---

## 10. Networking: same-origin proxy + HTTPS tunnels

- **Vite proxy** (`vite.config.ts`): a single `/api` entry forwards HTTP **and** the
  WebSocket (`ws: true`) to `http://127.0.0.1:8000`, stripping the `/api` prefix.
  `api.ts` therefore uses same-origin `/api` and derives the WS origin from
  `window.location` (so it inherits `https→wss` over a tunnel). `allowedHosts: true`
  lets tunnel hostnames through.
- **Why a tunnel at all:** a phone isn't `localhost`, and browsers only expose GPS
  + motion sensors over **HTTPS**. A tunnel gives a public HTTPS URL the phone can
  reach. Because everything is same-origin behind the proxy, **one** tunnel covers
  the whole app.
- **cloudflared** quick tunnel: zero account, no warning page, but a **new random
  URL** each run (`run-tunnel.cmd`).
- **ngrok** stable tunnel: a **reserved free domain** (same URL every time) via
  `run-tunnel-stable.cmd`; trade-off is ngrok's **one-time-per-device** browser
  warning page on the free tier. Authtoken is stored in
  `%LOCALAPPDATA%\ngrok\ngrok.yml` (not in the repo).

---

## 11. Running the project

One-time setup:
```bat
cd backend && python -m pip install -r requirements.txt
cd ..\stratum-web-react && npm install
```

Windows scripts (double-click), in the project root:
| Script | Does |
|---|---|
| `run-all.cmd` | Start backend + frontend (each in its own window) |
| `run-backend.cmd` | Backend only → http://127.0.0.1:8000 |
| `run-frontend.cmd` | Frontend only → http://127.0.0.1:5173 |
| `run-tunnel.cmd` | Cloudflare quick tunnel (random HTTPS URL) |
| `run-tunnel-stable.cmd` | ngrok stable tunnel (same URL every time) |
| `db-snapshot.cmd` | Print a DB summary |

Manual:
```bat
cd backend && python -m uvicorn app.main:app --reload --port 8000
cd stratum-web-react && npm run dev -- --port 5173
```

Phone testing: start the app, run a tunnel script, open the printed HTTPS URL on
the phone, allow location + motion.

---

## 12. Inspecting the backend & data

- **Swagger UI** — http://127.0.0.1:8000/docs — call any endpoint from the browser.
- **DB browse** — open `backend/app.db` in VS Code's SQLite Viewer, or
  `db-snapshot.cmd` for a quick summary. Tables: `user`, `vehicle`, `session`,
  `sessionparticipant`, `telemetrypoint`.
- **Backend window logs** — every HTTP request + WebSocket connection (your "usage"
  view).
- **Analytics tests** — `cd backend && python tests/test_analytics.py`.

Useful SQL:
```sql
SELECT id, name, status, room_code FROM session ORDER BY id DESC;
SELECT timestamp, speed_kmh, altitude_m, g_force FROM telemetrypoint WHERE session_id = 7;
SELECT session_id, COUNT(*) FROM telemetrypoint GROUP BY session_id;
```

---

## 13. Build timeline (what we did, in order)

1. **Branding cleanup** — renamed everything from "Startum" → "Stratum" (titles,
   env var, room codes `STRAT-`, CSS tokens, READMEs).
2. **Backend hardening** — env-driven JWT secret with warning; migrated to the
   `lifespan` handler; de-duplicated the two token functions (and fixed a latent
   500 on a missing `sub` claim → now 401).
3. **Live map** — added Leaflet + a dark CARTO basemap; plotted participants as
   vector markers with a breadcrumb trail (replacing a placeholder).
4. **Delete sessions** — host-only `DELETE /sessions/{id}` (cascades), exposed
   `host_user_id`, and a trash button in Analytics.
5. **F1 gap leaderboard** — `Standings` component showing position + gap-to-leader +
   interval-to-car-ahead (distance-based).
6. **Multi-device groundwork** — `VITE_API_BASE_URL` + env-driven CORS; documented
   the HTTPS requirement for phone GPS.
7. **UI redesign** — adopted the minimal/premium design system (fonts, muted
   palette, flatter cards, white primary button) across every screen.
8. **Telemetry HUD** — built the gauge panel (phone metrics) over the map, with a
   live/replay-capable scrubber.
9. **Wired live telemetry** — captured `coords.altitude` + DeviceMotion **g-force**
   (with iOS permission tap), persisted `altitude_m`/`g_force` (model + schema +
   `ALTER TABLE` migration), widened the telemetry endpoint for replay, and made
   the Live screen a full-screen HUD + map + standings.
10. **Networking** — single-origin Vite `/api` proxy (HTTP + WS); Cloudflare quick
    tunnel, then an **ngrok stable reserved domain** for a permanent link.
11. **Replay** — `ReplayScreen` with interpolation, scrubber, speed control,
    per-racer selector, and playhead standings.
12. **Mobile rework + smoothness** — responsive `Layout` (sidebar → bottom tab
    bar), stacking grids, `100dvh`, overflow guards; eased map markers; screen-fade
    transitions; tappable dashboard stat cards → Analytics with an
    All/Wins/Podiums filter.

---

## 14. Known limitations & path to production / app stores

**Current limitations (it's an MVP):**
- **SQLite** + **in-memory** WebSocket manager = single-process only (won't scale
  across server instances).
- Auth lacks refresh tokens, password reset, email verification, rate limiting.
- Tunnel-based access only works while the PC + servers + tunnel are running.
- No background GPS (browsers stop tracking when the screen locks); no OBD data.

**To productionize:** Postgres (+ PostGIS later), Redis pub/sub for live rooms,
deploy FastAPI behind HTTPS/WSS on a host, strong secret + secrets manager,
migrations (Alembic), logging/metrics, account-deletion + privacy policy.

**To reach the App Store / Play Store:** wrap the existing React app with
**Capacitor** (reuses all current code; adds native geolocation/motion/BLE +
background tracking), or rewrite the UI in React Native for a fully native feel.
Requirements: Apple Developer ($99/yr) + a Mac for iOS builds, Google Play ($25
once), privacy policy + data-safety forms, in-app account deletion, and a
**distracted-driving / safety review** strategy (frame as passenger/closed-course
use, add "don't use while driving" disclaimers) since speed-focused driving apps
are scrutinised by Apple.

---

## 15. File map (quick reference)

```
Stratum/
  README.md                  # quick start
  run-*.cmd                  # run scripts (backend/frontend/tunnels/snapshot)
  cloudflared.exe, ngrok.exe # tunnel binaries
  docs/
    ANALYTICS_ARCHITECTURE.md  # original staff-level design + 14-feature roadmap
    PROJECT_RECORD.md          # this document
  backend/
    app/{main,models,schemas,auth,database,analytics,ws_manager}.py
    tests/test_analytics.py
    snapshot.py
    app.db
    requirements.txt
    README.md
  stratum-web-react/
    src/{main.tsx, store.ts, api.ts, index.css}
    src/components/{Layout, LiveMap, TelemetryHUD, Standings, DriveScorePanel, VehicleForm}.tsx
    src/screens/{Auth, Home, Garage, Analytics, Settings, CreateSession,
                 JoinSession, Lobby, Live, Results, Replay}.tsx
    vite.config.ts, tailwind.config.js, package.json
    README.md
```

---

*This record reflects the state of the project as built during the development
sessions. For the original design rationale and the longer feature roadmap, see
[ANALYTICS_ARCHITECTURE.md](ANALYTICS_ARCHITECTURE.md).*
