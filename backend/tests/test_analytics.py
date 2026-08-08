"""Deterministic tests for the drive-analytics / scoring engine.

Run directly (no pytest needed):   python tests/test_analytics.py
Or with pytest:                     pytest tests/test_analytics.py
"""
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.analytics import analyze_drive  # noqa: E402


@dataclass
class FakePoint:
    timestamp: datetime
    speed_kmh: float
    heading_deg: Optional[float] = None
    cumulative_distance_m: Optional[float] = None
    distance_delta_m: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


BASE = datetime(2024, 6, 1, 12, 0, 0)  # noon -> day driving


def smooth_drive(seconds=120, speed_kmh=60.0, base=BASE):
    """Constant-speed cruise: no harsh events, fixed heading."""
    pts = []
    ms = speed_kmh / 3.6
    for i in range(seconds + 1):
        pts.append(FakePoint(
            timestamp=base + timedelta(seconds=i),
            speed_kmh=speed_kmh,
            heading_deg=90.0,
            cumulative_distance_m=ms * i,
            latitude=12.9 + i * 1e-5,
            longitude=77.5,
        ))
    return pts


def aggressive_drive(seconds=60, base=BASE):
    """Speed slams between 100 and 20 km/h every second -> many harsh brakes
    and rapid accelerations."""
    pts = []
    for i in range(seconds + 1):
        speed = 100.0 if i % 2 == 0 else 20.0
        pts.append(FakePoint(
            timestamp=base + timedelta(seconds=i),
            speed_kmh=speed,
            heading_deg=90.0,
        ))
    return pts


def test_smooth_scores_high_and_clean():
    a = analyze_drive(smooth_drive(), fuel_type="gasoline")
    assert a.status == "ok"
    assert a.events.harsh_braking == 0
    assert a.events.rapid_acceleration == 0
    assert a.score.safety >= 95, a.score
    assert a.score.comfort >= 90, a.score
    assert 0 <= a.score.overall <= 100
    # ~2 km at 60 km/h over 120 s.
    assert 1900 <= a.metrics.distance_m <= 2100, a.metrics.distance_m
    assert a.metrics.day_ratio == 1.0
    assert a.metrics.fuel_liters_est is not None and a.metrics.fuel_liters_est > 0


def test_aggressive_loses_safety_and_comfort():
    smooth = analyze_drive(smooth_drive())
    aggro = analyze_drive(aggressive_drive())
    assert aggro.events.harsh_braking > 5, aggro.events
    assert aggro.events.rapid_acceleration > 5, aggro.events
    assert aggro.score.safety < smooth.score.safety
    assert aggro.score.comfort < smooth.score.comfort
    assert aggro.score.safety < 50, aggro.score
    # Coach should explain the harsh braking and recommend a fix.
    assert any("harsh-braking" in e for e in aggro.insights.explanations)
    assert len(aggro.insights.recommendations) >= 1


def test_speeding_detected():
    a = analyze_drive(smooth_drive(seconds=60, speed_kmh=160.0))  # well over 120 limit
    assert a.events.speeding_ratio > 0.5, a.events
    assert any("limit" in e for e in a.insights.explanations)


def test_night_driving_ratio():
    night = BASE.replace(hour=23)
    a = analyze_drive(smooth_drive(base=night))
    assert a.metrics.night_ratio == 1.0
    assert a.metrics.day_ratio == 0.0


def test_electric_has_no_liquid_fuel():
    a = analyze_drive(smooth_drive(), fuel_type="electric")
    assert a.metrics.fuel_liters_est is None
    assert a.metrics.co2_grams_est is None


def test_insufficient_data():
    one = [FakePoint(timestamp=BASE, speed_kmh=50.0)]
    a = analyze_drive(one)
    assert a.status == "insufficient_data"
    assert a.score.overall == 0


def test_idle_time_and_stops():
    # Drive 30 s, then idle (0 km/h) 30 s, then drive 30 s -> one stop, ~33% idle.
    pts = []
    ms = 60 / 3.6
    dist = 0.0
    for i in range(91):
        if i < 30 or i >= 60:
            speed = 60.0
            dist += ms
        else:
            speed = 0.0
        pts.append(FakePoint(timestamp=BASE + timedelta(seconds=i), speed_kmh=speed,
                             heading_deg=90.0, cumulative_distance_m=dist))
    a = analyze_drive(pts)
    assert a.metrics.stop_count >= 1, a.metrics
    assert a.metrics.idle_time_s >= 25, a.metrics


ALL = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]


if __name__ == "__main__":
    failures = 0
    for fn in ALL:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(ALL) - failures}/{len(ALL)} passed")
    sys.exit(1 if failures else 0)
