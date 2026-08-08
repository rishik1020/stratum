import os

from sqlmodel import create_engine, Session, SQLModel

# Use the host's managed database in the cloud (DATABASE_URL), else local SQLite
# for dev. Render/Heroku hand out "postgres://" URLs; SQLAlchemy needs the
# "postgresql://" scheme, so normalise it.
_raw_url = os.getenv("DATABASE_URL", "").strip()
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)

DATABASE_URL = _raw_url or "sqlite:///./app.db"
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# SQLite needs check_same_thread off (we touch it from multiple threads/WS);
# Postgres wants a small pooled connection with pre-ping to survive idle drops.
if IS_SQLITE:
    engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True, pool_recycle=300)

# Nullable columns added after the table first shipped. SQLModel's create_all
# only creates missing *tables*, not missing *columns*, so we add these by hand
# on an existing DB rather than wiping it. Idempotent: skipped if already present.
_ADDED_COLUMNS = {
    "telemetrypoint": [("altitude_m", "FLOAT"), ("g_force", "FLOAT")],
    "session": [("is_solo", "BOOLEAN DEFAULT 0")],
    "sessionparticipant": [
        ("overall_score", "INTEGER"),
        ("safety_score", "INTEGER"),
        ("eco_score", "INTEGER"),
        ("comfort_score", "INTEGER"),
        ("performance_score", "INTEGER"),
    ],
}


def _ensure_columns() -> None:
    # PRAGMA table_info is SQLite-specific. This exists only to patch legacy local
    # app.db files; a fresh Postgres gets every column from create_all, so skip it.
    if not IS_SQLITE:
        return
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns:
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def get_session():
    with Session(engine) as session:
        yield session


def new_session() -> Session:
    """A standalone session for contexts where dependency injection isn't
    available (e.g. long-lived WebSocket connections, where each write should
    use a fresh short-lived session rather than holding one open)."""
    return Session(engine)
