"""Road speed limits, map-matched from OpenStreetMap.

The Safety score penalises time spent over the limit. Until now "the limit" was
a flat 120 km/h placeholder, so a drive through a 30 km/h residential street
never registered as speeding — the single largest term in the Safety score was
dead in exactly the conditions most people actually drive in.

This resolves the real limits for the roads a drive covered, snaps each
telemetry point to the nearest one, and hands a per-point list to the (still
pure) scoring engine in `analytics.py`.

Three rules shape everything here:

- **Never block a drive.** Overpass is a free, rate-limited, sometimes-slow
  public service. Every failure path returns None and the caller falls back to
  the lenient default. Nobody loses a drive because a map server was busy.
- **Never guess harshly.** An unmatched point inherits its neighbour's limit
  rather than a made-up number, and if nothing resolves at all the caller stays
  lenient. Wrongly accusing someone of speeding is worse than missing it.
- **Cache by tile, not by drive.** People drive the same roads over and over;
  the second trip down your street should cost nothing.
"""
from __future__ import annotations

import json
import logging
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlmodel import Session, select

from app.models import RoadTile

logger = logging.getLogger("stratum.speed_limits")

# Tried in order. These are volunteer-run and individually unreliable — during
# development the primary returned 504 one minute and served 975 ways in 1.6s
# the next, while a mirror did the reverse. One endpoint would make speed limits
# a coin flip; the list makes a bad minute on one server a non-event.
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

# Overpass response time for one identical tile query was measured at 1.6s and,
# twenty minutes later, 35s. So there are two timeouts, because there are two
# callers with completely different patience:
#
#   - foreground: someone just ended a drive and is waiting for their score.
#   - background: warming the cache mid-drive, with nobody waiting at all.
#
# The background path is the one that actually populates the cache under real
# conditions; the foreground path exists to catch what warming missed.
FETCH_TIMEOUT_S = 12
WARM_FETCH_TIMEOUT_S = 60
DEFAULT_BUDGET_S = 15.0

# Overpass allots ~2 concurrent slots per IP. Asking for 4 doesn't go faster,
# it returns 429 — measured: four parallel tile fetches got three 429s and one
# success. Two is the polite maximum and in practice the fast one.
MAX_PARALLEL_FETCHES = 2

# Tile size in degrees. ~0.03° is a little over 3 km. Sized against the real
# bottleneck, which is request count rather than response size: a 5 km diagonal
# drive clipped the corners of five 0.02° tiles, and five requests is enough to
# get throttled. At 0.03° the same drive is two or three.
TILE_DEG = 0.03

# After a tile fails to fetch, don't try it again for this long (in-process).
# Without it, an outage costs the full budget on *every* lookup — the first
# live run spent 15s failing and then another 15s failing at exactly the same
# thing. A tile that just failed is not about to succeed.
FAILED_TILE_BACKOFF_S = 300.0

# How long a cached tile stays good. Speed limits change rarely.
TILE_TTL = timedelta(days=30)

# Cell size for the spatial index used at match time. ~0.002° ≈ 220 m, so a
# point only ever tests segments in its own cell and the eight around it.
CELL_DEG = 0.002

# Roads a car can be on. A positive whitelist keeps the Overpass response small
# and matches the classes we have fallbacks for.
DRIVABLE = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential|"
    "living_street|service|motorway_link|trunk_link|primary_link|"
    "secondary_link|tertiary_link"
)

# Fallback limits by OSM highway class, km/h, for roads with no `maxspeed` tag —
# which is most of India. Set at the generous end of each class: these are
# guesses, and a guess should not cost someone points.
HIGHWAY_DEFAULTS = {
    "motorway": 100.0,
    "motorway_link": 80.0,
    "trunk": 90.0,
    "trunk_link": 60.0,
    "primary": 70.0,
    "primary_link": 50.0,
    "secondary": 60.0,
    "secondary_link": 45.0,
    "tertiary": 50.0,
    "tertiary_link": 40.0,
    "unclassified": 50.0,
    "residential": 40.0,
    "living_street": 20.0,
    "service": 20.0,
}

# Past this a point isn't meaningfully "on" the road. Generous, because urban
# GPS bounces off buildings and a dual carriageway is wide.
MAX_MATCH_DISTANCE_M = 45.0

# An unmatched point may inherit a matched neighbour's limit only if that
# neighbour is this close. Beyond it we genuinely don't know what road they were
# on. Unbounded fill is actively dangerous: on a partly-resolved 16 km route it
# smeared one 20 km/h service road across 319 of 320 points, which would have
# scored a normal main-road drive as 200% over the limit for its whole length.
GAP_FILL_MAX_M = 250.0

