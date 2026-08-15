"""Seed a demo account with realistic drive history.

Analytics, replay and the score panel all read from stored telemetry, so an
empty account makes them impossible to evaluate. This generates a handful of
finished drives with plausible GPS traces and lets the real scoring engine rank
them, rather than writing made-up scores straight into the table.

    python seed_demo.py                      # default demo account
    python seed_demo.py --email you@x.app    # some other existing user
    python seed_demo.py --drives 12 --reset

Safe to re-run: --reset removes only the drives this script created.
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

# Roughly central Hyderabad — drives radiate out from here.
ORIGIN_LAT, ORIGIN_LNG = 17.4401, 78.3489


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
            print(f"  {drive.name:28s} {len(points):4d} points  {cum/1000:5.1f} km")

        recompute_user_stats(user.id, db)
        db.commit()
        print(f"\nSeeded {made} drives for {email}")


def reset(email: str) -> None:
    with new_session() as db:
        user = db.exec(select(User).where(User.email == email)).first()
        if not user:
            raise SystemExit(f"No user with email {email!r}")
        drives = db.exec(
            select(SprintSession).where(
                SprintSession.host_user_id == user.id, SprintSession.name.like(f"{SEED_TAG}%")
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
    ap.add_argument("--reset", action="store_true", help="remove seeded drives first")
    args = ap.parse_args()

    if args.reset:
        reset(args.email)
    seed(args.email, args.drives)
