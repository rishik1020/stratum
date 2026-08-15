"""Seed a demo account with realistic drive history.

Analytics, replay and the score panel all read from stored telemetry, so an
empty account makes them impossible to evaluate. This generates finished drives
with plausible GPS traces and lets the real scoring engine rank them, rather
than writing made-up scores straight into the table.

    python seed_demo.py                      # solo drive history
    python seed_demo.py --race               # + a 4-car race, Hitec City → Charminar
    python seed_demo.py --email you@x.app    # some other existing user
    python seed_demo.py --drives 12 --reset

Safe to re-run: --reset removes only the sessions this script created.
"""
import argparse
import math
import random
from datetime import datetime, timedelta

from sqlmodel import select

from app.database import new_session
from app.models import (
    Session as SprintSession,
    SessionParticipant,
    SessionStatus,
    TelemetryPoint,
    User,
    Vehicle,
    Visibility,
)
from app.services import finalize_session_stats, recompute_user_stats

# Marks the sessions this script owns, so --reset can find them again.
SEED_TAG = "Demo drive"
RACE_TAG = "Demo sprint"

# Roughly central Hyderabad — drives radiate out from here.
ORIGIN_LAT, ORIGIN_LNG = 17.4401, 78.3489

# The demo race route: Hitec City → Charminar, via waypoints that keep the line
# roughly on real roads instead of cutting straight across the city.
ROUTE_A_TO_B = [
    (17.4483, 78.3915),  # Hitec City
    (17.4325, 78.4071),  # Jubilee Hills
    (17.4156, 78.4347),  # Banjara Hills
    (17.4062, 78.4691),  # Khairatabad
    (17.3850, 78.4867),  # Nampally
    (17.3616, 78.4747),  # Charminar
]

# The rivals. The demo account races against these three.
RIVALS = [
    ("nova", "Nova Reddy", "Subaru", "WRX", 2022, 271),
    ("kestrel", "Kestrel Rao", "BMW", "M3", 2021, 473),
    ("apex", "Apex Sharma", "Toyota", "Supra", 2023, 382),
]


def _leg(style: str) -> list[tuple[float, float]]:
    """(speed_kmh, seconds) pairs describing one drive's speed profile."""
    if style == "calm":
        return [(0, 8), (28, 60), (44, 120), (38, 90), (52, 150), (30, 60), (0, 20)]
    if style == "spirited":
        return [(0, 5), (52, 45), (88, 90), (64, 40), (105, 110), (72, 60), (35, 40), (0, 10)]
    if style == "commute":
        return [(0, 15), (22, 90), (36, 140), (0, 45), (30, 120), (18, 70), (0, 25)]
    return [(0, 10), (40, 100), (60, 160), (48, 120), (0, 15)]


def _trace(style: str, started: datetime, seed: int):
    """Turn a speed profile into a GPS trace with a heading that wanders."""
    rng = random.Random(seed)
    lat, lng = ORIGIN_LAT + rng.uniform(-0.03, 0.03), ORIGIN_LNG + rng.uniform(-0.03, 0.03)
    heading = rng.uniform(0, 360)
    t = started
    cumulative = 0.0
    points = []

    for target_kmh, duration_s in _leg(style):
        for _ in range(duration_s):
            # Ease toward the leg's target speed, with a little noise so the
            # accel/jerk terms in the scoring engine see something realistic.
            last = points[-1][2] if points else 0.0
            speed = last + (target_kmh - last) * 0.12 + rng.uniform(-1.5, 1.5)
            speed = max(0.0, speed)

            heading = (heading + rng.uniform(-4, 4)) % 360
            step_m = speed / 3.6  # one sample per second
            cumulative += step_m
            lat += (step_m * math.cos(math.radians(heading))) / 111_320
            lng += (step_m * math.sin(math.radians(heading))) / (111_320 * math.cos(math.radians(lat)))

            points.append((t, (lat, lng), speed, heading, step_m, cumulative))
            t += timedelta(seconds=1)

    return points