# If fewer than this fraction of points land on a known road, the coverage is
# too thin to judge anyone by. Score with no limits instead — a missing penalty
# is a far smaller error than a fabricated one.
MIN_MATCH_RATIO = 0.6


def _parse_maxspeed(raw: Optional[str]) -> Optional[float]:
    """OSM `maxspeed` is free text: "50", "30 mph", "IN:urban", "none"."""
    if not raw:
        return None
    value = raw.strip().lower()
    if value in ("none", "signals", "variable", "unposted", "unknown"):
        return None
    try:
        if "mph" in value:
            return float(value.replace("mph", "").strip()) * 1.60934
        if "knots" in value:
            return float(value.replace("knots", "").strip()) * 1.852
        return float(value.split()[0])
    except (ValueError, IndexError):
        # Country-code forms like "IN:urban" carry no number we can trust; the
        # highway-class fallback handles them.
        return None


def _tile_origin(lat: float, lng: float) -> Tuple[float, float]:
    return math.floor(lat / TILE_DEG) * TILE_DEG, math.floor(lng / TILE_DEG) * TILE_DEG


def _tile_key(lat: float, lng: float) -> str:
    return f"{math.floor(lat / TILE_DEG)}:{math.floor(lng / TILE_DEG)}"


def _tiles_for(points: Sequence[Tuple[float, float]]) -> List[Tuple[str, float, float]]:
    """The distinct tiles a route passes through, each with its origin."""
    seen: Dict[str, Tuple[str, float, float]] = {}
    for lat, lng in points:
        key = _tile_key(lat, lng)
        if key not in seen:
            lat0, lng0 = _tile_origin(lat, lng)
            seen[key] = (key, lat0, lng0)
    return list(seen.values())


class _RateLimited(Exception):
    """Every endpoint answered 429. Asking harder makes it worse."""


# tile_key -> monotonic time after which it's worth retrying.
_failed_until: Dict[str, float] = {}
_failed_lock = threading.Lock()


def _is_backed_off(key: str) -> bool:
    with _failed_lock:
        until = _failed_until.get(key)
        if until is None:
            return False
        if time.monotonic() >= until:
            del _failed_until[key]
            return False
        return True


def _mark_failed(key: str) -> None:
    with _failed_lock:
        _failed_until[key] = time.monotonic() + FAILED_TILE_BACKOFF_S


def _mark_ok(key: str) -> None:
    with _failed_lock:
        _failed_until.pop(key, None)


