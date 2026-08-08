import json
import os
import random
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app import auth
from app.analytics import analyze_drive, analyze_to_dict
from app.auth import create_access_token, get_current_user
from app.database import create_db_and_tables, get_session, new_session
from app.models import Session as SprintSession, SessionParticipant, User, Vehicle, TelemetryPoint, SessionStatus, Visibility
from app.schemas import (
    AuthSchema,
    DriveAnalyticsSchema,
    JoinSessionSchema,
    LoginSchema,
    SessionActionResponse,
    SessionCreate,
    SessionParticipantRead,
    SessionRead,
    PersonalBests,
    ScoreTrendPoint,
    SessionResultRead,
    StatDeltas,
    StatTotals,
    StatTrendPoint,
    TelemetrySchema,
    TelemetrySeriesPoint,
    Token,
    UserProfile,
    UserSessionSummary,
    UserStats,
    UserUpdate,
    VehicleCreate,
    VehicleRead,
    VehicleStat,
)
from app.ws_manager import manager


def _vehicle_label(vehicle: Optional[Vehicle]) -> Optional[str]:
    if not vehicle:
        return None
    return f"{vehicle.year} {vehicle.manufacturer} {vehicle.model}".strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup. (The deprecated @app.on_event("startup") hook is
    # replaced by this lifespan handler, the supported API in modern FastAPI.)
    create_db_and_tables()
    yield


app = FastAPI(title="Stratum Backend MVP", lifespan=lifespan)

# CORS. By default we allow any localhost port (local dev) AND the native
# Capacitor WebView origins (Android serves the app from https://localhost, iOS
# from capacitor://localhost — neither carries a port). To race across real
# devices on the web, set STRATUM_ALLOWED_ORIGINS to a comma-separated list of
# the exact frontend origins phones will use, e.g.
#   STRATUM_ALLOWED_ORIGINS="https://192.168.1.50:5173,https://stratum.example.com"
_cors_kwargs = dict(allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
_allowed_origins = [o.strip() for o in os.getenv("STRATUM_ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _allowed_origins:
    _cors_kwargs["allow_origins"] = _allowed_origins
else:
    # localhost dev servers + the Capacitor native shells (https/capacitor://localhost).
    _cors_kwargs["allow_origin_regex"] = r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|capacitor://localhost)"
app.add_middleware(CORSMiddleware, **_cors_kwargs)


def generate_room_code(session: Session) -> str:
    for _ in range(10):
        room_code = f"STRAT-{random.randint(1000, 9999)}"
        existing = session.exec(select(SprintSession).where(SprintSession.room_code == room_code)).first()
        if not existing:
            return room_code
    raise HTTPException(status_code=500, detail="Unable to generate unique room code")


@app.post("/auth/signup", response_model=Token)
def signup(data: AuthSchema, db: Session = Depends(get_session)) -> Token:
    existing = db.exec(select(User).where((User.email == data.email) | (User.username == data.username))).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already registered")
    user = User(
        email=data.email,
        username=data.username,
        display_name=data.display_name,
        hashed_password=auth.get_password_hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@app.post("/auth/login", response_model=Token)
def login(data: LoginSchema, db: Session = Depends(get_session)) -> Token:
    statement = select(User).where(User.email == data.email)
    try:
        user = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@app.get("/users/me", response_model=UserProfile)
def read_profile(current_user: User = Depends(get_current_user)) -> UserProfile:
    return current_user


@app.patch("/users/me", response_model=UserProfile)
def update_profile(data: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> UserProfile:
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


@app.post("/vehicles", response_model=VehicleRead)
def create_vehicle(data: VehicleCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> Vehicle:
    vehicle = Vehicle(user_id=current_user.id, **data.dict())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@app.get("/vehicles", response_model=List[VehicleRead])
def list_vehicles(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> List[Vehicle]:
    statement = select(Vehicle).where(Vehicle.user_id == current_user.id)
    return db.exec(statement).all()


@app.post("/vehicles/{vehicle_id}/activate", response_model=VehicleRead)
def activate_vehicle(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> Vehicle:
    statement = select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
    try:
        vehicle = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    current_user.active_vehicle_id = vehicle.id
    for record in db.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all():
        record.is_active = record.id == vehicle.id
        db.add(record)
    db.add(current_user)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@app.delete("/vehicles/{vehicle_id}", response_model=SessionActionResponse)
def delete_vehicle(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
    try:
        vehicle = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    # SessionParticipant.vehicle_id is NOT NULL, so deleting a car that has race
    # history would orphan that FK. Keep history intact by refusing the delete
    # (the car stays in the garage) rather than cascading into past results.
    in_use = db.exec(
        select(SessionParticipant).where(SessionParticipant.vehicle_id == vehicle_id)
    ).first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail="This vehicle has race history and can't be deleted — it stays in your garage to preserve past results.",
        )
    was_active = current_user.active_vehicle_id == vehicle.id
    db.delete(vehicle)
    if was_active:
        # Promote another vehicle so the user isn't blocked from racing.
        remaining = db.exec(
            select(Vehicle).where(Vehicle.user_id == current_user.id, Vehicle.id != vehicle_id)
        ).all()
        promoted = remaining[0] if remaining else None
        for record in remaining:
            record.is_active = record is promoted
            db.add(record)
        current_user.active_vehicle_id = promoted.id if promoted else None
        db.add(current_user)
    db.commit()
    return SessionActionResponse(success=True, message="Vehicle deleted")


@app.post("/sessions", response_model=SessionRead)
def create_session(data: SessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SprintSession:
    if not current_user.active_vehicle_id:
        raise HTTPException(status_code=400, detail="Add and activate a vehicle before creating a session")
    room_code = generate_room_code(db)
    sprint_session = SprintSession(
        host_user_id=current_user.id,
        name=data.name,
        room_code=room_code,
        visibility=Visibility(data.visibility),
        max_players=data.max_players,
    )
    db.add(sprint_session)
    db.commit()
    db.refresh(sprint_session)
    # The host is a racer too: auto-join them so they appear in the lobby and
    # their telemetry is accepted once the session goes live.
    host_participant = SessionParticipant(
        session_id=sprint_session.id,
        user_id=current_user.id,
        vehicle_id=current_user.active_vehicle_id,
        ready=True,
    )
    db.add(host_participant)
    db.commit()
    return sprint_session


@app.post("/drives", response_model=SessionRead)
def start_solo_drive(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SprintSession:
    """Start a solo tracked drive — a single-participant, immediately-live session
    with no opponents or lobby. Reuses the same telemetry / replay / scoring
    pipeline as a race; it just isn't joinable and never counts as a race win."""
    if not current_user.active_vehicle_id:
        raise HTTPException(status_code=400, detail="Add and activate a vehicle before starting a drive")
    drive = SprintSession(
        host_user_id=current_user.id,
        name="Solo drive",
        room_code=generate_room_code(db),
        visibility=Visibility.private,
        max_players=1,
        is_solo=True,
        status=SessionStatus.live,
        started_at=datetime.utcnow(),
    )
    db.add(drive)
    db.commit()
    db.refresh(drive)
    db.add(
        SessionParticipant(
            session_id=drive.id,
            user_id=current_user.id,
            vehicle_id=current_user.active_vehicle_id,
            ready=True,
        )
    )
    db.commit()
    return drive


@app.get("/sessions/{session_id}", response_model=SessionRead)
def get_session_details(session_id: int, db: Session = Depends(get_session)) -> SprintSession:
    statement = select(SprintSession).where(SprintSession.id == session_id)
    try:
        sprint_session = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    return sprint_session


@app.get("/sessions/room/{room_code}", response_model=SessionRead)
def get_session_by_room(room_code: str, db: Session = Depends(get_session)) -> SprintSession:
    statement = select(SprintSession).where(SprintSession.room_code == room_code)
    try:
        sprint_session = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    return sprint_session


@app.get("/sessions/{session_id}/participants", response_model=List[SessionParticipantRead])
def get_session_participants(session_id: int, db: Session = Depends(get_session)) -> List[SessionParticipantRead]:
    statement = select(SessionParticipant).where(
        SessionParticipant.session_id == session_id,
        SessionParticipant.left_at == None,  # noqa: E711 -- SQLAlchemy IS NULL
    )
    participants = db.exec(statement).all()
    result: List[SessionParticipantRead] = []
    for participant in participants:
        user = db.get(User, participant.user_id)
        vehicle = db.get(Vehicle, participant.vehicle_id)
        result.append(
            SessionParticipantRead(
                id=participant.id,
                session_id=participant.session_id,
                user_id=participant.user_id,
                vehicle_id=participant.vehicle_id,
                ready=participant.ready,
                joined_at=participant.joined_at,
                left_at=participant.left_at,
                username=user.username if user else None,
                display_name=user.display_name if user else None,
                vehicle_label=_vehicle_label(vehicle),
                profile_picture_url=user.profile_picture_url if user else None,
            )
        )
    return result


@app.post("/sessions/join", response_model=SessionActionResponse)
def join_session(data: JoinSessionSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(SprintSession).where(SprintSession.room_code == data.room_code)
    try:
        sprint_session = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    participant_exists = db.exec(select(SessionParticipant).where(SessionParticipant.session_id == sprint_session.id, SessionParticipant.user_id == current_user.id)).first()
    if participant_exists:
        return SessionActionResponse(success=True, message="Already joined")
    if sprint_session.status != SessionStatus.waiting:
        raise HTTPException(status_code=400, detail="Session already started or ended")
    active_vehicle_id = current_user.active_vehicle_id
    if not active_vehicle_id:
        raise HTTPException(status_code=400, detail="No active vehicle selected")
    participant = SessionParticipant(
        session_id=sprint_session.id,
        user_id=current_user.id,
        vehicle_id=active_vehicle_id,
        ready=False,
    )
    db.add(participant)
    db.commit()
    return SessionActionResponse(success=True, message="Joined session")


@app.post("/sessions/{session_id}/leave", response_model=SessionActionResponse)
def leave_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(SessionParticipant).where(SessionParticipant.session_id == session_id, SessionParticipant.user_id == current_user.id)
    participant = db.exec(statement).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.left_at = datetime.utcnow()
    db.add(participant)
    db.commit()
    return SessionActionResponse(success=True, message="Left session")


@app.post("/sessions/{session_id}/ready", response_model=SessionActionResponse)
def ready_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(SessionParticipant).where(SessionParticipant.session_id == session_id, SessionParticipant.user_id == current_user.id)
    participant = db.exec(statement).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.ready = True
    db.add(participant)
    db.commit()
    return SessionActionResponse(success=True, message="Ready status updated")


@app.post("/sessions/{session_id}/start", response_model=SessionActionResponse)
async def start_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(SprintSession).where(SprintSession.id == session_id)
    try:
        sprint_session = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    if sprint_session.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can start the session")
    if sprint_session.status != SessionStatus.waiting:
        raise HTTPException(status_code=400, detail="Session cannot be started")
    sprint_session.status = SessionStatus.live
    sprint_session.started_at = datetime.utcnow()
    db.add(sprint_session)
    db.commit()
    await manager.broadcast(str(session_id), {"event": "session.started", "payload": {"session_id": session_id}})
    return SessionActionResponse(success=True, message="Session started")


def _finalize_session_stats(session_id: int, db: Session) -> None:
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

    # Rank by distance covered (descending). Ties keep their relative order.
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


@app.post("/sessions/{session_id}/end", response_model=SessionActionResponse)
async def end_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    statement = select(SprintSession).where(SprintSession.id == session_id)
    try:
        sprint_session = db.exec(statement).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    if sprint_session.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end the session")
    if sprint_session.status != SessionStatus.live:
        raise HTTPException(status_code=400, detail="Session is not live")
    sprint_session.status = SessionStatus.ended
    sprint_session.ended_at = datetime.utcnow()
    db.add(sprint_session)
    db.commit()
    _finalize_session_stats(session_id, db)
    await manager.broadcast(str(session_id), {"event": "session.ended", "payload": {"session_id": session_id}})
    return SessionActionResponse(success=True, message="Session ended")


@app.get("/sessions/{session_id}/results", response_model=List[SessionResultRead])
def get_session_results(session_id: int, db: Session = Depends(get_session)) -> List[SessionResultRead]:
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session:
        raise HTTPException(status_code=404, detail="Session not found")
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == session_id)
    ).all()
    results: List[SessionResultRead] = []
    for participant in participants:
        user = db.get(User, participant.user_id)
        vehicle = db.get(Vehicle, participant.vehicle_id)
        if not user:
            continue
        results.append(
            SessionResultRead(
                final_rank=participant.final_rank,
                user_id=participant.user_id,
                username=user.username,
                display_name=user.display_name,
                vehicle_label=_vehicle_label(vehicle),
                total_distance_m=participant.total_distance_m,
                top_speed_kmh=participant.top_speed_kmh,
                average_speed_kmh=participant.average_speed_kmh,
            )
        )
    # Unfinished sessions have final_rank=None; sort those last, then by distance.
    results.sort(key=lambda r: (r.final_rank is None, r.final_rank or 0, -r.total_distance_m))
    return results


def _recompute_user_stats(user_id: int, db: Session) -> None:
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


@app.delete("/sessions/{session_id}", response_model=SessionActionResponse)
def delete_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> SessionActionResponse:
    """Permanently delete a session the current user hosts, along with its
    telemetry stream and participant rows (host only), then rebuild every
    affected user's lifetime aggregates so the dashboard stays in sync."""
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if sprint_session.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can delete this session")

    participants = db.exec(select(SessionParticipant).where(SessionParticipant.session_id == session_id)).all()
    affected_user_ids = {p.user_id for p in participants}

    # Remove children first (FKs are NOT NULL, so they'd orphan otherwise).
    for point in db.exec(select(TelemetryPoint).where(TelemetryPoint.session_id == session_id)).all():
        db.delete(point)
    for participant in participants:
        db.delete(participant)
    db.delete(sprint_session)
    db.commit()

    # Recompute lifetime stats for everyone who was in the deleted session.
    for uid in affected_user_ids:
        _recompute_user_stats(uid, db)
    db.commit()
    return SessionActionResponse(success=True, message="Session deleted")


@app.get("/sessions/{session_id}/drive-analytics", response_model=DriveAnalyticsSchema)
def drive_analytics(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> dict:
    """Drive Analytics + Driving Score + coach insights for the current user's
    drive within a session. Computed on demand from the telemetry stream."""
    participant = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id,
        )
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="You did not participate in this session")
    points = db.exec(
        select(TelemetryPoint)
        .where(TelemetryPoint.participant_id == participant.id)
        .order_by(TelemetryPoint.timestamp)
    ).all()
    vehicle = db.get(Vehicle, participant.vehicle_id)
    return analyze_to_dict(points, fuel_type=vehicle.fuel_type if vehicle else None)


@app.get("/users/me/sessions", response_model=List[UserSessionSummary])
def my_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> List[UserSessionSummary]:
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


@app.get("/users/me/stats", response_model=UserStats)
def my_stats(days: int = 30, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> UserStats:
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
        cur_lo, prev_lo, prev_hi = now - timedelta(days=days), now - timedelta(days=2 * days), now - timedelta(days=days)
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

        deltas = StatDeltas(distance_pct=pct(cur_dist, pd), drives_pct=pct(cur_cnt, pc), time_pct=pct(cur_time, pt))

    trend = [StatTrendPoint(label=d["date"].strftime("%m/%d"), distance_m=d["distance_m"], overall_score=d["overall"]) for d in current]
    score_trend = [
        ScoreTrendPoint(label=d["date"].strftime("%m/%d"), overall=d["overall"], safety=d["safety"], eco=d["eco"], comfort=d["comfort"], performance=d["performance"])
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
        VehicleStat(vehicle_id=vid, label=_vehicle_label(db.get(Vehicle, vid)) or "Unknown", drives=a["drives"], distance_m=a["distance"], top_speed_kmh=a["top"])
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


@app.get("/sessions/{session_id}/telemetry", response_model=List[TelemetrySeriesPoint])
def session_telemetry(session_id: int, db: Session = Depends(get_session)) -> List[TelemetrySeriesPoint]:
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session:
        raise HTTPException(status_code=404, detail="Session not found")
    points = db.exec(
        select(TelemetryPoint)
        .where(TelemetryPoint.session_id == session_id)
        .order_by(TelemetryPoint.timestamp)
    ).all()
    if not points:
        return []
    # Map each participant to a username once, so the series are labelled.
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == session_id)
    ).all()
    user_by_participant = {}
    for participant in participants:
        user = db.get(User, participant.user_id)
        user_by_participant[participant.id] = user.username if user else f"player{participant.user_id}"
    # Elapsed seconds are measured from the session start (or first sample).
    origin = sprint_session.started_at or points[0].timestamp
    series: List[TelemetrySeriesPoint] = []
    for point in points:
        series.append(
            TelemetrySeriesPoint(
                username=user_by_participant.get(point.participant_id, "unknown"),
                elapsed_s=max(0.0, (point.timestamp - origin).total_seconds()),
                speed_kmh=point.speed_kmh,
                cumulative_distance_m=point.cumulative_distance_m,
                latitude=point.latitude,
                longitude=point.longitude,
                altitude_m=point.altitude_m,
                heading_deg=point.heading_deg,
                g_force=point.g_force,
            )
        )
    return series


@app.websocket("/ws/sessions/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: int, token: str = Query(...)) -> None:
    # Authenticate against a short-lived session, then capture the identity we
    # need so we never touch a stale/detached ORM object during the long-lived
    # connection. Each telemetry write opens its own fresh session below.
    try:
        with new_session() as auth_db:
            user = auth.get_user_from_token(token, auth_db)
            user_id = user.id
            username = user.username
    except HTTPException:
        await websocket.close(code=4401)
        return
    await manager.connect(str(session_id), websocket)
    await manager.broadcast(str(session_id), {"event": "participant.joined", "payload": {"user": username, "session_id": session_id}})
    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            event = message.get("event")
            payload = message.get("payload", {})
            if event == "telemetry.update":
                telemetry = TelemetrySchema(**payload)
                with new_session() as db:
                    participant = db.exec(
                        select(SessionParticipant).where(
                            SessionParticipant.session_id == session_id,
                            SessionParticipant.user_id == user_id,
                        )
                    ).first()
                    if participant:
                        point = TelemetryPoint(
                            session_id=session_id,
                            participant_id=participant.id,
                            latitude=telemetry.latitude,
                            longitude=telemetry.longitude,
                            speed_kmh=telemetry.speed_kmh,
                            heading_deg=telemetry.heading_deg,
                            distance_delta_m=telemetry.distance_delta_m,
                            cumulative_distance_m=telemetry.cumulative_distance_m,
                            accuracy_m=telemetry.accuracy_m,
                            altitude_m=telemetry.altitude_m,
                            g_force=telemetry.g_force,
                        )
                        db.add(point)
                        db.commit()
                await manager.broadcast(str(session_id), {"event": "telemetry.update", "payload": {"user": username, **payload}})
            elif event == "participant.ready":
                await manager.broadcast(str(session_id), {"event": "participant.ready", "payload": {"user": username}})
            elif event == "session.chat":
                await manager.broadcast(str(session_id), {"event": "session.chat", "payload": {"user": username, "message": payload.get("message")}})
    except WebSocketDisconnect:
        manager.disconnect(str(session_id), websocket)
        await manager.broadcast(str(session_id), {"event": "participant.left", "payload": {"user": username}})
