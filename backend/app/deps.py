"""Shared FastAPI dependencies.

Authentication lives in `auth.py`; this module layers *authorization* on top —
deciding which sessions a given user is entitled to read. Keeping it here means
every router enforces the same rule instead of each re-deriving it.
"""
from typing import Optional

from fastapi import Depends, HTTPException
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Session as SprintSession, SessionParticipant, User


def user_may_view_session(session_id: int, user_id: int, db: Session) -> bool:
    """True if `user_id` hosted or raced in `session_id`.

    Someone who has since left still counts — they drove it, so they keep access
    to its results and their own telemetry.
    """
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session:
        return False
    if sprint_session.host_user_id == user_id:
        return True
    participant = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == user_id,
        )
    ).first()
    return participant is not None


def visible_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SprintSession:
    """Load a session the caller is entitled to see, else 404.

    Deliberately 404 and not 403: a 403 would confirm that the session exists,
    letting anyone walk the integer ID space to map out other people's drives.
    An outsider should not be able to tell "not yours" from "not a thing".
    """
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session or not user_may_view_session(session_id, current_user.id, db):
        raise HTTPException(status_code=404, detail="Session not found")
    return sprint_session


def host_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SprintSession:
    """Load a session the caller *hosts*, for the actions only a host may take
    (start, end, delete). Non-participants get the same 404 as above; a
    participant who isn't the host gets a 403, since they already know it exists.
    """
    sprint_session = db.get(SprintSession, session_id)
    if not sprint_session or not user_may_view_session(session_id, current_user.id, db):
        raise HTTPException(status_code=404, detail="Session not found")
    if sprint_session.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can do that")
    return sprint_session


def own_participation(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionParticipant:
    """The caller's own participant row in a session, or 404."""
    participant: Optional[SessionParticipant] = db.exec(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id,
        )
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="You did not participate in this session")
    return participant
