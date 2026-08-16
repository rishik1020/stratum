"""Tests for map-matched road speed limits and the speeding half of the score.

Nothing here touches the network. `_fetch_tile` is stubbed with a fixed toy
road network, which is the whole point: the matching, gap-filling, caching and
scoring behaviour has to be verifiable without depending on Overpass being up.

Run directly (no pytest needed):   python tests/test_speed_limits.py
"""
import os
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# A throwaway DB, set before the app is imported.
_DB_FILE = os.path.join(tempfile.gettempdir(), "stratum_test_speed_limits.db")
if os.path.exists(_DB_FILE):
    os.remove(_DB_FILE)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE}"
os.environ.setdefault("STRATUM_SECRET_KEY", "test-only-key")

from sqlmodel import Session, SQLModel, create_engine, select  # noqa: E402

from app import speed_limits as sl  # noqa: E402
from app.analytics import UNKNOWN_LIMIT_KMH, analyze_drive  # noqa: E402
from app.models import RoadTile  # noqa: E402

engine = create_engine(f"sqlite:///{_DB_FILE}")
SQLModel.metadata.create_all(engine)


# --- A toy road network ------------------------------------------------------
# Two roads crossing near Hyderabad's Hitec City, at very different limits:
#   - an east-west 30 km/h residential street along lat 17.4400
#   - a north-south 100 km/h motorway along lng 78.3800
RESIDENTIAL = {
    "limit": 30.0,
    "geom": [[17.4400, 78.3700], [17.4400, 78.3900]],
}
MOTORWAY = {
    "limit": 100.0,
    "geom": [[17.4300, 78.3800], [17.4500, 78.3800]],
}

fetch_calls: list = []


def fake_fetch(lat0, lng0):
    """Stand-in for Overpass. Records every call so we can assert on caching."""
    fetch_calls.append((round(lat0, 4), round(lng0, 4)))
    return [RESIDENTIAL, MOTORWAY]


def failing_fetch(lat0, lng0):
    fetch_calls.append((round(lat0, 4), round(lng0, 4)))
    return None


sl._fetch_tile = fake_fetch


def fresh_db() -> Session:
    """A session against an empty roadtile cache and no carried-over backoff."""
    with Session(engine) as db:
        for row in db.exec(select(RoadTile)).all():
            db.delete(row)
        db.commit()
    fetch_calls.clear()
    sl._failed_until.clear()
    return Session(engine)


# --- maxspeed parsing --------------------------------------------------------


def test_parses_the_maxspeed_forms_osm_actually_contains():
    assert sl._parse_maxspeed("50") == 50.0
    assert sl._parse_maxspeed("60 km/h") == 60.0
    assert round(sl._parse_maxspeed("30 mph"), 1) == 48.3
    # Country-code and non-numeric forms carry no number we can trust.
    assert sl._parse_maxspeed("IN:urban") is None
    assert sl._parse_maxspeed("none") is None
    assert sl._parse_maxspeed("signals") is None
    assert sl._parse_maxspeed("") is None
    assert sl._parse_maxspeed(None) is None


def test_untagged_roads_fall_back_to_their_highway_class():
    # Every class we whitelist in the Overpass query must have a fallback, or
    # those roads silently vanish from matching.
    for cls in sl.DRIVABLE.split("|"):
        assert cls in sl.HIGHWAY_DEFAULTS, f"no fallback limit for highway={cls}"


# --- tiling ------------------------------------------------------------------


def test_route_within_one_tile_fetches_once():
    db = fresh_db()
    pts = [(17.4400, 78.3750 + i * 0.0001) for i in range(20)]
    sl.limits_for_route(pts, db)
    assert len(fetch_calls) == 1, fetch_calls
    db.close()


def test_second_drive_on_the_same_roads_hits_cache_and_never_refetches():
    db = fresh_db()
    pts = [(17.4400, 78.3750 + i * 0.0001) for i in range(20)]
    sl.limits_for_route(pts, db)
    assert len(fetch_calls) == 1
    limits = sl.limits_for_route(pts, db)
    assert len(fetch_calls) == 1, "cached tile was re-fetched"
    assert limits and all(v == 30.0 for v in limits)
    db.close()


# --- matching ----------------------------------------------------------------


def test_points_snap_to_the_road_they_are_actually_on():
    db = fresh_db()
    limits = sl.limits_for_route(
        [
            (17.4400, 78.3750),  # on the residential street
            (17.4350, 78.3800),  # on the motorway
            (17.4400, 78.3850),  # residential again
        ],
        db,
    )
    assert limits == [30.0, 100.0, 30.0], limits
    db.close()


def test_result_is_always_the_same_length_as_the_input():
    db = fresh_db()
    pts = [(17.4400, 78.3700 + i * 0.0002) for i in range(37)]
    limits = sl.limits_for_route(pts, db)
    assert limits is not None and len(limits) == len(pts)
    db.close()


def test_a_point_just_off_the_road_inherits_its_neighbours_limit():
    db = fresh_db()
    # 60 m north of the street — GPS bouncing off a building. Close enough that
    # the driver is obviously still on the same road.
    limits = sl.limits_for_route(
        [(17.4400, 78.3750), (17.44055, 78.3750), (17.4400, 78.3760)], db
    )
    assert limits == [30.0, 30.0, 30.0], limits
    db.close()


