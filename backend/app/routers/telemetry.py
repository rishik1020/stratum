"""Telemetry: the live WebSocket stream, the stored series, and drive analytics."""
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from app import auth
from app.analytics import analyze_to_dict
from app.database import get_session, new_session
from app.deps import own_participation, user_may_view_session, visible_session
from app.models import Session as SprintSession, SessionParticipant, TelemetryPoint, User, Vehicle
from app.schemas import DriveAnalyticsSchema, TelemetrySchema, TelemetrySeriesPoint
from app.speed_limits import limits_for_telemetry, warm_tile
from app.ws_manager import manager

router = APIRouter(tags=["telemetry"])

# How far a device clock may disagree with ours before we stop believing it.
# Phone clocks drift and can be set by hand; a fix claiming to be from next week
# would sort ahead of everything and stretch the drive's duration arbitrarily.
MAX_CLOCK_SKEW = timedelta(minutes=5)
MAX_BUFFER_AGE = timedelta(hours=6)


def _fix_time(recorded_at: Optional[datetime]) -> datetime:
    """When a fix was taken, per the device — within reason.

    The client buffers telemetry across dropped sockets and replays it, so
    arrival order says nothing about when a fix happened. We take the device's
    word for it, but only inside a sane window: outside that we fall back to
    now, which is wrong but bounded.
    """
    now = datetime.utcnow()
    if recorded_at is None:
        return now
    if recorded_at.tzinfo is not None:
        recorded_at = recorded_at.astimezone(timezone.utc).replace(tzinfo=None)
    if recorded_at > now + MAX_CLOCK_SKEW or recorded_at < now - MAX_BUFFER_AGE:
        return now
    return recorded_at


@router.get("/sessions/{session_id}/drive-analytics", response_model=DriveAnalyticsSchema)
def drive_analytics(
    participant: SessionParticipant = Depends(own_participation),
    db: Session = Depends(get_session),
) -> dict:
    """Drive Analytics + Driving Score + coach insights for the current user's
    drive within a session. Computed on demand from the telemetry stream."""
    points = db.exec(
        select(TelemetryPoint)
        .where(TelemetryPoint.participant_id == participant.id)
        .order_by(TelemetryPoint.timestamp)
    ).all()
    vehicle = db.get(Vehicle, participant.vehicle_id)
    # Road limits are normally already cached by the end-of-drive rollup, so
    # this is usually a local read. The short budget is for the case where it
    # isn't — nobody should stare at a spinner because Overpass is slow.
    limits = limits_for_telemetry(points, db, budget_s=6.0)
    return analyze_to_dict(
        points,
        fuel_type=vehicle.fuel_type if vehicle else None,
        speed_limits=limits,
    )


@router.get("/sessions/{session_id}/telemetry", response_model=List[TelemetrySeriesPoint])
def session_telemetry(
    sprint_session: SprintSession = Depends(visible_session),
    db: Session = Depends(get_session),
) -> List[TelemetrySeriesPoint]:
    """The full recorded stream for a session, used by the replay and the charts.

    Gated on participation: these rows are GPS breadcrumbs of where real people
    drove, tagged with their usernames.
    """
    points = db.exec(
        select(TelemetryPoint)
        .where(TelemetryPoint.session_id == sprint_session.id)
        .order_by(TelemetryPoint.timestamp)
    ).all()
    if not points:
        return []
    # Map each participant to a username once, so the series are labelled.
    participants = db.exec(
        select(SessionParticipant).where(SessionParticipant.session_id == sprint_session.id)
    ).all()
    user_by_participant = {}
    for participant in participants:
        user = db.get(User, participant.user_id)
        user_by_participant[participant.id] = user.username if user else f"player{participant.user_id}"
    # Elapsed seconds are measured from the session start (or first sample).
    origin = sprint_session.started_at or points[0].timestamp
    return [
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
        for point in points
    ]


@router.websocket("/ws/sessions/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: int, token: str = Query(...)) -> None:
    # Authenticate against a short-lived session, then capture the identity we
    # need so we never touch a stale/detached ORM object during the long-lived
    # connection. Each telemetry write opens its own fresh session below.
    try:
        with new_session() as auth_db:
            user = auth.get_user_from_token(token, auth_db)
            user_id = user.id
            username = user.username
            # A valid token is not enough — it has to be *your* race. Otherwise
            # any signed-in user could tune into a stranger's live GPS feed.
            is_participant = user_may_view_session(session_id, user_id, auth_db)
    except HTTPException:
        await websocket.close(code=4401)
        return
    if not is_participant:
        await websocket.close(code=4403)
        return
    await manager.connect(str(session_id), websocket)
    await manager.broadcast(
        str(session_id),
        {"event": "participant.joined", "payload": {"user": username, "session_id": session_id}},
    )
    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            event = message.get("event")
            payload = message.get("payload", {})
            if event == "telemetry.update":
                telemetry = TelemetrySchema(**payload)
                # Pull the road data for wherever they are into the cache now,
                # in the background. The drive has minutes left; the end-of-drive
                # rollup then reads limits locally instead of waiting on — and
                # gambling on — a public map server at that exact moment.
                warm_tile(telemetry.latitude, telemetry.longitude)
                with new_session() as db:
                    participant = db.exec(
                        select(SessionParticipant).where(
                            SessionParticipant.session_id == session_id,
                            SessionParticipant.user_id == user_id,
                        )
                    ).first()
                    if participant:
                        db.add(
                            TelemetryPoint(
                                session_id=session_id,
                                participant_id=participant.id,
                                timestamp=_fix_time(telemetry.recorded_at),
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
                        )
                        db.commit()
                await manager.broadcast(
                    str(session_id),
                    {"event": "telemetry.update", "payload": {"user": username, **payload}},
                )
            elif event == "participant.ready":
                await manager.broadcast(
                    str(session_id), {"event": "participant.ready", "payload": {"user": username}}
                )
            elif event == "session.chat":
                await manager.broadcast(
                    str(session_id),
                    {"event": "session.chat", "payload": {"user": username, "message": payload.get("message")}},
                )
    except WebSocketDisconnect:
        manager.disconnect(str(session_id), websocket)
        await manager.broadcast(
            str(session_id), {"event": "participant.left", "payload": {"user": username}}
        )
