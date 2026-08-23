# Stratum — session handoff

Written 2026-08-16, updated 2026-08-17 (§2b, §5). Remote is
`rishik1020/stratum`, private.

---

## 1. Run it

```bash
# backend  → http://127.0.0.1:8000   (docs at /docs)
cd backend
STRATUM_SECRET_KEY=dev-local-key python -m uvicorn app.main:app --port 8000

# frontend → http://localhost:3000
cd stratum-web-react
npm run dev
```

**Test account** — `driver@stratum.app` / `stratum1234`

### Testing on a phone

```bash
cd stratum-web-react
npm run dev:https        # same port 3000, but TLS
```

Then open **`https://<your-lan-ip>:3000`** on the phone and accept the
self-signed certificate once (Advanced → Proceed).

`npm run dev` serves plain HTTP, and location, the Screen Wake Lock and
DeviceMotion are all gated on a **secure context** — which `http://<lan-ip>` is
not, though `http://localhost` is. Over plain HTTP the phone can browse the
whole UI but cannot start a drive.

Two traps, both hit for real:

- **Match the scheme to the port.** Pointing `https://` at the plain-HTTP dev
  server gives "This site can't provide a secure connection … invalid
  response", which reads like a certificate problem and isn't one. Run one
  server, not both.
- A self-signed certificate warning is expected and fine. An
  `ERR_SSL_PROTOCOL_ERROR` is not — that is the scheme/port mismatch above.

Seeded with 8 solo drives plus a 4-car race (Hitec City → Charminar, 15.7 km,
5200 telemetry points, ~21 min per car at 38–47 km/h). Regenerate with:

```bash
cd backend
python seed_demo.py --reset --race
```

### Useful URLs

| URL | What |
|---|---|
| `#/` | Landing film (sign out first — signed-in users get redirected) |
| `#/?t=10.5` | Landing paused at 10.5s, on the in-car beat. **Only works if the hash is present at page load.** |
| `#/dashboard` | Hub |
| `#/sessions/<id>/results` | The seeded race replay — `seed_demo.py` prints the id |
| `#/sessions/:id/car` | Car mode |

### Checks

```bash
cd backend && python run_tests.py        # 6 files
cd stratum-web-react && npx tsc --noEmit && npm run lint
```

---

## 2. What this session did

### Backend cleanup (commits `311ddff`–`f94601f`)

**Security — the significant one.** Five endpoints had *no authentication at
all*: `GET /sessions/{id}`, `/sessions/room/{code}`, `/participants`,
`/results`, and `/telemetry`. The last returns raw GPS breadcrumbs tagged with
usernames, so anyone reachable could walk the integer ID space and reconstruct
where real people drove. The WebSocket authenticated the token but never
checked membership. All are now scoped to people who hosted or raced in the
session, and non-participants get **404 rather than 403** — a 403 confirms the
session exists, which is half the enumeration attack.
`backend/tests/test_api_auth.py` covers it; against the prior commit it scores
4/9, after 9/9.

**Also fixed:**
- `ws_manager.broadcast` had no try/except — one dead socket aborted the loop and silenced every racer behind it.
- Leaving a session was permanent: rejoin hit "already joined" without clearing `left_at`, so the racer stayed invisible in `/participants`.
- Abandoned drives never ended (3 were stuck). Starting a new one now sweeps stale ones, backdating `ended_at` to the last real telemetry.
- `database.py` patched columns with `PRAGMA table_info` then returned early on anything non-SQLite — so every column added after the first deploy silently never reached the production Postgres. Replaced with **Alembic**. Autogenerate produced a baseline that creates `user` with an FK to `vehicle` before `vehicle` exists (they form a cycle); SQLite tolerates that, Postgres would have failed the first deploy. `0001_baseline.py` has the corrected form.
- Rate limits on `/auth/login` (5/min) and `/auth/signup` (10/hr); the app refuses to boot on a deployed DB with the dev secret key.
- `main.py` went 769 lines → 45, split into `routers/`, `services.py`, `deps.py`.