def test_leading_unmatched_points_backfill_from_a_nearby_match():
    db = fresh_db()
    limits = sl.limits_for_route(
        [(17.44055, 78.3750), (17.44050, 78.3755), (17.4400, 78.3760)], db
    )
    assert limits == [30.0, 30.0, 30.0], limits
    db.close()


def test_a_faraway_point_does_not_inherit_a_limit():
    """The failure that broke the first live run.

    With unbounded gap-fill, one matched 20 km/h service road propagated across
    319 of 320 points on a partly-resolved 16 km route — which would score an
    ordinary main-road drive as 200% over the limit for its whole length. A
    point kilometres from any known road must stay unknown.
    """
    db = fresh_db()
    pts = [(17.4400, 78.3750)] + [(17.4400 + 0.01 * i, 78.3300) for i in range(1, 4)]
    limits = sl.limits_for_route(pts, db)
    # Coverage is 1/4, under the floor, so the whole lookup declines to guess.
    assert limits is None, limits
    db.close()


def test_thin_coverage_declines_to_score_at_all():
    db = fresh_db()
    # One point on a known road, nine scattered kilometres away.
    pts = [(17.4400, 78.3750)] + [(17.4400, 78.30 + i * 0.01) for i in range(9)]
    assert sl.limits_for_route(pts, db) is None
    db.close()


def test_good_coverage_with_a_few_holes_still_scores():
    db = fresh_db()
    # Eight points on the street, two far away: 80% coverage, above the floor.
    pts = [(17.4400, 78.3700 + i * 0.001) for i in range(8)]
    pts += [(17.5400, 78.3000), (17.5500, 78.3000)]
    limits = sl.limits_for_route(pts, db)
    assert limits is not None
    assert len(limits) == len(pts)
    assert limits[:8] == [30.0] * 8
    # The two strays stay None — "unknown road", which analyze_drive treats
    # leniently for those points alone rather than inventing a limit.
    assert limits[8:] == [None, None], limits[8:]
    db.close()


def test_no_road_data_anywhere_returns_none_not_a_guess():
    db = fresh_db()
    sl._fetch_tile = failing_fetch
    try:
        limits = sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
    finally:
        sl._fetch_tile = fake_fetch
    # None is the signal to stay on the lenient flat default. Anything else
    # would be fabricating limits for roads we never resolved.
    assert limits is None
    db.close()


def test_a_failed_fetch_is_not_cached_as_an_answer():
    db = fresh_db()
    sl._fetch_tile = failing_fetch
    try:
        sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
    finally:
        sl._fetch_tile = fake_fetch
    rows = db.exec(select(RoadTile)).all()
    assert rows == [], "a network failure got cached as 'this tile has no roads'"
    db.close()


def test_a_failing_tile_is_not_retried_on_every_single_lookup():
    """An outage must cost the budget once, not per call.

    The first live run spent 15s failing to reach Overpass, then the very next
    call spent another 15s failing at exactly the same tiles. Ending a drive
    can't pay that repeatedly.
    """
    db = fresh_db()
    sl._fetch_tile = failing_fetch
    try:
        sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
        first = len(fetch_calls)
        assert first >= 1
        sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
        assert len(fetch_calls) == first, "backed-off tile was retried immediately"
    finally:
        sl._fetch_tile = fake_fetch
    db.close()


def test_backoff_expires_so_recovery_is_automatic():
    db = fresh_db()
    sl._fetch_tile = failing_fetch
    try:
        sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
    finally:
        sl._fetch_tile = fake_fetch
    # Overpass comes back; once the backoff lapses we must pick it up again
    # without anyone restarting anything.
    for key in list(sl._failed_until):
        sl._failed_until[key] = 0.0
    limits = sl.limits_for_route([(17.44, 78.375), (17.44, 78.376)], db)
    assert limits == [30.0, 30.0], limits
    db.close()


def test_cache_only_mode_never_touches_the_network():
    db = fresh_db()
    limits = sl.limits_for_route(
        [(17.4400, 78.3750), (17.4400, 78.3760)], db, allow_fetch=False
    )
    assert fetch_calls == []
    assert limits is None  # nothing cached yet, and it refused to go fetch
    db.close()


# --- scoring with real limits ------------------------------------------------


@dataclass
class FakePoint:
    timestamp: datetime
    speed_kmh: float
    heading_deg: Optional[float] = None
    cumulative_distance_m: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


BASE = datetime(2024, 6, 1, 12, 0, 0)


def cruise(speed_kmh, seconds=120):
    ms = speed_kmh / 3.6
    return [
        FakePoint(
            timestamp=BASE + timedelta(seconds=i),
            speed_kmh=speed_kmh,
            heading_deg=90.0,
            cumulative_distance_m=ms * i,
            latitude=17.44,
            longitude=78.375,
        )
        for i in range(seconds + 1)
    ]


