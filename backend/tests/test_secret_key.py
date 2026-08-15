"""Secret-key hardening tests.

`app.auth` decides at *import time* whether the well-known dev JWT secret is
acceptable, so these run each case in a subprocess rather than importing the
module directly — the check can only fire once per interpreter.

Run directly (no pytest needed):   python tests/test_secret_key.py
Or with pytest:                     pytest tests/test_secret_key.py
"""
import os
import subprocess
import sys

PYTHON = sys.executable
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _import_auth_with(env: dict) -> subprocess.CompletedProcess:
    # Start from a clean slate for the two vars under test — inheriting a
    # STRATUM_SECRET_KEY or DATABASE_URL left set in the calling shell would
    # make these tests pass or fail based on ambient state instead of what
    # they're actually asserting.
    full_env = {k: v for k, v in os.environ.items() if k not in ("STRATUM_SECRET_KEY", "DATABASE_URL")}
    full_env.update(env)
    return subprocess.run(
        [PYTHON, "-c", "import app.auth"],
        cwd=BACKEND_DIR,
        env=full_env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_sqlite_dev_db_boots_without_a_secret_key():
    """The common case — a laptop running the default local SQLite — must keep
    working with zero configuration, just a logged warning."""
    result = _import_auth_with({"DATABASE_URL": ""})
    assert result.returncode == 0, f"local dev should boot cleanly, got: {result.stderr}"
    assert "insecure development key" in result.stderr


def test_postgres_without_a_secret_key_refuses_to_boot():
    """A DATABASE_URL pointing at Postgres is what a real deployment looks
    like — refuse to hand out forgeable tokens rather than warn and continue."""
    result = _import_auth_with({"DATABASE_URL": "postgresql://fake:fake@localhost/fake"})
    assert result.returncode != 0, "should have refused to start"
    assert "refusing to start" in result.stderr


def test_postgres_with_a_real_secret_key_boots_fine():
    result = _import_auth_with(
        {"DATABASE_URL": "postgresql://fake:fake@localhost/fake", "STRATUM_SECRET_KEY": "a-real-secret"}
    )
    assert result.returncode == 0, f"a real secret should be enough to boot, got: {result.stderr}"


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
