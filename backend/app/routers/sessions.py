"""Sprint sessions and solo drives — the lobby, the race, the results.

A solo drive is the same object as a race: same telemetry, replay and scoring
pipeline, just flagged `is_solo`, never joinable, and never counted as a win.
"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.deps import host_session, user_may_view_session, visible_session
from app.models import (
    Session as SprintSession,
    SessionParticipant,
    SessionStatus,
    TelemetryPoint,
    User,
    Vehicle,
    Visibility,
)
from app.schemas import (
    JoinSessionSchema,
    SessionActionResponse,
    SessionCreate,
    SessionParticipantRead,
    SessionRead,
    SessionResultRead,
)
from app.services import (
    finalize_session_stats,
    generate_room_code,
    recompute_user_stats,
    vehicle_label,
)
from app.ws_manager import manager

router = APIRouter(tags=["sessions"])


# --- Creating ----------------------------------------------------------------


@router.post("/sessions", response_model=SessionRead)
def create_session(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SprintSession:
    if not current_user.active_vehicle_id:
        raise HTTPException(status_code=400, detail="Add and activate a vehicle before creating a session")
    sprint_session = SprintSession(
        host_user_id=current_user.id,
        name=data.name,
        room_code=generate_room_code(db),
        visibility=Visibility(data.visibility),
        max_players=data.max_players,
    )
    db.add(sprint_session)
    db.commit()
    db.refresh(sprint_session)
    # The host is a racer too: auto-join them so they appear in the lobby and
    # their telemetry is accepted once the session goes live.
    db.add(
        SessionParticipant(
            session_id=sprint_session.id,
            user_id=current_user.id,
            vehicle_id=current_user.active_vehicle_id,
            ready=True,
        )
    )
    db.commit()
    return sprint_session


@router.post("/drives", response_model=SessionRead)
def start_solo_drive(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SprintSession:
    """Start a solo tracked drive — a single-participant, immediately-live session
    with no opponents or lobby."""
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


# --- Reading -----------------------------------------------------------------
#
# Everything below is scoped to sessions the caller actually took part in. These
# reads expose other people's names, vehicles and GPS traces, so "knows the
# integer ID" is not an entitlement.


@router.get("/sessions/{session_id}", response_model=SessionRead)
def get_session_details(sprint_session: SprintSession = Depends(visible_session)) -> SprintSession:
    return sprint_session


@router.get("/sessions/room/{room_code}", response_model=SessionRead)
def get_session_by_room(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SprintSession:
    try:
        sprint_session = db.exec(
            select(SprintSession).where(SprintSession.room_code == room_code)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    # Join first, then read: this endpoint confirms a session you're already in,
    # it isn't a way to browse rooms by guessing codes.
    if not user_may_view_session(sprint_session.id, current_user.id, db):
        raise HTTPException(status_code=404, detail="Session not found")
    return sprint_session


@router.get("/sessions/{session_id}/participants", response_model=List[SessionParticipantRead])
def get_session_participants(
    sprint_session: SprintSession = Depends(visible_session),
    db: Session = Depends(get_session),
) -> List[SessionParticipantRead]:
    participants = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == sprint_session.id,
            SessionParticipant.left_at == None,  # noqa: E711 -- SQLAlchemy IS NULL
        )
    ).all()
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
                vehicle_label=vehicle_label(vehicle),
                profile_picture_url=user.profile_picture_url if user else None,
            )
        )
    return result


@router.get("/sessions/{session_id}/results", response_model=List[SessionResultRead])
def get_session_results(
    sprint_session: SprintSession = Depends(visible_session),
    db: Session = Depends(get_session),
) -> List[SessionResultRead]:
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == sprint_session.id)
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
                vehicle_label=vehicle_label(vehicle),
                total_distance_m=participant.total_distance_m,
                top_speed_kmh=participant.top_speed_kmh,
                average_speed_kmh=participant.average_speed_kmh,
            )
        )
    # Unfinished sessions have final_rank=None; sort those last, then by distance.
    results.sort(key=lambda r: (r.final_rank is None, r.final_rank or 0, -r.total_distance_m))
    return results


# --- Lobby -------------------------------------------------------------------


@router.post("/sessions/join", response_model=SessionActionResponse)
def join_session(
    data: JoinSessionSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    try:
        sprint_session = db.exec(
            select(SprintSession).where(SprintSession.room_code == data.room_code)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Session not found")
    participant_exists = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == sprint_session.id,
            SessionParticipant.user_id == current_user.id,
        )
    ).first()
    if participant_exists:
        return SessionActionResponse(success=True, message="Already joined")
    if sprint_session.status != SessionStatus.waiting:
        raise HTTPException(status_code=400, detail="Session already started or ended")
    if not current_user.active_vehicle_id:
        raise HTTPException(status_code=400, detail="No active vehicle selected")
    db.add(
        SessionParticipant(
            session_id=sprint_session.id,
            user_id=current_user.id,
            vehicle_id=current_user.active_vehicle_id,
            ready=False,
        )
    )
    db.commit()
    return SessionActionResponse(success=True, message="Joined session")


@router.post("/sessions/{session_id}/leave", response_model=SessionActionResponse)
def leave_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    participant = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id,
        )
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.left_at = datetime.utcnow()
    db.add(participant)
    db.commit()
    return SessionActionResponse(success=True, message="Left session")


@router.post("/sessions/{session_id}/ready", response_model=SessionActionResponse)
def ready_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    participant = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id,
        )
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.ready = True
    db.add(participant)
    db.commit()
    return SessionActionResponse(success=True, message="Ready status updated")


# --- Running the race --------------------------------------------------------


@router.post("/sessions/{session_id}/start", response_model=SessionActionResponse)
async def start_session(
    sprint_session: SprintSession = Depends(host_session),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    session_id = sprint_session.id
    if sprint_session.status != SessionStatus.waiting:
        raise HTTPException(status_code=400, detail="Session cannot be started")
    sprint_session.status = SessionStatus.live
    sprint_session.started_at = datetime.utcnow()
    db.add(sprint_session)
    db.commit()
    await manager.broadcast(
        str(session_id), {"event": "session.started", "payload": {"session_id": session_id}}
    )
    return SessionActionResponse(success=True, message="Session started")


@router.post("/sessions/{session_id}/end", response_model=SessionActionResponse)
async def end_session(
    sprint_session: SprintSession = Depends(host_session),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    session_id = sprint_session.id
    if sprint_session.status != SessionStatus.live:
        raise HTTPException(status_code=400, detail="Session is not live")
    sprint_session.status = SessionStatus.ended
    sprint_session.ended_at = datetime.utcnow()
    db.add(sprint_session)
    db.commit()
    finalize_session_stats(session_id, db)
    await manager.broadcast(
        str(session_id), {"event": "session.ended", "payload": {"session_id": session_id}}
    )
    return SessionActionResponse(success=True, message="Session ended")


@router.delete("/sessions/{session_id}", response_model=SessionActionResponse)
def delete_session(
    sprint_session: SprintSession = Depends(host_session),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    """Permanently delete a session the current user hosts, along with its
    telemetry stream and participant rows (host only), then rebuild every
    affected user's lifetime aggregates so the dashboard stays in sync."""
    session_id = sprint_session.id
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == session_id)
    ).all()
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
        recompute_user_stats(uid, db)
    db.commit()
    return SessionActionResponse(success=True, message="Session deleted")