def test_the_bug_this_whole_module_exists_to_fix():
    """60 km/h down a 30 km/h street used to score a clean 100 on Safety."""
    pts = cruise(60.0)
    without = analyze_drive(pts)
    assert without.events.speeding_ratio == 0.0
    assert without.score.safety == 100

    with_limits = analyze_drive(pts, speed_limits=[30.0] * len(pts))
    assert with_limits.events.speeding_ratio > 0.9, with_limits.events
    assert with_limits.score.safety < 60, with_limits.score


def test_a_few_kmh_over_is_not_speeding():
    """GPS error and speedometer variance put everyone slightly 'over'. If the
    score punished that, every drive would be flagged and the number would stop
    meaning anything."""
    pts = cruise(62.0)  # 2 km/h over a 60 limit
    a = analyze_drive(pts, speed_limits=[60.0] * len(pts))
    assert a.events.speeding_ratio == 0.0, a.events
    assert a.score.safety == 100


def test_how_far_over_matters_not_just_how_long():
    pts = cruise(120)
    slight = analyze_drive(cruise(70.0), speed_limits=[60.0] * len(pts))
    gross = analyze_drive(cruise(110.0), speed_limits=[60.0] * len(pts))
    # Both are over for the entire drive...
    assert slight.events.speeding_ratio > 0.9
    assert gross.events.speeding_ratio > 0.9
    # ...but nearly double the limit has to cost more than 10 km/h over.
    assert gross.events.speeding_severity > slight.events.speeding_severity
    assert gross.score.safety < slight.score.safety - 10, (slight.score, gross.score)


def two_road_drive():
    """90 km/h on a 100 road, then 40 km/h in a 30 zone.

    Deliberately asymmetric in both speed and limit. A constant-speed drive with
    a symmetric limit pattern is useless for these tests: pairing every limit
    with the wrong point produces identical numbers, so the test passes while
    the bug it exists to catch sails through.

    Correctly paired, the only speeding is the second half, and only by
    10 km/h. Mispaired, the fast half lands in the 30 zone — 60 km/h over.
    """
    pts, limits = [], []
    dist = 0.0
    for i in range(121):
        fast = i < 60
        speed = 90.0 if fast else 40.0
        dist += speed / 3.6
        pts.append(
            FakePoint(
                timestamp=BASE + timedelta(seconds=i),
                speed_kmh=speed,
                heading_deg=90.0,
                cumulative_distance_m=dist,
                latitude=17.44,
                longitude=78.375,
            )
        )
        limits.append(100.0 if fast else 30.0)
    return pts, limits


def test_limits_are_matched_to_their_own_point_across_a_changing_road():
    """Each stretch is judged against the road it was actually driven on."""
    pts, limits = two_road_drive()
    a = analyze_drive(pts, speed_limits=limits)
    # 90 in a 100 zone is fine; 40 in a 30 zone is 10 km/h over, for half the drive.
    assert round(a.events.speeding_ratio, 2) == 0.5, a.events
    assert round(a.events.max_over_limit_kmh) == 10, a.events


def test_points_out_of_order_keep_their_own_limits():
    """analyze_drive sorts by timestamp internally. If limits were applied by
    position after that sort, a caller handing points in any other order would
    have every point scored against a different road."""
    pts, limits = two_road_drive()
    in_order = analyze_drive(pts, speed_limits=limits)

    pairs = list(zip(pts, limits))[::-1]
    out_of_order = analyze_drive(
        [p for p, _ in pairs], speed_limits=[lim for _, lim in pairs]
    )

    assert out_of_order.events.speeding_ratio == in_order.events.speeding_ratio
    assert out_of_order.events.speeding_severity == in_order.events.speeding_severity
    # The decisive one: mispairing puts the 90 km/h stretch in the 30 zone.
    assert out_of_order.events.max_over_limit_kmh == in_order.events.max_over_limit_kmh
    assert out_of_order.score.safety == in_order.score.safety


def test_no_limits_falls_back_leniently_and_says_so():
    a = analyze_drive(cruise(90.0))
    assert a.events.limits_matched is False
    # 90 km/h under the unknown-road fallback is not speeding — we don't punish
    # a driver because a map server was unreachable.
    assert UNKNOWN_LIMIT_KMH == 120.0
    assert a.events.speeding_ratio == 0.0

    b = analyze_drive(cruise(90.0), speed_limits=[50.0] * 121)
    assert b.events.limits_matched is True


def test_peak_excess_is_reported_for_the_coach():
    pts = cruise(80.0)
    a = analyze_drive(pts, speed_limits=[50.0] * len(pts))
    assert round(a.events.max_over_limit_kmh) == 30, a.events
    assert any("30 km/h over" in e for e in a.insights.explanations), a.insights


def test_end_to_end_route_lookup_feeds_the_score():
    """The real path: coordinates -> limits_for_route -> analyze_drive."""
    db = fresh_db()
    pts = cruise(60.0)
    limits = sl.limits_for_route([(p.latitude, p.longitude) for p in pts], db)
    db.close()
    assert limits and all(v == 30.0 for v in limits)
    a = analyze_drive(pts, speed_limits=limits)
    assert a.events.limits_matched is True
    assert a.score.safety < 60, a.score


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
