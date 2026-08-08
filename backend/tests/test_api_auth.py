"""Authorization tests — who can read a session, and who can't.

These cover the rule that session reads are scoped to people who actually raced:
the rows behind them are other drivers' names, cars and GPS breadcrumbs.

Run directly (no pytest needed):   python tests/test_api_auth.py
Or with pytest:                     pytest tests/test_api_auth.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Point the app at a throwaway DB *before* importing it — database.py resolves
# DATABASE_URL at import time.
_TMP = tempfile.mkdtemp(prefix="stratum-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP, "test.db").replace("\\", "/")
os.environ["STRATUM_SECRET_KEY"] = "test-only-key"

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from app.database import create_db_and_tables, new_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import TelemetryPoint  # noqa: E402

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
    assert res.status_code == 200, res.text
    vehicle_id = res.json()["id"]
    client.post(f"/vehicles/{vehicle_id}/activate", headers=bearer(token))
    return vehicle_id


# --- fixtures, built once ----------------------------------------------------

create_db_and_tables()

ALICE = signup("alice")          # races
MALLORY = signup("mallory")      # signed in, but not in Alice's session
add_active_vehicle(ALICE)
add_active_vehicle(MALLORY)

_created = client.post(
    "/sessions", headers=bearer(ALICE), json={"name": "Alice's sprint", "max_players": 4}
)
assert _created.status_code == 200, _created.text
SESSION_ID = _created.json()["id"]
ROOM_CODE = _created.json()["room_code"]

# Drop a real GPS fix in, so a leak would actually expose a location.
with new_session() as _db:
    from sqlmodel import select

    from app.models import SessionParticipant

    _p = _db.exec(select(SessionParticipant).where(SessionParticipant.session_id == SESSION_ID)).first()
    _db.add(
        TelemetryPoint(
            session_id=SESSION_ID,
            participant_id=_p.id,
            latitude=17.385,
            longitude=78.4867,
            speed_kmh=64.0,
            cumulative_distance_m=1200.0,
        )
    )
    _db.commit()


# --- tests -------------------------------------------------------------------

SCOPED_READS = [
    f"/sessions/{SESSION_ID}",
    f"/sessions/{SESSION_ID}/participants",
    f"/sessions/{SESSION_ID}/results",
    f"/sessions/{SESSION_ID}/telemetry",
    f"/sessions/room/{ROOM_CODE}",
]


def test_anonymous_is_rejected_from_every_session_read():
    for path in SCOPED_READS:
        res = client.get(path)
        assert res.status_code == 401, f"{path} allowed an anonymous read ({res.status_code})"


def test_non_participant_cannot_read_someone_elses_session():
    for path in SCOPED_READS:
        res = client.get(path, headers=bearer(MALLORY))
        assert res.status_code == 404, f"{path} leaked to a non-participant ({res.status_code})"


def test_participant_can_read_their_own_session():
    for path in SCOPED_READS:
        res = client.get(path, headers=bearer(ALICE))
        assert res.status_code == 200, f"{path} blocked the actual racer ({res.status_code})"


def test_telemetry_returns_gps_to_the_racer_and_nothing_to_anyone_else():
    mine = client.get(f"/sessions/{SESSION_ID}/telemetry", headers=bearer(ALICE)).json()
    assert len(mine) == 1 and mine[0]["latitude"] == 17.385

    theirs = client.get(f"/sessions/{SESSION_ID}/telemetry", headers=bearer(MALLORY))
    assert theirs.status_code == 404
    assert "17.385" not in theirs.text


def test_non_participant_is_404_not_403():
    # A 403 would confirm the session exists, letting anyone walk the ID space.
    res = client.get(f"/sessions/{SESSION_ID}", headers=bearer(MALLORY))
    assert res.status_code == 404
    assert res.json()["detail"] == "Not found" or "not found" in res.json()["detail"].lower()


def test_only_the_host_can_start_end_or_delete():
    other = signup("bystander")
    add_active_vehicle(other)
    client.post("/sessions/join", headers=bearer(other), json={"room_code": ROOM_CODE})
    # Now a legitimate participant — but still not the host.
    assert client.post(f"/sessions/{SESSION_ID}/start", headers=bearer(other)).status_code == 403
    assert client.delete(f"/sessions/{SESSION_ID}", headers=bearer(other)).status_code == 403


def test_websocket_rejects_a_non_participant():
    try:
        with client.websocket_connect(f"/ws/sessions/{SESSION_ID}?token={MALLORY}"):
            raise AssertionError("WebSocket accepted a non-participant")
    except WebSocketDisconnect:
        pass  # closed before accept — correct


def test_websocket_rejects_a_bad_token():
    try:
        with client.websocket_connect(f"/ws/sessions/{SESSION_ID}?token=not-a-real-token"):
            raise AssertionError("WebSocket accepted a forged token")
    except WebSocketDisconnect:
        pass


def test_websocket_accepts_the_racer():
    with client.websocket_connect(f"/ws/sessions/{SESSION_ID}?token={ALICE}") as ws:
        joined = ws.receive_json()
        assert joined["event"] == "participant.joined"


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
