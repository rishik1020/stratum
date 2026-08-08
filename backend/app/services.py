"""Domain logic shared across routers.

Anything here is about *what Stratum means* — how a race is scored, how a room
code is minted — rather than how HTTP is spoken. Routers stay thin; this is
where the rules live.
"""
import random
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.analytics import analyze_drive
from app.models import (
    Session as SprintSession,
    SessionParticipant,
    SessionStatus,
    TelemetryPoint,
    User,
    Vehicle,
)


# A live drive whose telemetry went quiet this long ago wasn't being driven —
# the app was closed, the phone died, or the browser tab went away.
ABANDONED_AFTER = timedelta(minutes=30)


def vehicle_label(vehicle: Optional[Vehicle]) -> Optional[str]:
    """"2021 Honda Civic" — the human-readable name for a car."""
    if not vehicle:
        return None
    return f"{vehicle.year} {vehicle.manufacturer} {vehicle.model}".strip()


def generate_room_code(db: Session) -> str:
    """Mint a room code that isn't already taken."""
    for _ in range(10):
        room_code = f"STRAT-{random.randint(1000, 9999)}"
        existing = db.exec(select(SprintSession).where(SprintSession.room_code == room_code)).first()
        if not existing:
            return room_code
    raise HTTPException(status_code=500, detail="Unable to generate unique room code")


def finalize_session_stats(session_id: int, db: Session) -> None:
    """Roll the raw telemetry stream up into per-participant results, assign
    final ranks (furthest distance wins), and fold the totals into each user's
    lifetime profile stats."""
    sprint_session = db.get(SprintSession, session_id)
    is_solo = bool(sprint_session.is_solo) if sprint_session else False
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == session_id)
    ).all()
    for participant in participants:
        points = db.exec(
            select(TelemetryPoint).where(TelemetryPoint.participant_id == participant.id)
        ).all()
        speeds = [p.speed_kmh for p in points if p.speed_kmh is not None]
        cumulative = [p.cumulative_distance_m for p in points if p.cumulative_distance_m is not None]
        deltas = [p.distance_delta_m for p in points if p.distance_delta_m is not None]
        distance = max(cumulative) if cumulative else sum(deltas)
        participant.total_distance_m = int(distance)
        participant.top_speed_kmh = int(max(speeds)) if speeds else 0
        participant.average_speed_kmh = int(sum(speeds) / len(speeds)) if speeds else 0
        # Snapshot the Driving Score so the stats dashboard reads it cheaply.
        vehicle = db.get(Vehicle, participant.vehicle_id)
        analysis = analyze_drive(points, fuel_type=vehicle.fuel_type if vehicle else None)
        if analysis.status == "ok":
            participant.overall_score = analysis.score.overall
            participant.safety_score = analysis.score.safety
            participant.eco_score = analysis.score.eco
            participant.comfort_score = analysis.score.comfort
            participant.performance_score = analysis.score.performance
        db.add(participant)

    # Rank by distance covered (descending). Someone who left before the finish
    # is still ranked on what they actually drove. Ties keep their relative order.
    ranked = sorted(participants, key=lambda p: p.total_distance_m, reverse=True)
    for index, participant in enumerate(ranked, start=1):
        participant.final_rank = index
        user = db.get(User, participant.user_id)
        if user:
            user.total_sessions += 1
            user.total_distance_m += participant.total_distance_m
            user.top_speed_kmh = max(user.top_speed_kmh, participant.top_speed_kmh)
            # Only a real race counts as a win — a solo drive is always "1st".
            if index == 1 and not is_solo:
                user.total_wins += 1
            db.add(user)
        db.add(participant)
    db.commit()


def close_abandoned_sessions(user_id: int, db: Session) -> int:
    """End any of this user's live sessions that were clearly abandoned.

    Nothing ends a drive if the app is killed mid-race, so without this a
    forgotten session stays `live` forever — it never gets scored, never shows
    up in history, and quietly rots. We sweep when the user starts something
    new, which is the natural moment to notice the old one is dead, and backdate
    `ended_at` to the last real telemetry rather than to now.

    Returns how many were closed.
    """
    now = datetime.utcnow()
    live_sessions = db.exec(
        select(SprintSession).where(
            SprintSession.host_user_id == user_id,
            SprintSession.status == SessionStatus.live,
        )
    ).all()

    closed = 0
    for sprint_session in live_sessions:
        last_point = db.exec(
            select(TelemetryPoint)
            .where(TelemetryPoint.session_id == sprint_session.id)
            .order_by(TelemetryPoint.timestamp.desc())
        ).first()
        last_seen = last_point.timestamp if last_point else (
            sprint_session.started_at or sprint_session.created_at
        )
        if now - last_seen < ABANDONED_AFTER:
            continue  # still being driven — leave it alone
        sprint_session.status = SessionStatus.ended
        sprint_session.ended_at = last_seen
        db.add(sprint_session)
        db.commit()
        finalize_session_stats(sprint_session.id, db)
        closed += 1
    return closed


def recompute_user_stats(user_id: int, db: Session) -> None:
    """Rebuild a user's lifetime aggregates from their remaining ended sessions.
    Used after a delete so the dashboard reflects what's actually left (recompute
    rather than decrement — you can't un-max a top speed by subtracting)."""
    user = db.get(User, user_id)
    if not user:
        return
    rows = db.exec(
        select(SessionParticipant, SprintSession)
        .where(SessionParticipant.session_id == SprintSession.id)
        .where(SessionParticipant.user_id == user_id)
        .where(SprintSession.status == SessionStatus.ended)
    ).all()
    user.total_sessions = len(rows)
    user.total_distance_m = sum(p.total_distance_m for p, _ in rows)
    user.top_speed_kmh = max((p.top_speed_kmh for p, _ in rows), default=0)
    user.total_wins = sum(1 for p, s in rows if p.final_rank == 1 and not s.is_solo)
    db.add(user)