### Frontend cleanup

- Real URL routing (was a `useState<string>` switch). **HashRouter deliberately** — the same build is served by Vite, a static host and the Capacitor WebView, and hash routes need no server rewrite in any of them.
- Lazy-loaded screens: initial bundle 969 kB → 357 kB (298 → 119 kB gzipped).
- Lobby polled two endpoints every 2s and the live screen polled the roster every 10s, *over an already-open WebSocket*. Both now listen for a pushed `roster.changed`.
- `activeVehicle` in the store was written by a setter nothing called, so it was permanently null. No component read it — deleted rather than "fixed".
- Both "Leave" buttons navigated away without calling `/sessions/{id}/leave`, which had no caller anywhere.
- An expired token left the app on "Loading…" forever (error swallowed by a bare `.catch`). A 401 interceptor now signs out. **This fired for real during testing.**

### Design system (`4e4259e`)

Amber `#FFB020` on near-black `#08080A`. Tokens are real ramps — `ink 0-3`,
`hairline`/`hairline-strong`, `amber` with alpha washes, `positive`/`negative`.
The old `stratum-blue`/`stratum-gold` names pointed at the *wrong colours* after
a palette swap. Glass/aurora treatment dropped (muddy on near-black, and
`backdrop-blur` is expensive on the target low-end Android).

Nav is a floating pill: inset, icon-only, active item a filled amber circle.

### Post-drive screen (`00caeb8`)

Results and Replay merged into one `PostDriveScreen`. The route animation falls
out of the playback rather than being separate: the trail handed to the map is
sliced at the playhead, so the line draws itself as the replay runs. Playback
maths is in `lib/replay.ts`.

### In-car dashboard + satellite (`23960cd`)

`CarDashboard` — full-bleed map, frosted glass, huge speed figure. Used twice:
the landing film feeds it a scripted clock, **Car mode** (`/sessions/:id/car`)
feeds it live telemetry. The map is a **slot** so the landing can pass a
lightweight SVG instead of pulling Leaflet onto the marketing page.

Sizing is **`cqw`, not `vw`** — with viewport units the full-screen dashboard
and the one inset into the cabin photo would use identical font sizes.

Basemap is now **Esri World Imagery** across live/replay/dashboard, tile pane
dimmed to 58% brightness so amber trails stay legible. Attribution is required
and rendered.

> **Naming:** it is called **Car mode**, not CarPlay/Android Auto. Neither
> platform permits a racing/telemetry app — third-party categories are
> navigation, audio, messaging, EV charging and parking — and neither exposes
> vehicle data. Labelling it CarPlay is a promise that cannot ship.

---

## 2b. Session 2 — scoring, and recording with the screen off

### Real speed limits (`app/speed_limits.py`, migration `0003`)

Safety used to measure speeding against a flat 120 km/h placeholder, so a drive
through a 30 km/h street never registered as speeding — the largest single term
in the score was dead in exactly the conditions people actually drive in.

Limits now come from OpenStreetMap per ~3 km tile, cached 30 days in `roadtile`,
snapped to each telemetry point with a grid index (0.6 ms/point measured — ~1 s
for a full 16 km drive). `analytics.py` stays pure: it receives a plain list of
per-point limits and does no I/O.

**Everything hard here was found by running it against the live service, not by
reasoning about it.** Overpass is volunteer-run and genuinely unreliable — the
same query took 1.6 s and, twenty minutes later, 35 s, and returned 504s and
429s in between. What that forced:

- **2 parallel fetches, not 4.** Four got three 429s and one success; Overpass
  allots ~2 slots per IP. Concurrency was *causing* the failures.
- **Warm the cache during the drive** (`warm_tile`, called per telemetry
  sample). This is the load-bearing one — the background path has nobody
  waiting so it can afford a 60 s timeout, while end-of-drive gets 15 s. Under
  real conditions, warming is what actually populates the cache.