def _fetch_tile(
    lat0: float, lng0: float, timeout_s: int = FETCH_TIMEOUT_S
) -> Optional[List[dict]]:
    """Drivable ways in one tile, or None if the request failed.

    Pure network — no DB — because this runs on a worker thread and the SQLModel
    session belongs to the caller's thread.
    """
    query = (
        f"[out:json][timeout:{timeout_s}];"
        f'way["highway"~"^({DRIVABLE})$"]'
        f"({lat0},{lng0},{lat0 + TILE_DEG},{lng0 + TILE_DEG});"
        f"out geom;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    payload = None
    throttled = 0
    for url in OVERPASS_URLS:
        req = urllib.request.Request(
            url,
            data=body,
            headers={"User-Agent": "Stratum/1.0 (+drive analytics; OSM speed limits)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
                payload = json.loads(resp.read())
            break
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            if getattr(exc, "code", None) == 429:
                throttled += 1
            logger.warning(
                "overpass %s failed for tile %.3f,%.3f: %s",
                urllib.parse.urlsplit(url).netloc, lat0, lng0, exc,
            )
    if payload is None:
        if throttled:
            raise _RateLimited()
        return None

    ways: List[dict] = []
    for element in payload.get("elements", []):
        geometry = element.get("geometry") or []
        if len(geometry) < 2:
            continue
        tags = element.get("tags", {})
        limit = _parse_maxspeed(tags.get("maxspeed"))
        if limit is None:
            limit = HIGHWAY_DEFAULTS.get(tags.get("highway", ""))
        if limit is None:
            continue
        ways.append(
            {"limit": limit, "geom": [(p["lat"], p["lon"]) for p in geometry]}
        )
    return ways


def _read_cache(keys: Sequence[str], db: Session) -> Dict[str, RoadTile]:
    if not keys:
        return {}
    rows = db.exec(select(RoadTile).where(RoadTile.tile_key.in_(list(keys)))).all()
    return {row.tile_key: row for row in rows}


def _decode(row: RoadTile) -> Optional[List[dict]]:
    try:
        ways = json.loads(row.ways_json)
    except ValueError:
        return None
    # JSON turns the coordinate tuples into lists; the matcher unpacks pairs
    # either way, so leave them as-is rather than paying to rebuild them.
    return ways


def _save_cache(fetched: Dict[str, List[dict]], origins: Dict[str, Tuple[float, float]],
                existing: Dict[str, RoadTile], db: Session) -> None:
    """Write freshly fetched tiles back. A cache write must never break a drive,
    so a failure here is logged and swallowed."""
    if not fetched:
        return
    now = datetime.utcnow()
    for key, ways in fetched.items():
        payload = json.dumps(ways, separators=(",", ":"))
        row = existing.get(key)
        if row:
            row.ways_json = payload
            row.fetched_at = now
        else:
            lat0, lng0 = origins[key]
            row = RoadTile(
                tile_key=key, lat0=lat0, lng0=lng0, ways_json=payload, fetched_at=now
            )
        db.add(row)
    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001 — caching is best-effort by design
        logger.warning("road tile cache write failed: %s", exc)
        db.rollback()


class _Index:
    """Uniform-grid spatial index over road segments.

    Without this, matching is every point against every segment in the city —
    a 16 km drive is ~1,600 points against tens of thousands of segments, which
    is tens of millions of distance calculations in Python. Bucketing by ~220 m
    cell drops each point to a handful of candidates.
    """

    __slots__ = ("cells",)

    def __init__(self, ways: Iterable[dict]):
        self.cells: Dict[Tuple[int, int], List[Tuple[float, float, float, float, float]]] = {}
        for way in ways:
            limit = way["limit"]
            geom = way["geom"]
            for i in range(len(geom) - 1):
                alat, alng = geom[i]
                blat, blng = geom[i + 1]
                seg = (alat, alng, blat, blng, limit)
                # A segment can span cells, so register it in every cell its
                # bounding box touches — otherwise a long motorway link would be
                # invisible to points in the middle of it.
                for cy in range(int(math.floor(min(alat, blat) / CELL_DEG)),
                                int(math.floor(max(alat, blat) / CELL_DEG)) + 1):
                    for cx in range(int(math.floor(min(alng, blng) / CELL_DEG)),
                                    int(math.floor(max(alng, blng) / CELL_DEG)) + 1):
                        self.cells.setdefault((cy, cx), []).append(seg)

    def nearest_limit(self, lat: float, lng: float) -> Optional[float]:
        cy = int(math.floor(lat / CELL_DEG))
        cx = int(math.floor(lng / CELL_DEG))
        best = MAX_MATCH_DISTANCE_M
        best_limit: Optional[float] = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for alat, alng, blat, blng, limit in self.cells.get((cy + dy, cx + dx), ()):
                    d = _segment_distance_m(lat, lng, alat, alng, blat, blng)
                    if d < best:
                        best = d
                        best_limit = limit
        return best_limit

    def __len__(self) -> int:
        return len(self.cells)


def _segment_distance_m(
    plat: float, plng: float, alat: float, alng: float, blat: float, blng: float
) -> float:
    """Approximate metres from a point to the segment a→b.

    Equirectangular projection: at street scale the error is centimetres, and
    this is the innermost loop of the whole module.
    """
    lat_scale = 111_320.0
    lng_scale = 111_320.0 * math.cos(math.radians(plat))
    px, py = plng * lng_scale, plat * lat_scale
    ax, ay = alng * lng_scale, alat * lat_scale
    bx, by = blng * lng_scale, blat * lat_scale

    dx, dy = bx - ax, by - ay
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - ax, py - ay)
    tt = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    tt = 0.0 if tt < 0.0 else (1.0 if tt > 1.0 else tt)
    return math.hypot(px - (ax + tt * dx), py - (ay + tt * dy))


def _point_distance_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat_scale = 111_320.0
    lng_scale = 111_320.0 * math.cos(math.radians(a[0]))
    return math.hypot((b[1] - a[1]) * lng_scale, (b[0] - a[0]) * lat_scale)


def _fill_gaps(
    raw: List[Optional[float]], points: Sequence[Tuple[float, float]]
) -> List[Optional[float]]:
    """Let unmatched points inherit a *nearby* matched neighbour's limit.

    A point misses for boring reasons — GPS drift between buildings, a car park,
    a road OSM doesn't have. Over a few metres it hasn't changed road, so the
    neighbouring limit is the best answer available.

    Only within GAP_FILL_MAX_M, though. Filling without a distance bound looks
    fine on a fully-resolved route and is catastrophic on a partly-resolved one:
    a single matched point can otherwise dictate the limit for kilometres of
    road it has nothing to do with. Points still unknown stay None, and the
    caller renders them as the lenient default.
    """
    n = len(raw)
    filled: List[Optional[float]] = list(raw)

    # Forward: carry the last match while it stays close enough.
    anchor: Optional[int] = None
    for i in range(n):
        if raw[i] is not None:
            anchor = i
        elif anchor is not None and _point_distance_m(points[anchor], points[i]) <= GAP_FILL_MAX_M:
            filled[i] = raw[anchor]

    # Backward: same, for points before the first match (or after a long gap).
    anchor = None
    for i in range(n - 1, -1, -1):
        if raw[i] is not None:
            anchor = i
        elif (
            filled[i] is None
            and anchor is not None
            and _point_distance_m(points[anchor], points[i]) <= GAP_FILL_MAX_M
        ):
            filled[i] = raw[anchor]

    return filled


def limits_for_route(
    points: Sequence[Tuple[float, float]],
    db: Session,
    budget_s: float = DEFAULT_BUDGET_S,
    allow_fetch: bool = True,
) -> Optional[List[Optional[float]]]:
    """Per-point speed limits in km/h, aligned 1:1 with `points`.

    Individual entries may be None where no road was near enough to be sure —
    `analyze_drive` reads those as "unknown road" and stays lenient for that
    point. The whole result is None when coverage is too thin to judge the drive
    by at all, which tells the caller to skip speed limits entirely.

    `budget_s` caps total wall-clock spent on network fetches. Cached tiles are
    always used regardless; only uncached ones compete for the budget, and any
    that don't make it are simply missing (their points inherit a neighbour's
    limit). Set `allow_fetch=False` for a cache-only lookup.
    """
    if not points:
        return None

    started = time.monotonic()
    tiles = _tiles_for(points)
    origins = {key: (lat0, lng0) for key, lat0, lng0 in tiles}
    cached = _read_cache(list(origins), db)

    ways: List[dict] = []
    stale_or_missing: List[str] = []
    fresh_cutoff = datetime.utcnow() - TILE_TTL
    for key in origins:
        row = cached.get(key)
        if row and row.fetched_at >= fresh_cutoff:
            decoded = _decode(row)
            if decoded is not None:
                ways.extend(decoded)
                continue
        stale_or_missing.append(key)

    fetched: Dict[str, List[dict]] = {}
    fetchable = [k for k in stale_or_missing if not _is_backed_off(k)]
    if fetchable and allow_fetch:
        remaining = budget_s - (time.monotonic() - started)
        if remaining > 1.0:
            workers = min(MAX_PARALLEL_FETCHES, len(fetchable))
            # Deliberately not a `with` block: its __exit__ joins every worker,
            # which would wait out the slowest fetch and make the budget a lie.
            pool = ThreadPoolExecutor(max_workers=workers)
            futures = {
                pool.submit(_fetch_tile, *origins[key]): key for key in fetchable
            }
            try:
                for future in as_completed(futures, timeout=remaining):
                    key = futures[future]
                    try:
                        result = future.result()
                    except _RateLimited:
                        # Overpass is throttling us. The remaining tiles would
                        # get the same answer, so stop asking — hammering a
                        # rate limit is how you earn a longer one.
                        logger.info("overpass throttling; deferring remaining tiles")
                        for k in fetchable:
                            if k not in fetched:
                                _mark_failed(k)
                        break
                    except Exception:  # noqa: BLE001 — one tile's transport error
                        _mark_failed(key)
                        continue
                    if result is None:
                        _mark_failed(key)
                    else:
                        # An empty list is a real answer — a tile with no
                        # drivable roads. Cache it, or we re-ask every drive.
                        fetched[key] = result
                        _mark_ok(key)
            except Exception as exc:  # noqa: BLE001 — budget spent
                for k in fetchable:
                    if k not in fetched:
                        _mark_failed(k)
                logger.info(
                    "speed-limit fetch stopped early (%s); %d/%d tiles in",
                    type(exc).__name__, len(fetched), len(fetchable),
                )
            # Threads already in flight can't be cancelled, but each carries its
            # own socket timeout and nothing downstream waits on them.
            pool.shutdown(wait=False, cancel_futures=True)

    for key in stale_or_missing:
        if key in fetched:
            ways.extend(fetched[key])
        else:
            # Expired beats absent: stale road data is still real road data.
            row = cached.get(key)
            if row:
                decoded = _decode(row)
                if decoded is not None:
                    ways.extend(decoded)

    _save_cache(fetched, origins, cached, db)

    if not ways:
        logger.info("no road data for %d tile(s); using flat default", len(origins))
        return None

    index = _Index(ways)
    raw: List[Optional[float]] = [index.nearest_limit(lat, lng) for lat, lng in points]
    filled = _fill_gaps(raw, points)
    matched = sum(1 for v in filled if v is not None)
    ratio = matched / len(points)
    logger.info(
        "speed limits: %d/%d points (%.0f%%) across %d tile(s), %d fetched, %.1fs",
        matched, len(points), ratio * 100, len(origins), len(fetched),
        time.monotonic() - started,
    )

    if ratio < MIN_MATCH_RATIO:
        # Usually a cold tile cache or a throttled fetch. Scoring speeding off
        # this little road data would invent penalties; the cache fills in on
        # later drives and this starts working on its own.
        logger.info(
            "coverage %.0f%% below %.0f%% — scoring without speed limits",
            ratio * 100, MIN_MATCH_RATIO * 100,
        )
        return None

    # Entries may still be None where no road was near. That's deliberate:
    # analyze_drive reads None as "unknown road" and applies its lenient
    # fallback for that point alone.
    return filled


# --- Warming the cache while the drive is still happening --------------------
#
# Ending a drive shouldn't wait on a map server, and it shouldn't matter whether
# that server happened to be healthy in that one second. Telemetry arrives for
# minutes beforehand and tells us exactly which tiles the drive needs, so we
# fetch them as we go. By the time the drive ends the rollup is a local read.
#
# Strictly best-effort: one background worker, deduped, never surfaced. If it
# does nothing at all, scoring still works — it just falls back to lenient.

_warm_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tile-warm")
_warm_seen: set = set()
_warm_lock = threading.Lock()

# A cap so a very long drive can't grow this without bound. Cleared wholesale
# rather than evicted: it's a dedupe hint, and re-warming a tile is harmless.
_WARM_SEEN_MAX = 2048


def warm_tile(lat: float, lng: float) -> None:
    """Queue a background fetch of the tile under this point, if it isn't cached.

    Safe to call on every telemetry sample — the work is deduped by tile, so a
    drive that stays on one 2 km tile enqueues exactly one job.
    """
    key = _tile_key(lat, lng)
    with _warm_lock:
        if key in _warm_seen:
            return
        if len(_warm_seen) >= _WARM_SEEN_MAX:
            _warm_seen.clear()
        _warm_seen.add(key)
    try:
        _warm_pool.submit(_warm_one, key, *_tile_origin(lat, lng))
    except RuntimeError:
        pass  # interpreter shutting down


def _warm_one(key: str, lat0: float, lng0: float) -> None:
    from app.database import new_session  # local: avoids an import cycle

    def retry_later() -> None:
        _mark_failed(key)
        with _warm_lock:
            _warm_seen.discard(key)  # a later sample re-queues it, past backoff

    if _is_backed_off(key):
        return
    try:
        with new_session() as db:
            cached = _read_cache([key], db)
            row = cached.get(key)
            if row and row.fetched_at >= datetime.utcnow() - TILE_TTL:
                return
            ways = _fetch_tile(lat0, lng0, timeout_s=WARM_FETCH_TIMEOUT_S)
            if ways is None:
                retry_later()
                return
            _save_cache({key: ways}, {key: (lat0, lng0)}, cached, db)
            _mark_ok(key)
            logger.info("warmed road tile %s (%d ways)", key, len(ways))
    except _RateLimited:
        retry_later()
    except Exception as exc:  # noqa: BLE001 — warming must never affect a drive
        logger.warning("tile warm failed for %s: %s", key, exc)


def limits_for_telemetry(
    points: Sequence, db: Session, **kwargs
) -> Optional[List[Optional[float]]]:
    """`limits_for_route` over TelemetryPoint rows.

    The result lines up with the points *in the order given*, which is the order
    `analyze_drive` receives them — it sorts by timestamp internally but carries
    each limit along with its own point, so callers needn't pre-sort.

    Bails out entirely if any point is missing coordinates rather than skipping
    it: a shorter list would silently misalign limits with points, which is a
    far worse failure than not having limits at all.
    """
    if len(points) < 2:
        return None
    coords: List[Tuple[float, float]] = []
    for p in points:
        if p.latitude is None or p.longitude is None:
            return None
        coords.append((p.latitude, p.longitude))
    return limits_for_route(coords, db, **kwargs)