def seed(email: str, count: int) -> None:
    styles = ["calm", "spirited", "commute", "mixed"]

    with new_session() as db:
        user = db.exec(select(User).where(User.email == email)).first()
        if not user:
            raise SystemExit(f"No user with email {email!r} — sign up first.")
        vehicles = db.exec(select(Vehicle).where(Vehicle.user_id == user.id)).all()
        if not vehicles:
            raise SystemExit("That user has no vehicles — add one first.")

        now = datetime.utcnow()
        made = 0
        for i in range(count):
            style = styles[i % len(styles)]
            vehicle = vehicles[i % len(vehicles)]
            # Spread across the last ~4 weeks so the range filters have data.
            started = now - timedelta(days=i * 2 + 1, hours=random.randint(0, 10))
            points = _trace(style, started, seed=i * 97)

            drive = SprintSession(
                host_user_id=user.id,
                name=f"{SEED_TAG} · {style}",
                room_code=f"SEED-{random.randint(1000, 9999)}-{i}",
                visibility=Visibility.private,
                max_players=1,
                is_solo=True,
                status=SessionStatus.live,
                created_at=started,
                started_at=started,
            )
            db.add(drive)
            db.commit()
            db.refresh(drive)

            participant = SessionParticipant(
                session_id=drive.id, user_id=user.id, vehicle_id=vehicle.id, ready=True, joined_at=started
            )
            db.add(participant)
            db.commit()
            db.refresh(participant)

            for ts, (plat, plng), speed, head, step, cum in points:
                db.add(
                    TelemetryPoint(
                        session_id=drive.id,
                        participant_id=participant.id,
                        timestamp=ts,
                        latitude=plat,
                        longitude=plng,
                        speed_kmh=speed,
                        heading_deg=head,
                        distance_delta_m=step,
                        cumulative_distance_m=cum,
                        accuracy_m=random.uniform(3, 9),
                        altitude_m=500 + random.uniform(-12, 12),
                        g_force=abs(random.gauss(0.08, 0.06)),
                    )
                )
            db.commit()

            drive.status = SessionStatus.ended
            drive.ended_at = points[-1][0]
            db.add(drive)
            db.commit()

            # Let the real engine score it — no hand-written numbers.
            finalize_session_stats(drive.id, db)
            made += 1
            print(f"  {drive.name.replace(chr(0xB7), '-'):28s} {len(points):4d} points  {cum/1000:5.1f} km")

        recompute_user_stats(user.id, db)
        db.commit()
        print(f"\nSeeded {made} drives for {email}")