- **A coverage floor.** With 1 of 10 tiles resolved, unbounded gap-filling
  smeared one 20 km/h service road across 319 of 320 points — a normal
  main-road drive would have scored as 200% over the limit for its whole
  length. Now: fill only within 250 m of a matched point, and if under 60% of
  points land on a known road, return nothing and score with no speeding
  penalty at all. **A missing penalty is a far smaller error than a fabricated
  one.**
- **Backoff on failure.** An outage cost the full 15 s budget on *every* call —
  the second identical call spent another 15 s failing at the same tiles.
- **Endpoint failover** across three mirrors.

Also in the score: speeding is now judged past a tolerance of max(5 km/h, 7%),
because GPS error and speedometer bias otherwise flag every drive ever taken;
and it is weighted by *how far* over, not just how long — 1 km/h over used to
cost exactly what 50 km/h over did.

`events.limits_matched` says whether real road data was used. The UI reads it
and says "speeding wasn't assessed" rather than presenting a fallback as a
measurement.

### Recording with the screen off (`lib/tracking.ts`)

`watchPosition` runs in the WebView, which both OSes suspend when the screen
locks — so a drive with the phone in a pocket recorded its first minute or two.
Now `@capacitor-community/background-geolocation` runs an Android foreground
service; web falls back to `watchPosition` plus a Screen Wake Lock, and says so
in the UI, because a browser tab genuinely cannot track in the background.

Two things the plugin's README makes clear and are easy to miss:

- `android.useLegacyBridge: true` is **required** in `capacitor.config.ts`, or
  updates stop after 5 minutes backgrounded — the exact bug being fixed.
- Android throttles WebView-initiated network after ~5 minutes backgrounded. So
  on a long drive the socket stalls *even on perfect signal* while the native
  service keeps producing fixes.

Which is why the socket work matters as much as the plugin:

- **`useSessionSocket` had no reconnection at all**, and `send` silently dropped
  anything arriving while closed. A drive that lost its socket stopped recording
  permanently and never said so. Now: exponential backoff with jitter, immediate
  retry on `online`/visibility, and telemetry queued (bounded, 3000 frames) and
  replayed in order.
- **Replayed fixes carry `recorded_at`.** The server stamped rows on arrival, so
  a flushed backlog would have collapsed minutes of driving into one instant —
  Δt ≈ 0, which the scoring engine skips outright. Device time is trusted only
  within +5 min / −6 h of server time.

Do NOT add `ACCESS_BACKGROUND_LOCATION`: with a `location`-type foreground
service, "while in use" is sufficient, and it would add a harder prompt plus a
Play Store policy declaration for nothing. Do not redeclare the `<service>`
either — the plugin's manifest supplies it, and a second entry that disagrees on
`android:exported` fails the merge.

**Untested on a real device.** Everything above is verified by unit tests, the
live Overpass probes, and browser checks; the foreground service itself needs an
APK on a real phone with the screen off.

### Demo data was physically impossible

The race seeder derived position from a fixed 16 km route at one point per
second (≈138 km/h) while inventing speed from an independent sine wave
(4–72 km/h). The two were never connected, so the stored data claimed 16 km in
7 minutes: **average 139 km/h against a top speed of 82**. Integrating the speed
samples over the same window gave 5.3 km, not 16.1.

Time is now derived from distance and speed. Two follow-on artefacts had to go
as well, both invisible while samples were a fixed 1 s apart:

- per-point jitter of ±6.7 m against ~16 m spacing produced 0.02 s gaps, which
  `MIN_DT` clamped into 4 g of acceleration that never happened;
- independent ±4 km/h speed noise between ~1 s samples *is* ±3 m/s², which
  manufactured 89 harsh brakes and 140 hard accelerations and scored a steady
  cruise at comfort 0.

The seeded race is now 15.7 km in 20–25 min at 38–47 km/h against a 70–83 km/h
max, with zero spurious events. **None of the scoring work could be judged
against the old data.**

---

## 3. Assets (all gitignored)

