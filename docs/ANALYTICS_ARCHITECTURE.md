# Stratum Analytics Platform — Architecture & Design

> "Strava for Cars." A social driving platform where every drive, convoy, route,
> vehicle, and user produces meaningful insight. This document is the staff-level
> design for the analytics system and the roadmap that sequences the 14 feature
> areas into shippable phases.

---

## 0. Guiding principles

1. **One ingest, many views.** Raw GPS/telemetry is written once to an immutable
   stream. Everything else (drive metrics, scores, leaderboards, Wrapped) is a
   *derived* projection that can be recomputed from the stream. Never destroy raw data.
2. **Compute where the data lives, cache what users read.** Heavy aggregation runs
   in background jobs; the API serves pre-computed, cached projections.
3. **Honest data dependencies.** Many requested metrics need data we don't yet
   capture (engine/altitude/road-speed-limits/social graph). The design states the
   dependency rather than faking the number. See §9 roadmap.
4. **Real-time and historical are different pipelines** with different SLAs:
   live convoy positions need sub-second fan-out; a Driving Score can take seconds.

---

## 1. Recommended stack

| Layer | Recommendation | Why / migration from today's MVP |
|---|---|---|
| **Frontend** | React + TypeScript + Vite, TanStack Query, Zustand, **Recharts** (dashboards) + **deck.gl/Mapbox GL** (maps/heatmaps/replay), Framer Motion (Wrapped) | Already on React/Vite/Recharts/Zustand. Add TanStack Query for server-cache + add deck.gl for GPU map layers. |
| **Backend API** | **FastAPI** (Python), Pydantic v2, async | Already FastAPI. Keep. |
| **Primary DB** | **PostgreSQL + PostGIS** | Replace SQLite. PostGIS gives geospatial indexing, route matching, ST_* distance/heatmap queries. |
| **Time-series telemetry** | **TimescaleDB** (Postgres extension) hypertable for `telemetry_point` | One DB engine, continuous aggregates for per-drive rollups. |
| **Real-time transport** | WebSockets via **Redis Pub/Sub** fan-out (or NATS) | Today's in-memory `ConnectionManager` is single-process. Redis lets many API nodes share convoy rooms. |
| **Cache / hot state** | **Redis** (live convoy positions, leaderboards via sorted sets, score cache) | New. |
| **Background jobs** | **Celery** or **Arq** + Redis broker; **Celery Beat** for scheduled rollups | New. Drive scoring, Wrapped, route rollups, health predictions run here. |
| **Object storage** | S3-compatible (route GeoJSON, replay frames, Wrapped share cards) | New. |
| **Analytics warehouse (optional, later)** | ClickHouse or BigQuery for community/global leaderboards & heatmaps at scale | Phase 4+. |
| **Maps / routing** | **Mapbox** (tiles, map-matching, isochrones) or self-host **Valhalla**/OSRM for map-matching + elevation | New. Provides elevation, snapping GPS to roads, road class/speed limits. |
| **GPS processing** | Kalman/particle smoothing → map-matching → resample to fixed cadence | See §4. |
| **AI Coach** | Rules/heuristics first (deterministic, explainable) → LLM (Claude) for natural-language summaries over the structured metrics | §6. |

**One-line answer to "what stack":** FastAPI + Postgres/PostGIS/TimescaleDB +
Redis + Celery on the backend; React/Vite + Recharts + deck.gl/Mapbox on the
frontend; Mapbox/Valhalla for maps and map-matching.

---

## 2. Data architecture — four layers

```
   ┌────────────────────────────────────────────────────────────────┐
   │ L0  RAW STREAM (immutable, append-only, Timescale hypertable)   │
   │     telemetry_point: ts, drive_id, lat, lng, speed, heading,    │
   │     altitude, accuracy, accel_x/y/z (if OBD/IMU), …             │
   └───────────────┬────────────────────────────────────────────────┘
                   │  (background job per finished drive, or streaming)
   ┌───────────────▼────────────────────────────────────────────────┐
   │ L1  DRIVE AGGREGATES (one row per drive)                        │
   │     distance, duration, moving/idle, avg/max/min speed, stops,  │
   │     elevation_gain/loss, day/night, fuel_est, co2_est, bbox,    │
   │     start/end geo, encoded_polyline                             │
   ├─────────────────────────────────────────────────────────────────┤
   │ L1b DRIVE SCORES (one row per drive)                            │
   │     overall, safety, eco, performance, comfort, event_counts,   │
   │     explanations[]                                              │
   └───────────────┬────────────────────────────────────────────────┘
                   │  (scheduled rollups)
   ┌───────────────▼────────────────────────────────────────────────┐
   │ L2  ROLLUPS (denormalized for fast reads)                       │
   │     user_stats, vehicle_stats, route_stats, convoy_stats,       │
   │     user_route_pb, friendship_drive_stats, monthly_user_stats   │
   ├─────────────────────────────────────────────────────────────────┤
   │ L3  LEADERBOARDS & FEEDS (Redis sorted sets + materialized)     │
   │     route:{id}:global, route:{id}:friends, challenge progress   │
   └─────────────────────────────────────────────────────────────────┘
```

