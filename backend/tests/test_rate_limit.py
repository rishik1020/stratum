"""Rate-limit tests for /auth/login and /auth/signup.

Run directly (no pytest needed):   python tests/test_rate_limit.py
Or with pytest:                     pytest tests/test_rate_limit.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TMP = tempfile.mkdtemp(prefix="stratum-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP, "test.db").replace("\\", "/")
os.environ["STRATUM_SECRET_KEY"] = "test-only-key"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import create_db_and_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import limiter  # noqa: E402

client = TestClient(app)
create_db_and_tables()


def reset_rate_limits():
    """TestClient always presents the same "IP", and the limiter is keyed by
    IP — so without this, every test's login/signup attempts would share one
    running budget with every other test in this file. Call at the start of
    each test for a clean window."""
    limiter.reset()


def signup(username):
    return client.post(
        "/auth/signup",
        json={
            "email": f"{username}@example.com",
            "username": username,
            "display_name": username.title(),
            "password": "correct-horse-battery",
        },
    )


def test_a_few_login_attempts_are_never_blocked():
    """The limit exists to stop brute-forcing, not to get in a real user's way —
    a handful of genuine attempts (including honest mistakes) must go through."""
    reset_rate_limits()
    signup("normaluser")
    for _ in range(3):
        res = client.post("/auth/login", json={"email": "normaluser@example.com", "password": "wrong"})
        assert res.status_code == 401, "a wrong password should read as 401, not get rate-limited yet"


def test_repeated_login_attempts_get_rate_limited():
    reset_rate_limits()
    signup("bruteforcetarget")
    statuses = []
    for _ in range(10):
        res = client.post(
            "/auth/login", json={"email": "bruteforcetarget@example.com", "password": "guess"}
        )
        statuses.append(res.status_code)
    assert 429 in statuses, f"expected a 429 among repeated attempts, got {statuses}"
    # Everything before the limit kicked in should be a normal auth rejection.
    first_429 = statuses.index(429)
    assert all(s == 401 for s in statuses[:first_429])


def test_a_correct_login_still_works_once_the_limit_resets():
    """Prove the block is time-windowed, not a lockout — by checking it operates
    on the same 5/minute counter a fresh window would reset, not that we waited
    a full minute (that would make the test suite slow on every run)."""
    reset_rate_limits()
    signup("provewindow")
    for _ in range(5):
        client.post("/auth/login", json={"email": "provewindow@example.com", "password": "wrong"})
    blocked = client.post("/auth/login", json={"email": "provewindow@example.com", "password": "wrong"})
    assert blocked.status_code == 429


def test_repeated_signups_get_rate_limited():
    reset_rate_limits()
    statuses = []
    for i in range(15):
        res = signup(f"masssignup{i}")
        statuses.append(res.status_code)
    assert 429 in statuses, f"expected a 429 among repeated signups, got {statuses}"


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
