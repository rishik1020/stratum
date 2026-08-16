"""Drive analytics & driving-score engine.

Pure, deterministic functions over an ordered telemetry stream. No DB, no I/O —
so it is trivially unit-testable and can run in a request, a background job, or a
test. Implements feature areas 1 (Drive Analytics), 2 (Driving Score), and the
deterministic half of 9 (AI Coach insights) from the analytics design.

Input: an iterable of point-like objects exposing
    timestamp (datetime), speed_kmh (float), and optionally
    heading_deg, latitude, longitude, cumulative_distance_m, distance_delta_m.

Real road speed limits come from `app.speed_limits`, which does the (impure)
map-matching and passes the result in as a plain parallel list — the map lookup
lives outside so this module stays pure.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Iterable, List, Optional, Sequence

# --- Tunable thresholds (see ANALYTICS_ARCHITECTURE.md §3) --------------------
MOVING_MS = 3 / 3.6              # 3 km/h in m/s — below this the car is "idle"
HARSH_BRAKE_MS2 = -3.0           # ≈ -0.31 g
RAPID_ACCEL_MS2 = 2.8            # ≈ 0.29 g
SHARP_CORNER_MS2 = 4.0          # lateral accel ≈ 0.41 g (needs heading)
MIN_DT = 0.1                     # clamp tiny Δt so derived accel doesn't explode
DAY_START_HOUR, DAY_END_HOUR = 6, 18

# The limit assumed when no road could be matched at all — Overpass unreachable,
# or a drive somewhere OSM has no roads for. Deliberately lenient: if we don't
# know what road someone was on, we must not accuse them of speeding on it.
UNKNOWN_LIMIT_KMH = 120.0

# Nobody is "speeding" at 3 km/h over. Consumer GPS speed carries a couple of
# km/h of error, speedometers read high by design, and OSM limits are
# approximate. Flag only past a tolerance — the larger of a flat margin and a
# fraction of the limit, so it scales from a 20 km/h lane to a motorway.
SPEEDING_TOLERANCE_KMH = 5.0
SPEEDING_TOLERANCE_FRAC = 0.07

# Fraction over the limit at which the speeding penalty saturates. 0.5 means
# 60 in a 40 zone is as bad as the model gets — beyond that it's already maxed.
SPEEDING_SEVERITY_FULL = 0.5

# Rough fuel economy fallback by fuel type (L/100km); overridden by real vehicle data.
_ECON_BY_FUEL = {"gasoline": 8.5, "petrol": 8.5, "diesel": 6.5, "hybrid": 5.0}
_CO2_G_PER_L = {"gasoline": 2310.0, "petrol": 2310.0, "diesel": 2680.0, "hybrid": 2310.0}


@dataclass
class _P:
    t: float
    hour: int
    speed_ms: float
    heading: Optional[float]
    cumdist: Optional[float]
    delta: Optional[float]
    lat: Optional[float]
    lng: Optional[float]
    # The limit on the road under *this* point. Carried on the point rather than
    # passed alongside, because _prepare sorts by timestamp — a parallel list
    # would silently pair each limit with the wrong point.
    limit_ms: float = UNKNOWN_LIMIT_KMH / 3.6


@dataclass
class DriveMetrics:
    point_count: int
    distance_m: float
    duration_s: float
    moving_time_s: float
    idle_time_s: float
    avg_speed_kmh: float
    avg_moving_speed_kmh: float
    max_speed_kmh: float
    min_moving_speed_kmh: float
    stop_count: int
    day_ratio: float
    night_ratio: float
    fuel_liters_est: Optional[float]
    co2_grams_est: Optional[float]
    elevation_gain_m: Optional[float]
    elevation_loss_m: Optional[float]
    start_lat: Optional[float]
    start_lng: Optional[float]
    end_lat: Optional[float]
    end_lng: Optional[float]


@dataclass
class EventCounts:
    harsh_braking: int = 0
    rapid_acceleration: int = 0
    sharp_cornering: int = 0
    speeding_seconds: float = 0.0
    speeding_ratio: float = 0.0
    # How far over, not just how long. Time-weighted mean of "fraction over the
    # limit", normalised so 1.0 means the whole drive was at or past
    # SPEEDING_SEVERITY_FULL. Without this, 1 km/h over scores the same as 50.
    speeding_severity: float = 0.0
    # The worst single moment, km/h over the limit — the number a driver
    # actually recognises from their own drive.
    max_over_limit_kmh: float = 0.0
    # Whether real map-matched limits were used, or the flat fallback. Surfaced
    # so the UI never presents a guess as a measurement.
    limits_matched: bool = False


@dataclass
class DriveScore:
    overall: int
    safety: int
    eco: int
    performance: int
    comfort: int


@dataclass
class CoachInsights:
    summary: str
    smooth_pct: int
    strengths: List[str] = field(default_factory=list)
    weaknesses: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    explanations: List[str] = field(default_factory=list)


@dataclass
class DriveAnalytics:
    status: str
    metrics: DriveMetrics
    events: EventCounts
    score: DriveScore
    insights: CoachInsights


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _heading_delta(h2: float, h1: float) -> float:
    """Smallest signed angle h2-h1 in degrees, handling 0/360 wraparound."""
    return ((h2 - h1 + 180.0) % 360.0) - 180.0


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: List[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _percentile(xs: List[float], p: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    k = (len(s) - 1) * p
    lo = math.floor(k)
    hi = math.ceil(k)
    if lo == hi:
        return s[int(k)]
    return s[lo] * (hi - k) + s[hi] * (k - lo)


def _prepare(points: Iterable, speed_limits: Optional[Sequence[float]] = None) -> List[_P]:
    """Normalise points, attaching each one's speed limit before sorting.

    `speed_limits` is parallel to `points` in the order given. It's zipped in
    here rather than used later precisely because of the sort below: pairing a
    sorted point list against an unsorted limit list would quietly score every
    point against the wrong road.
    """
    prepared: List[_P] = []
    limits = list(speed_limits) if speed_limits is not None else None
    for i, p in enumerate(points):
        ts: datetime = p.timestamp
        if limits is not None and i < len(limits) and limits[i] and limits[i] > 0:
            limit_ms = limits[i] / 3.6
        else:
            limit_ms = UNKNOWN_LIMIT_KMH / 3.6
        prepared.append(
            _P(
                t=ts.timestamp(),
                hour=ts.hour,
                speed_ms=max(0.0, (p.speed_kmh or 0.0)) / 3.6,
                heading=getattr(p, "heading_deg", None),
                cumdist=getattr(p, "cumulative_distance_m", None),
                delta=getattr(p, "distance_delta_m", None),
                lat=getattr(p, "latitude", None),
                lng=getattr(p, "longitude", None),
                limit_ms=limit_ms,
            )
        )
    prepared.sort(key=lambda x: x.t)
    return prepared


def compute_metrics(pts: List[_P], fuel_type: Optional[str], econ_l_per_100km: Optional[float]) -> DriveMetrics:
    n = len(pts)
    duration = max(0.0, pts[-1].t - pts[0].t)

    # Distance: prefer device cumulative, then summed deltas, then ∫v·dt.
    cum = [p.cumdist for p in pts if p.cumdist is not None]
    deltas = [p.delta for p in pts if p.delta is not None]
    if cum:
        distance = max(cum)
    elif deltas:
        distance = sum(deltas)
    else:
        distance = 0.0
        for a, b in zip(pts, pts[1:]):
            dt = max(MIN_DT, b.t - a.t)
            distance += (a.speed_ms + b.speed_ms) / 2 * dt

    moving_time = day_time = night_time = 0.0
    stop_count = 0
    prev_moving = pts[0].speed_ms > MOVING_MS
    for a, b in zip(pts, pts[1:]):
        dt = b.t - a.t
        if dt <= 0:
            continue
        moving = a.speed_ms > MOVING_MS
        if moving:
            moving_time += dt
        if DAY_START_HOUR <= a.hour < DAY_END_HOUR:
            day_time += dt
        else:
            night_time += dt
        if prev_moving and not moving:
            stop_count += 1
        prev_moving = moving

    idle_time = max(0.0, duration - moving_time)
    speeds_kmh = [p.speed_ms * 3.6 for p in pts]
    moving_speeds = [p.speed_ms * 3.6 for p in pts if p.speed_ms > MOVING_MS]
    avg_speed = (distance / duration * 3.6) if duration > 0 else 0.0
    avg_moving = (distance / moving_time * 3.6) if moving_time > 0 else 0.0

    # Fuel & CO2 estimate (gasoline-equivalent). Electric reports no liquid fuel.
    fuel_l = co2_g = None
    ftype = (fuel_type or "gasoline").lower()
    if ftype not in ("electric", "ev"):
        econ = econ_l_per_100km or _ECON_BY_FUEL.get(ftype, 8.5)
        fuel_l = distance / 1000.0 / 100.0 * econ
        co2_g = fuel_l * _CO2_G_PER_L.get(ftype, 2310.0)

    return DriveMetrics(
        point_count=n,
        distance_m=round(distance, 1),
        duration_s=round(duration, 1),
        moving_time_s=round(moving_time, 1),
        idle_time_s=round(idle_time, 1),
        avg_speed_kmh=round(avg_speed, 1),
        avg_moving_speed_kmh=round(avg_moving, 1),
        max_speed_kmh=round(max(speeds_kmh), 1) if speeds_kmh else 0.0,
        min_moving_speed_kmh=round(min(moving_speeds), 1) if moving_speeds else 0.0,
        stop_count=stop_count,
        day_ratio=round(day_time / duration, 3) if duration > 0 else 0.0,
        night_ratio=round(night_time / duration, 3) if duration > 0 else 0.0,
        fuel_liters_est=round(fuel_l, 2) if fuel_l is not None else None,
        co2_grams_est=round(co2_g, 0) if co2_g is not None else None,
        # Elevation needs GPS altitude, which we don't capture yet — see roadmap.
        elevation_gain_m=None,
        elevation_loss_m=None,
        start_lat=pts[0].lat,
        start_lng=pts[0].lng,
        end_lat=pts[-1].lat,
        end_lng=pts[-1].lng,
    )


def _derive(pts: List[_P], limits_matched: bool):
    """Return (events, accels, jerks, smooth_segments, total_segments).

    Each segment is judged against the limit on the road under its *start*
    point, so a drive that moves between a 30 zone and a motorway is scored
    against each road in turn rather than one blended number.
    """
    events = EventCounts(limits_matched=limits_matched)
    accels: List[float] = []
    jerks: List[float] = []
    smooth_segments = 0
    total_segments = 0
    duration = max(0.0, pts[-1].t - pts[0].t)
    prev_a: Optional[float] = None
    severity_seconds = 0.0

    for a, b in zip(pts, pts[1:]):
        dt_raw = b.t - a.t
        if dt_raw <= 0:
            continue
        dt = max(MIN_DT, dt_raw)
        accel = (b.speed_ms - a.speed_ms) / dt
        accels.append(accel)
        total_segments += 1

        if accel <= HARSH_BRAKE_MS2:
            events.harsh_braking += 1
        if accel >= RAPID_ACCEL_MS2:
            events.rapid_acceleration += 1

        # Speeding, judged past a tolerance and weighted by how far over.
        limit_ms = a.limit_ms
        threshold = limit_ms + max(
            SPEEDING_TOLERANCE_KMH / 3.6, limit_ms * SPEEDING_TOLERANCE_FRAC
        )
        over = a.speed_ms > threshold
        if over:
            events.speeding_seconds += dt_raw
            # Measured from the limit itself, not the tolerated threshold — the
            # tolerance decides *whether* to count it, not how badly.
            excess = (a.speed_ms - limit_ms) / limit_ms if limit_ms > 0 else 0.0
            severity_seconds += dt_raw * min(1.0, excess / SPEEDING_SEVERITY_FULL)
            events.max_over_limit_kmh = max(
                events.max_over_limit_kmh, (a.speed_ms - limit_ms) * 3.6
            )

        if a.heading is not None and b.heading is not None:
            yaw_rate = math.radians(_heading_delta(b.heading, a.heading)) / dt
            lateral = abs(b.speed_ms * yaw_rate)
            if lateral >= SHARP_CORNER_MS2:
                events.sharp_cornering += 1

        if prev_a is not None:
            jerks.append((accel - prev_a) / dt)
        prev_a = accel

        if abs(accel) < 1.0 and not over:
            smooth_segments += 1

    if duration > 0:
        events.speeding_ratio = round(events.speeding_seconds / duration, 3)
        events.speeding_severity = round(severity_seconds / duration, 3)
    events.speeding_seconds = round(events.speeding_seconds, 1)
    events.max_over_limit_kmh = round(events.max_over_limit_kmh, 1)
    return events, accels, jerks, smooth_segments, total_segments


def compute_scores(metrics: DriveMetrics, events: EventCounts, accels: List[float], jerks: List[float]) -> DriveScore:
    dist_km = max(metrics.distance_m / 1000.0, 0.1)
    duration = max(metrics.duration_s, 1.0)

    hb = events.harsh_braking / dist_km
    ra = events.rapid_acceleration / dist_km
    sc = events.sharp_cornering / dist_km
    idle_ratio = metrics.idle_time_s / duration

    # Safety: penalize aggressive, illegal, and abrupt inputs (per km).
    #
    # Speeding counts twice over: how long you were over the limit, and how far
    # over you went. Duration alone made 1 km/h over cost the same as 50, which
    # only survived as long as the limit was a flat 120 nobody ever reached.
    speeding_penalty = 20 * events.speeding_ratio + 30 * events.speeding_severity
    safety = _clamp(100 - (7 * hb + 5 * ra + 9 * sc + speeding_penalty))

    # Eco: reward smooth throttle, low idle; penalize harsh events.
    accel_std = _std(accels)
    eco = _clamp(100 - 35 * idle_ratio - 12 * accel_std - 4 * (hb + ra))

    # Comfort: reward low jerk and consistent speed.
    mean_abs_jerk = _mean([abs(j) for j in jerks])
    comfort = _clamp(100 - 22 * mean_abs_jerk - 6 * (hb + sc))

    # Performance: reward capability — sustained speed + strong-but-smooth accel.
    maintenance = (metrics.avg_moving_speed_kmh / metrics.max_speed_kmh) if metrics.max_speed_kmh > 0 else 0.0
    p95_accel = _percentile([a for a in accels if a > 0], 0.95)
    capability = _clamp(p95_accel / 3.0, 0.0, 1.0)
    performance = _clamp(40 + 60 * (0.5 * maintenance + 0.5 * capability) - 5 * sc)

    overall = 0.35 * safety + 0.25 * eco + 0.20 * comfort + 0.20 * performance
    return DriveScore(
        overall=round(overall),
        safety=round(safety),
        eco=round(eco),
        performance=round(performance),
        comfort=round(comfort),
    )


def build_insights(metrics: DriveMetrics, events: EventCounts, score: DriveScore, smooth_segments: int, total_segments: int) -> CoachInsights:
    smooth_pct = round(100 * smooth_segments / total_segments) if total_segments else 0
    strengths: List[str] = []
    weaknesses: List[str] = []
    recommendations: List[str] = []
    explanations: List[str] = []

    if events.harsh_braking:
        explanations.append(f"Safety reduced by {events.harsh_braking} harsh-braking event(s).")
        recommendations.append("Brake earlier and more progressively before corners and stops.")
    if events.rapid_acceleration:
        explanations.append(f"Eco/Comfort reduced by {events.rapid_acceleration} rapid-acceleration event(s).")
        recommendations.append("Ease onto the throttle for better fuel economy and a smoother ride.")
    if events.sharp_cornering:
        explanations.append(f"Safety reduced by {events.sharp_cornering} sharp-cornering event(s).")
        recommendations.append("Carry less speed into corners for a cleaner, smoother line.")
    if events.speeding_ratio > 0.05:
        pct = round(events.speeding_ratio * 100)
        over = round(events.max_over_limit_kmh)
        # Only name a number when it came from a real road; otherwise the copy
        # would dress the flat fallback up as a measurement.
        peak = f", peaking at {over} km/h over" if events.limits_matched and over > 0 else ""
        explanations.append(
            f"Safety reduced — over the limit for ~{pct}% of the drive{peak}."
        )
        recommendations.append("Keep within posted limits to protect your Safety score.")
    if metrics.idle_time_s > 0 and metrics.duration_s > 0 and metrics.idle_time_s / metrics.duration_s > 0.2:
        pct = round(metrics.idle_time_s / metrics.duration_s * 100)
        explanations.append(f"Eco reduced — {pct}% of the drive was spent idle.")
        recommendations.append("Reduce idling time to improve your Eco score.")

    if score.safety >= 88:
        strengths.append("Safe, controlled braking and cornering.")
    elif score.safety < 70:
        weaknesses.append("Aggressive or unsafe inputs hurt your Safety score.")
    if score.eco >= 85:
        strengths.append("Fuel-efficient, low-idle driving.")
    elif score.eco < 65:
        weaknesses.append("Throttle and idle habits are costing fuel efficiency.")
    if score.comfort >= 85:
        strengths.append("Very smooth, comfortable inputs.")
    elif score.comfort < 65:
        weaknesses.append("Jerky inputs made the ride less comfortable.")
    if score.performance >= 80:
        strengths.append("Strong, well-controlled performance.")

    summary = f"{smooth_pct}% of this drive was smooth, efficient driving."
    if not recommendations:
        recommendations.append("Great drive — keep it smooth and consistent.")

    return CoachInsights(
        summary=summary,
        smooth_pct=smooth_pct,
        strengths=strengths,
        weaknesses=weaknesses,
        recommendations=recommendations,
        explanations=explanations,
    )


def _empty(status: str) -> DriveAnalytics:
    m = DriveMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, None, None, None, None, None, None, None, None)
    return DriveAnalytics(
        status=status,
        metrics=m,
        events=EventCounts(),
        score=DriveScore(0, 0, 0, 0, 0),
        insights=CoachInsights(summary="Not enough telemetry to analyze this drive.", smooth_pct=0),
    )


def analyze_drive(
    points: Iterable,
    fuel_type: Optional[str] = None,
    econ_l_per_100km: Optional[float] = None,
    speed_limits: Optional[Sequence[float]] = None,
) -> DriveAnalytics:
    """Score one drive.

    `speed_limits` is the road limit in km/h under each point, parallel to
    `points` in the order given — see `app.speed_limits.limits_for_telemetry`.
    Pass None and every point falls back to `UNKNOWN_LIMIT_KMH`, which is
    lenient by design: a drive should never be penalised for roads we couldn't
    identify.
    """
    pts = _prepare(points, speed_limits)
    if len(pts) < 2 or (pts[-1].t - pts[0].t) <= 0:
        return _empty("insufficient_data")

    metrics = compute_metrics(pts, fuel_type, econ_l_per_100km)
    events, accels, jerks, smooth_segments, total_segments = _derive(
        pts, limits_matched=speed_limits is not None
    )
    score = compute_scores(metrics, events, accels, jerks)
    insights = build_insights(metrics, events, score, smooth_segments, total_segments)
    return DriveAnalytics(status="ok", metrics=metrics, events=events, score=score, insights=insights)


def analyze_to_dict(*args, **kwargs) -> dict:
    """Convenience for API/JSON serialization."""
    return asdict(analyze_drive(*args, **kwargs))