| Path | What | Notes |
|---|---|---|
| `stratum-web-react/public/car.glb` | Porsche 911 Carrera 4S | Draco-compressed 25.4 MB → 7.9 MB. **Body shell only — no interior.** |
| `stratum-web-react/public/draco/` | Draco decoder | **Committed.** Vendored locally so the APK decodes offline instead of off a Google CDN. |
| `stratum-web-react/public/cabin/driver.jpg` | Driver's-POV interior photo | 1920×1080. Manufacturer press imagery — **licence it before going public.** |

Regenerate the model: `npx @gltf-transform/cli draco <source>.glb public/car.glb`
(texture compression fails on this machine — libvips colourspace error).

See `docs/CAR_MODEL.md` and `public/cabin/README.md`.

---

## 4. ⚠ The landing page is the weak point

**The user's verdict on the current landing design was "one of the worst
designs ever made", and they were right.** Here is the honest post-mortem.

### What's wrong

Screenshot at desktop shows: the infotainment display is a dark rectangle with
an amber smudge in it. That smudge is the entire `CarDashboard` — speed panel,
session title, pills, map — crushed into ~200px wide. **The one thing the beat
exists to show is the least legible thing on screen.**

Also: the photo is washed to flat grey by an over-heavy grading layer; the
"CARPLAY · ANDROID AUTO · PHONE" caption sits across the windscreen line and is
barely readable (and contradicts the Car-mode naming decision); nothing anchors
the eye.

### Root cause

Two things:

1. **Framing.** The reference video frames the infotainment screen *large*,
   filling most of the frame. The photo used here is a wide interior shot where
   the display is **14% of the frame width** (267px of 1920). Rendering a rich
   landscape UI into that can never work — it isn't a tuning problem.

2. **Built blind.** Roughly ten turns of visual design were produced without
   ever seeing a rendered pixel — the Browser pane was closed, which pauses
   `requestAnimationFrame`, so the canvas never drew and screenshots failed.
   DOM/geometry checks were reported as "verified", which was true and useless:
   they confirm an overlay is at 52.6% of a photo, and say nothing about whether
   it looks like anything. The design also accreted through four pivots
   (globe → wheel → 3D car → CSS cockpit → photo composite) without a reset.

### The agreed fix (started, NOT finished)

Let the dashboard **lift off the dash and scale up to fill the frame**:
interior establishes → UI becomes the hero at full resolution.

A tight crop into the photo was rejected: the display is 267px wide in a 1920px
source, so filling the frame with it means ~4.8× upscale and mush.

Implementation was mid-write when the session ended. The approach:

