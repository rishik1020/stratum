"""The signed-in user's profile, session history and aggregate stats."""
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Session as SprintSession, SessionParticipant, SessionStatus, User, Vehicle
from app.schemas import (
    PersonalBests,
    ScoreTrendPoint,
    StatDeltas,
    StatTotals,
    StatTrendPoint,
    UserProfile,
    UserSessionSummary,
    UserStats,
    UserUpdate,
    VehicleStat,
)
from app.services import vehicle_label

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("", response_model=UserProfile)
def read_profile(current_user: User = Depends(get_current_user)) -> UserProfile:
    return current_user


@router.patch("", response_model=UserProfile)
def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> UserProfile:
    if data.display_name is not None:
        current_user.display_name = data.display_name
    if data.bio is not None:
        current_user.bio = data.bio
    if data.profile_picture_url is not None:
        current_user.profile_picture_url = data.profile_picture_url
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/sessions", response_model=List[UserSessionSummary])
def my_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> List[UserSessionSummary]:
    rows = db.exec(
        select(SessionParticipant, SprintSession)
        .where(SessionParticipant.session_id == SprintSession.id)
        .where(SessionParticipant.user_id == current_user.id)
    ).all()
    summaries = [
        UserSessionSummary(
            session_id=sprint_session.id,
            host_user_id=sprint_session.host_user_id,
            name=sprint_session.name,
            is_solo=bool(getattr(sprint_session, "is_solo", False)),
            # SQLite returns the enum column as a plain string on read, so don't assume .value.
            status=getattr(sprint_session.status, "value", sprint_session.status),
            created_at=sprint_session.created_at,
            ended_at=sprint_session.ended_at,
            final_rank=participant.final_rank,
            total_distance_m=participant.total_distance_m,
            top_speed_kmh=participant.top_speed_kmh,
            average_speed_kmh=participant.average_speed_kmh,
        )
        for participant, sprint_session in rows
    ]
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


@router.get("/stats", response_model=UserStats)
def my_stats(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> UserStats:
    """Aggregate driving stats for the dashboard: totals + deltas over a time
    window (days=0 means all-time), per-drive trend, score trend, all-time
    personal bests, and a per-vehicle breakdown — all read from the per-drive
    snapshots stored at session end (no telemetry recompute)."""
    rows = db.exec(
        select(SessionParticipant, SprintSession)
        .where(SessionParticipant.session_id == SprintSession.id)
        .where(SessionParticipant.user_id == current_user.id)
        .where(SprintSession.status == SessionStatus.ended)
    ).all()

    drives = []
    for participant, sprint_session in rows:
        ended = sprint_session.ended_at or sprint_session.created_at
        duration = 0.0
        if sprint_session.ended_at and sprint_session.started_at:
            duration = max(0.0, (sprint_session.ended_at - sprint_session.started_at).total_seconds())
        drives.append(
            {
                "date": ended,
                "distance_m": participant.total_distance_m,
                "top": participant.top_speed_kmh,
                "avg": participant.average_speed_kmh,
                "duration": duration,
                "vehicle_id": participant.vehicle_id,
                "overall": participant.overall_score,
                "safety": participant.safety_score,
                "eco": participant.eco_score,
                "comfort": participant.comfort_score,
                "performance": participant.performance_score,
            }
        )
    drives.sort(key=lambda d: d["date"])

    now = datetime.utcnow()
    if days and days > 0:
        cur_lo = now - timedelta(days=days)
        prev_lo, prev_hi = now - timedelta(days=2 * days), now - timedelta(days=days)
    else:
        cur_lo = prev_lo = prev_hi = None

    current = [d for d in drives if cur_lo is None or d["date"] >= cur_lo]

    def totals(ds):
        return sum(d["distance_m"] for d in ds), len(ds), sum(d["duration"] for d in ds)

    cur_dist, cur_cnt, cur_time = totals(current)

    deltas = StatDeltas()
    if prev_lo is not None:
        prev = [d for d in drives if prev_lo <= d["date"] < prev_hi]
        pd, pc, pt = totals(prev)

        def pct(c, p):
            return round((c - p) / p * 100, 1) if p else None

        deltas = StatDeltas(
            distance_pct=pct(cur_dist, pd), drives_pct=pct(cur_cnt, pc), time_pct=pct(cur_time, pt)
        )

    trend = [
        StatTrendPoint(
            label=d["date"].strftime("%m/%d"), distance_m=d["distance_m"], overall_score=d["overall"]
        )
        for d in current
    ]
    score_trend = [
        ScoreTrendPoint(
            label=d["date"].strftime("%m/%d"),
            overall=d["overall"],
            safety=d["safety"],
            eco=d["eco"],
            comfort=d["comfort"],
            performance=d["performance"],
        )
        for d in current
        if d["overall"] is not None
    ]

    bests = PersonalBests(
        top_speed_kmh=max((d["top"] for d in drives), default=0),
        longest_distance_m=max((d["distance_m"] for d in drives), default=0),
        best_avg_speed_kmh=max((d["avg"] for d in drives), default=0),
        best_overall_score=max((d["overall"] for d in drives if d["overall"] is not None), default=None),
    )

    by_vehicle_map: dict = {}
    for d in drives:
        agg = by_vehicle_map.setdefault(d["vehicle_id"], {"drives": 0, "distance": 0, "top": 0})
        agg["drives"] += 1
        agg["distance"] += d["distance_m"]
        agg["top"] = max(agg["top"], d["top"])
    by_vehicle = [
        VehicleStat(
            vehicle_id=vid,
            label=vehicle_label(db.get(Vehicle, vid)) or "Unknown",
            drives=a["drives"],
            distance_m=a["distance"],
            top_speed_kmh=a["top"],
        )
        for vid, a in by_vehicle_map.items()
    ]
    by_vehicle.sort(key=lambda v: v.distance_m, reverse=True)

    return UserStats(
        range_days=days,
        totals=StatTotals(distance_m=cur_dist, drives=cur_cnt, moving_time_s=cur_time),
        deltas=deltas,
        trend=trend,
        score_trend=score_trend,
        personal_bests=bests,
        by_vehicle=by_vehicle,
    )
