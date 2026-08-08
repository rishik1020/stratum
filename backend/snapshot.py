"""Read-only snapshot of the local Stratum database (backend/app.db).

A quick way to "check the backend" — counts, recent sessions, and top users —
without spinning up any tooling. Run from the backend/ folder:

    python snapshot.py
"""
import os
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), "app.db")
if not os.path.exists(db_path):
    raise SystemExit("No app.db found — start the backend once to create it.")

db = sqlite3.connect(db_path)


def count(table: str) -> str:
    try:
        return str(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return "—"


print("\n=== Totals ===")
for table, label in [
    ("user", "users"),
    ("vehicle", "vehicles"),
    ("session", "sessions"),
    ("sessionparticipant", "race entries"),
    ("telemetrypoint", "telemetry points"),
]:
    print(f"  {label:18s} {count(table)}")

print("\n=== Recent sessions ===")
rows = db.execute(
    """
    SELECT s.id, s.name, s.status, s.room_code,
           (SELECT COUNT(*) FROM sessionparticipant p WHERE p.session_id = s.id),
           (SELECT COUNT(*) FROM telemetrypoint t WHERE t.session_id = s.id)
    FROM session s ORDER BY s.id DESC LIMIT 10
    """
).fetchall()
for sid, name, status, code, players, points in rows:
    print(f"  #{sid:<3} {name[:24]:24s} {status:8s} {code:14s} {players}p  {points} pts")

print("\n=== Top users (by wins) ===")
for uid, uname, ses, wins, top in db.execute(
    "SELECT id, username, total_sessions, total_wins, top_speed_kmh "
    "FROM user ORDER BY total_wins DESC, top_speed_kmh DESC LIMIT 10"
):
    print(f"  #{uid:<3} {uname[:18]:18s} {ses} sessions · {wins} wins · {top} km/h top")

db.close()
print()