- Measure the photo box with a ref + `ResizeObserver` (it overflows the viewport to cover, so the display's position is a fraction of the *photo*, not the screen).
- Interpolate the dashboard's rect in viewport px from the bezel rect → a centred rect ~82% of viewport width, driven by `easeInOut(ramp(t, 7.6, 9.2))`.
- Flatten `rotateY` from -9° → 0 as it lifts; grow radius and shadow.
- Grading light while establishing, deeper once lifted.
- Caption to the top edge, clear of the dashboard.
- Bottom line → "Car mode · Phone in a mount".

**`CabinScene.tsx` is currently the pre-lift version** — committed and working,
just badly framed.

---

## 5. Known issues / next up

1. **Landing framing fix** — section 4. Highest priority if the landing matters.
2. **Analytics screen** (`AnalyticsScreen`, `StatsOverview`, `DriveScorePanel`) is still on old styling — never got the oversized-hero / sparkline / inverted-card pass.
3. **`.env.production` points at a personal ngrok tunnel**, baked into APK builds. Any build handed to someone else only works while that PC and tunnel are up. Needs the Render URL.
4. **Background location is untested on a real device.** The Android foreground service, the notification, and the 5-minute WebView network throttle all need an APK on a real phone, driven with the screen off. This is the single most valuable next check — §2b.
5. **Speed-limit coverage depends on a warm tile cache.** A drive through an area nobody has driven before, while Overpass is unwell, scores with no speeding penalty and says so in the UI. It fixes itself as the cache fills. If coverage matters at scale, self-host Overpass or pay a provider.
6. **`sqlmodel==0.0.8` pins Pydantic v1** (`orm_mode`, `.dict()`). Upgrading is a real migration.
7. **In-memory WebSocket rooms = one backend instance.** Scaling needs Redis pub/sub. The socket now reconnects, which makes a restart survivable but not a second instance.
8. **Cabin photo licensing** — Porsche press imagery, currently gitignored but shipped in builds.
9. **Scores changed meaning.** Any score stored before this session was computed with the old speeding term and a flat 120 km/h limit; they aren't comparable to new ones. Re-run `seed_demo.py --reset --race` for demo data.

---

## 6. Traps worth remembering

- **Deleting a file mid-session breaks Vite HMR.** Symptom: stale modules, phantom errors (`draw is not defined`), routes not resolving. Fix: stop the server, `rm -rf node_modules/.vite`, restart. This happened four times.
- **The dev server answers 200 with `index.html` for missing files.** Any asset probe must check content-type or decode the file — a status check reports success and then renders broken. Both `car.glb` and `driver.jpg` probes do this.
- **`requestAnimationFrame` is paused while the tab is hidden.** The globe, the replay playhead and the R3F render loop all freeze — the canvas even stays at its default 300×150 because R3F never sizes it. Not a bug; but it means *nothing animated can be verified without a visible browser*.
- **`rm -f` exits 0 on a missing path.** An earlier commit claimed `wheel.png` was deleted; the `cd ..` had landed in `src/`, so it silently no-oped while the message asserted otherwise. Verify deletions.
- **Pasted chat images have no filesystem path.** They must be saved manually before they can be used.
- **`seed_demo.py` needs the backend stopped.** SQLite single-writer; otherwise it dies mid-run with "database is locked" and leaves partial data.
- **The Windows console is cp1252.** `print`ing `→` or `·` raises `UnicodeEncodeError` *after* the work has committed, which looks like a failure that isn't one.
- **Stubbed tests hid every real problem in the speed-limit work.** 19 unit tests passed against a fake Overpass while the live service produced 429s, 20× latency swings, and a gap-fill bug that would have mis-scored every partly-covered drive. For anything talking to a third-party service, probe the real thing once before believing the suite.
- **Tests that pass are not tests that work.** Two "ordering" tests here used a palindromic limit pattern at constant speed, so pairing every limit with the wrong point produced identical numbers. Deliberately break the code and confirm the test fails.

---

## 7. Architecture quick reference

```
backend/
  app/
    main.py           app assembly only (45 lines)
    routers/          auth, users, vehicles, sessions, telemetry
    services.py       scoring rollup, room codes, abandoned-drive sweep
    deps.py           authorization — who may read which session
    analytics.py      pure scoring engine, no DB/IO
    speed_limits.py   OSM map-matching + tile cache (the impure half)
    rate_limit.py     slowapi limiter
  migrations/         Alembic; runs on startup, SQLite + Postgres
  tests/              test_analytics, test_api_auth, test_sessions
  run_tests.py        runs all three (no pytest needed)
  seed_demo.py        demo drives + the 4-car race

stratum-web-react/src/
  App.tsx             routes, auth guards, lazy screens
  routes.ts           every path in one place
  landing/            LandingPage (film), CarStage (3D), CabinScene, useCinematic
  components/         CarDashboard, LiveMap, RacerPanel, RacerCard, TelemetryHUD, …
  screens/            Home, Garage, Analytics, Settings, Lobby, Live, CarMode, PostDrive, Auth
  lib/                units, format, charts, replay, tiles, tracking, useRouteSession, useSessionSocket
  store.ts            zustand — token, user, vehicles, session, units
```

**The film's beat sheet is `BEATS` in `landing/useCinematic.ts`** — camera, cabin
UI and page copy all read from it. They were split across three files once and
drifted: the head unit read 115 km/h while the car was still parked, because
speed was keyed to the button press instead of the launch.