def _interpolate_route(waypoints, samples: int, jitter: float, rng: random.Random):
    """Walk the waypoint list, emitting `samples` evenly-spaced lat/lng pairs.

    Each driver gets their own lane offset so four cars on the same road don't
    render as one line stacked on itself.
    """
    legs = list(zip(waypoints, waypoints[1:]))
    per_leg = max(2, samples // len(legs))
    pts = []
    for (alat, alng), (blat, blng) in legs:
        for i in range(per_leg):
            f = i / per_leg
            # Ease within each leg so corners look driven, not teleported.
            lat = alat + (blat - alat) * f
            lng = alng + (blng - alng) * f
            pts.append((lat + rng.gauss(0, jitter), lng + rng.gauss(0, jitter)))
    return pts


def seed_race(email: str) -> None:
    """One race, four cars, Hitec City → Charminar.

    Everyone drives the same route at different paces, so the replay has
    overlapping trails, a real leaderboard and gaps that change over time —
    which is what the post-drive screen is built to show.
    """
    from app.auth import get_password_hash

    with new_session() as db:
        host = db.exec(select(User).where(User.email == email)).first()
        if not host:
            raise SystemExit(f"No user with email {email!r} — sign up first.")

        # Rivals are created directly rather than through /auth/signup, so this
        # doesn't eat the signup rate limit and doesn't need the API running.
        racers = [host]
        for uname, display, make, model, year, hp in RIVALS:
            u = db.exec(select(User).where(User.username == uname)).first()
            if not u:
                u = User(
                    email=f"{uname}@stratum.app",
                    username=uname,
                    display_name=display,
                    hashed_password=get_password_hash("stratum1234"),
                )
                db.add(u)
                db.commit()
                db.refresh(u)
            if not db.exec(select(Vehicle).where(Vehicle.user_id == u.id)).first():
                v = Vehicle(
                    user_id=u.id, manufacturer=make, model=model, year=year,
                    horsepower=hp, fuel_type="gasoline", transmission="Manual", is_active=True,
                )
                db.add(v)
                db.commit()
                db.refresh(v)
                u.active_vehicle_id = v.id
                db.add(u)
                db.commit()
            racers.append(u)

        started = datetime.utcnow() - timedelta(hours=3)
        race = SprintSession(
            host_user_id=host.id,
            name=f"{RACE_TAG} · Hitec City → Charminar",
            room_code=f"SEED-{random.randint(1000, 9999)}",
            visibility=Visibility.private,
            max_players=6,
            is_solo=False,
            status=SessionStatus.live,
            created_at=started,
            started_at=started,
        )
        db.add(race)
        db.commit()
        db.refresh(race)

        # Pace multiplier per car — the spread is what makes the gaps interesting.
        paces = [1.0, 0.94, 1.07, 0.88]

        for idx, racer in enumerate(racers):
            vehicle = db.exec(select(Vehicle).where(Vehicle.user_id == racer.id)).first()
            participant = SessionParticipant(
                session_id=race.id, user_id=racer.id, vehicle_id=vehicle.id,
                ready=True, joined_at=started,
            )
            db.add(participant)
            db.commit()
            db.refresh(participant)

            rng = random.Random(1000 + idx)
            pace = paces[idx % len(paces)]
            # Lane offset keeps the four trails distinguishable on the map.
            lane = (idx - 1.5) * 0.00018
            samples = int(420 * pace)
            path = _interpolate_route(ROUTE_A_TO_B, samples, 0.00006, rng)

            t = started
            cumulative = 0.0
            prev = None
            for i, (plat, plng) in enumerate(path):
                plat += lane
                plng += lane
                step = 0.0
                if prev:
                    dlat = (plat - prev[0]) * 111_320
                    dlng = (plng - prev[1]) * 111_320 * math.cos(math.radians(plat))
                    step = math.hypot(dlat, dlng)
                prev = (plat, plng)
                cumulative += step

                # Slow for the two mid-route junctions, quick on the open stretches.
                phase = i / max(1, len(path))
                base = 38 + 34 * math.sin(phase * math.pi * 3)
                speed = max(0.0, (base + rng.gauss(0, 4)) / pace)

                db.add(
                    TelemetryPoint(
                        session_id=race.id,
                        participant_id=participant.id,
                        timestamp=t,
                        latitude=plat,
                        longitude=plng,
                        speed_kmh=speed,
                        heading_deg=(math.degrees(math.atan2(1, 1)) + i * 0.7) % 360,
                        distance_delta_m=step,
                        cumulative_distance_m=cumulative,
                        accuracy_m=rng.uniform(3, 8),
                        altitude_m=500 + rng.uniform(-15, 15),
                        g_force=abs(rng.gauss(0.1, 0.07)),
                    )
                )
                t += timedelta(seconds=1)
            db.commit()
            print(f"  {racer.display_name:16s} {len(path):4d} points  {cumulative/1000:5.1f} km")

        race.status = SessionStatus.ended
        race.ended_at = started + timedelta(seconds=460)
        db.add(race)
        db.commit()
        finalize_session_stats(race.id, db)

        print(f"\nSeeded race #{race.id}: {race.name}")
        print(f"  replay it at  /#/sessions/{race.id}/results")


def reset(email: str) -> None:
    with new_session() as db:
        user = db.exec(select(User).where(User.email == email)).first()
        if not user:
            raise SystemExit(f"No user with email {email!r}")
        drives = db.exec(
            select(SprintSession).where(
                SprintSession.host_user_id == user.id,
                SprintSession.name.like(f"{SEED_TAG}%") | SprintSession.name.like(f"{RACE_TAG}%"),
            )
        ).all()
        for d in drives:
            for p in db.exec(select(TelemetryPoint).where(TelemetryPoint.session_id == d.id)).all():
                db.delete(p)
            for p in db.exec(select(SessionParticipant).where(SessionParticipant.session_id == d.id)).all():
                db.delete(p)
            db.delete(d)
        db.commit()
        recompute_user_stats(user.id, db)
        db.commit()
        print(f"Removed {len(drives)} seeded drives")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="driver@stratum.app")
    ap.add_argument("--drives", type=int, default=8)
    ap.add_argument("--reset", action="store_true", help="remove seeded sessions first")
    ap.add_argument("--race", action="store_true", help="also seed a 4-car race")
    ap.add_argument("--only-race", action="store_true", help="seed just the race")
    args = ap.parse_args()

    if args.reset:
        reset(args.email)
    if not args.only_race:
        seed(args.email, args.drives)
    if args.race or args.only_race:
        seed_race(args.email)