### Core entities (target schema)

- `user`, `follow(follower_id, followee_id)` — social graph.
- `vehicle` (+ `fuel_type`, `tank_l`, `efficiency_l_per_100km`, `co2_g_per_l`).
- `drive` — the central object. `id, user_id, vehicle_id, mode(normal|sprint|track),
  convoy_id?, route_id?, started_at, ended_at, status`. **A "drive" is the unit of
  analytics** (Strava's "activity").
- `telemetry_point` — L0 stream, FK `drive_id` (Timescale hypertable, partition by time).
- `drive_metrics` (L1), `drive_score` (L1b).
- `route` (canonical geometry) + `route_attempt(route_id, drive_id, user_id, time, avg_speed)`.
- `convoy` (a multi-driver session) + `convoy_member(convoy_id, drive_id, user_id)`.
- `lap` / `sector_time` — track mode.
- `vehicle_health_sample` + `dtc_code` — OBD ingestion.
- `challenge`, `challenge_progress`, `achievement`, `user_xp`.
- L2 rollups + L3 leaderboards as above.

> **Migration note:** today's `Session`/`SessionParticipant`/`TelemetryPoint` already
> model a sprint convoy. The clean refactor is: `Session → convoy`, each
> `SessionParticipant → drive` (mode=sprint), and `TelemetryPoint.participant_id →
> drive_id`. The analytics engine in §3 is written to operate on a per-drive point
> stream, so it works on the current schema unchanged.

---

## 3. Scoring engine (Drive Analytics + Driving Score)

Pure, deterministic, explainable functions over an ordered point stream. Implemented
now in [`backend/app/analytics.py`](../backend/app/analytics.py).

**Per-segment derived signals** (between consecutive points i, i+1):
- `dt` = Δtime (s); `a` = (v₂−v₁)/dt in m/s² (longitudinal accel/decel).
- `yaw_rate` = Δheading/dt (rad/s); `lateral_accel` ≈ v·yaw_rate (cornering load).
- `jerk` = Δa/dt (comfort).

**Event detection (thresholds, tunable in `analytics.py`):**
| Event | Condition |
|---|---|
| Harsh braking | a < −3.0 m/s² (≈ −0.31 g) |
| Rapid acceleration | a > +2.8 m/s² |
| Sharp cornering | lateral_accel > 4.0 m/s² (≈ 0.41 g) — needs heading |
| Excessive speeding | speed > limit (road limit if map-matched, else config threshold) |

**Drive metrics (L1):** distance (max cumulative, else Σdeltas, else ∫v·dt), duration,
moving time (v > 3 km/h), idle time, avg/avg-moving/max/min speed, stop count
(moving→idle transitions), day/night split (sun-aware later; hour heuristic now),
start/end geo, fuel & CO₂ estimates (vehicle efficiency × distance), elevation
gain/loss (needs altitude — flagged when unavailable).

**Subscores (0–100), per-distance-normalized so length is fair:**
- **Safety** = 100 − penalties(harsh_brake, rapid_accel, sharp_corner) per km − speeding.
  Speeding counts twice over: `20·speeding_ratio` (how long) + `30·speeding_severity`
  (how far over, saturating at 50% above the limit). Duration alone made 1 km/h over
  cost the same as 50, which only passed unnoticed while the "limit" was a flat 120
  nobody reached. A tolerance of max(5 km/h, 7%) applies first, because GPS error and
  speedometer bias otherwise flag every drive ever taken. Limits are map-matched per
  point — see `backend/app/speed_limits.py`.
- **Eco** = rewards smooth throttle (low |a| variance), low idle ratio, efficient cruise band, penalizes harsh accel.
- **Comfort** = rewards low jerk, low speed σ, consistent inputs.
- **Performance** = rewards strong-but-smooth acceleration, high speed maintenance/consistency, clean cornering.
- **Overall** = 0.35·Safety + 0.25·Eco + 0.20·Comfort + 0.20·Performance.

**Explanations & coach output** (feeds §AI-Coach / feature 9): each penalty emits a
human string ("Safety reduced by 5 harsh-braking events"); strengths/weaknesses/
recommendations are generated from the ranked factors.

---

## 4. Telemetry pipeline

```
device ──ws──> API ingest ──> validate ──> append L0 (Timescale)
                   │                         │
                   └── Redis pub/sub ────────┴──> live convoy fan-out (positions, gaps)
on drive end / every N points:
   Celery: smooth (Kalman) → map-match (Mapbox/Valhalla) → L1 metrics → L1b score
        → update L2 rollups → update L3 leaderboards (Redis ZADD) → invalidate caches
```

- **Smoothing:** GPS jitter is removed with a Kalman filter before distance/elevation
  integration; raw stays in L0.
- **Map-matching:** snaps points to road geometry → unlocks road class, **speed
  limits** (for the speeding factor), accurate distance, and route identification.
- **Resampling:** to a fixed cadence (e.g., 1 Hz) so scores are comparable across devices.

---

## 5. API surface (grouped)

```
Drives      GET  /drives                      list (filters: vehicle, mode, range)
            GET  /drives/{id}                  detail + L1 metrics
            GET  /drives/{id}/score            L1b score + explanations
            GET  /drives/{id}/telemetry        resampled stream for charts/replay
            GET  /drives/{id}/coach            strengths/weaknesses/recommendations
Sprint      WS   /ws/convoys/{id}              live positions, gaps, chat
/Convoy     GET  /convoys/{id}/analytics       leaderboard, lead/trail time, gaps
            GET  /users/me/convoy-stats        long-term convoy rollup
Routes      GET  /routes/{id}/leaderboard      ?scope=global|friends|local
            GET  /routes/{id}/heatmap          PostGIS aggregated geometry
Garage      GET  /vehicles/{id}/analytics      mileage, economy, cost/km, trends
Health      POST /vehicles/{id}/health         OBD sample ingest
            GET  /vehicles/{id}/health         score, reminders, predictions, DTCs
Track       GET  /drives/{id}/laps             lap/sector times, best lap, deltas
Social      GET  /users/me/social              followers, likes, top friends
Gamify      GET  /users/me/challenges          progress, streaks, XP, level, badges
Wrapped     GET  /users/me/wrapped/{year}      annual summary payload
```

(Implemented now: `GET /sessions/{id}/drive-analytics` = drive metrics + score +
coach, operating on the current sprint schema; the rest are specified here for the
phased build.)

---

## 6. AI Driving Coach

Two-stage, explainable-first:
1. **Deterministic factor engine** (§3) produces structured strengths/weaknesses/
   recommendations from event counts and trends. Always available, testable, no cost.
2. **LLM narration (Claude)** turns the structured factors + drive-over-drive deltas
   into natural coaching ("Corner-exit speeds improved 6% vs your last 5 drives").
   The LLM only *phrases* numbers the engine computed — it never invents metrics.

---

## 7. Caching strategy

- **Read-through cache** (Redis) on all L2/L3 projections; TTL + explicit invalidation
  on the job that recomputes them.
- **Leaderboards** as Redis **sorted sets** (`ZADD route:{id}:global {time} {user}`),
  O(log n) insert, O(1) rank reads.
- **Live convoy state** in Redis hashes, expired on disconnect.
- **HTTP caching** (ETag) on immutable drive detail/score (a finished drive never changes).

---

## 8. Background jobs (Celery Beat)

| Job | Cadence | Output |
|---|---|---|
| `score_drive` | on drive end | L1 metrics + L1b score |
| `rollup_user_stats` | on drive end + nightly | L2 user/vehicle/route/convoy |
| `refresh_leaderboards` | on attempt + hourly | L3 Redis sorted sets |
| `health_predict` | on OBD sample + daily | health score, service ETA |
| `compute_wrapped` | yearly + on demand | Wrapped payload + share cards |
| `challenge_evaluate` | nightly + on drive | progress, streaks, XP/badges |

---

## 9. Phased roadmap — all 14 areas mapped to data dependencies

| Phase | Features | Needs |
|---|---|---|
| **P0 (now)** | **§1 Drive Analytics**, **§2 Driving Score**, **§9 Coach (rules)** | GPS only ✅ already captured |
| **P1** | **§3 Sprint/Convoy analytics**, **§5 Route analytics + leaderboards**, **§13 dashboards** | + PostGIS, Redis sorted sets, map-matching |
| **P2** | **§6 Garage analytics**, **§10 Social**, **§11 Challenges/XP**, **§12 Wrapped** | + social graph, rollup jobs, S3 share cards |
| **P3** | **§7 Vehicle Health** (OBD-II/BLE), **§8 Track mode** (laps/sectors/G-force) | + OBD/IMU ingest, track geometry, accel data |
| **P4** | Global heatmaps, community leaderboards, ML coach | + warehouse (ClickHouse), LLM narration |

**Honest gaps to capture before some metrics are real:**
- *Elevation* → capture GPS **altitude** (add to telemetry) or query an elevation API.
- *Excessive speeding* → road **speed limits** via map-matching.
- *G-force / harsh-event fidelity* → **IMU/OBD** accelerometer (GPS-derived accel is coarse).
- *Fuel/CO₂ accuracy* → per-vehicle efficiency + (ideally) OBD fuel-rate.
- *Social/health/track* → new data sources listed per phase.

---

## 10. What ships in this PR (P0)

- `backend/app/analytics.py` — the drive-analytics + scoring + coach engine (pure functions).
- `GET /sessions/{id}/drive-analytics` — runs the engine over a drive's telemetry.
- `backend/tests/test_analytics.py` — deterministic tests (smooth drive scores high; an
  aggressive drive loses Safety/Comfort with correct explanations).
- Frontend `DriveScorePanel` — score ring, subscore bars, and coach insights, wired into
  the Analytics screen.
