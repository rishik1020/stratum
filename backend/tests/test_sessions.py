"""Session lifecycle tests — rejoining, abandoned drives, broadcast resilience.

Run directly (no pytest needed):   python tests/test_sessions.py
Or with pytest:                     pytest tests/test_sessions.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TMP = tempfile.mkdtemp(prefix="stratum-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP, "test.db").replace("\\", "/")
os.environ["STRATUM_SECRET_KEY"] = "test-only-key"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import select  # noqa: E402

from app.database import create_db_and_tables, new_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Session as SprintSession, SessionParticipant, SessionStatus, TelemetryPoint  # noqa: E402
from app.services import close_abandoned_sessions  # noqa: E402
from app.ws_manager import ConnectionManager  # noqa: E402

client = TestClient(app)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def signup(username):
    res = client.post(
        "/auth/signup",
        json={
            "email": f"{username}@example.com",
            "username": username,
            "display_name": username.title(),
            "password": "correct-horse-battery",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def add_active_vehicle(token):
    res = client.post(
        "/vehicles",
        headers=bearer(token),
        json={"manufacturer": "Honda", "model": "Civic", "year": 2021, "horsepower": 180},
    )
    vehicle_id = res.json()["id"]
    client.post(f"/vehicles/{vehicle_id}/activate", headers=bearer(token))
    return vehicle_id


create_db_and_tables()

HOST = signup("host")
RACER = signup("racer")
add_active_vehicle(HOST)
add_active_vehicle(RACER)


def new_race(name="Test sprint"):
    res = client.post("/sessions", headers=bearer(HOST), json={"name": name, "max_players": 4})
    return res.json()["id"], res.json()["room_code"]


# --- rejoining ---------------------------------------------------------------


def test_a_racer_who_left_can_rejoin_and_reappears():
    session_id, room_code = new_race("Rejoin race")
    client.post("/sessions/join", headers=bearer(RACER), json={"room_code": room_code})

    def names():
        rows = client.get(f"/sessions/{session_id}/participants", headers=bearer(HOST)).json()
        return {p["username"] for p in rows}

    assert "racer" in names()

    client.post(f"/sessions/{session_id}/leave", headers=bearer(RACER))
    assert "racer" not in names(), "leaving should hide them from the lobby"

    res = client.post("/sessions/join", headers=bearer(RACER), json={"room_code": room_code})
    assert res.status_code == 200
    assert res.json()["message"] == "Rejoined session"
    assert "racer" in names(), "rejoining should bring them back into the lobby"


def test_rejoining_a_finished_session_is_refused():
    session_id, room_code = new_race("Finished race")
    client.post("/sessions/join", headers=bearer(RACER), json={"room_code": room_code})
    client.post(f"/sessions/{session_id}/leave", headers=bearer(RACER))
    client.post(f"/sessions/{session_id}/start", headers=bearer(HOST))
    client.post(f"/sessions/{session_id}/end", headers=bearer(HOST))

    res = client.post("/sessions/join", headers=bearer(RACER), json={"room_code": room_code})
    assert res.status_code == 400


# --- abandoned drives --------------------------------------------------------


def test_an_abandoned_drive_is_closed_when_the_user_starts_another():
    drive = client.post("/drives", headers=bearer(HOST)).json()
    drive_id = drive["id"]
    assert drive["status"] == "live"

    # Backdate its last telemetry so it looks abandoned rather than in-progress.
    stale = datetime.utcnow() - timedelta(hours=2)
    with new_session() as db:
        participant = db.exec(
            select(SessionParticipant).where(SessionParticipant.session_id == drive_id)
        ).first()
        db.add(
            TelemetryPoint(
                session_id=drive_id,
                participant_id=participant.id,
                timestamp=stale,
                latitude=17.4,
                longitude=78.5,
                speed_kmh=50.0,
                cumulative_distance_m=800.0,
            )
        )
        db.commit()

    client.post("/drives", headers=bearer(HOST))  # starting a new one sweeps the old

    with new_session() as db:
        reaped = db.get(SprintSession, drive_id)
        assert reaped.status == SessionStatus.ended, "abandoned drive should have been closed"
        # ended_at is backdated to the last real fix, not to the sweep time.
        assert abs((reaped.ended_at - stale).total_seconds()) < 2


def test_a_drive_still_being_driven_is_left_alone():
    drive_id = client.post("/drives", headers=bearer(RACER)).json()["id"]
    with new_session() as db:
        participant = db.exec(
            select(SessionParticipant).where(SessionParticipant.session_id == drive_id)
        ).first()
        db.add(
            TelemetryPoint(
                session_id=drive_id,
                participant_id=participant.id,
                timestamp=datetime.utcnow(),
                latitude=17.4,
                longitude=78.5,
                speed_kmh=50.0,
            )
        )
        db.commit()
        closed = close_abandoned_sessions(
            db.exec(select(SprintSession).where(SprintSession.id == drive_id)).one().host_user_id, db
        )
    assert closed == 0, "a drive with fresh telemetry must not be reaped"
    with new_session() as db:
        assert db.get(SprintSession, drive_id).status == SessionStatus.live


# --- broadcast resilience ----------------------------------------------------


class _Socket:
    """Minimal stand-in: records what it received, or blows up on send."""

    def __init__(self, explode=False):
        self.explode = explode
        self.received = []

    async def send_text(self, data):
        if self.explode:
            raise RuntimeError("connection reset by peer")
        self.received.append(data)


def test_one_dead_socket_does_not_silence_the_rest():
    manager = ConnectionManager()
    healthy_first, dead, healthy_last = _Socket(), _Socket(explode=True), _Socket()
    manager.active_connections["7"] = [healthy_first, dead, healthy_last]

    asyncio.run(manager.broadcast("7", {"event": "telemetry.update", "payload": {}}))

    assert len(healthy_first.received) == 1
    # The regression: the dead socket sat between them, and the raised exception
    # used to abort the loop before this one was ever reached.
    assert len(healthy_last.received) == 1, "a dead socket blocked delivery to racers behind it"
    assert dead not in manager.active_connections.get("7", []), "dead socket should be dropped"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL  {fn.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
