import logging
import os

from sqlalchemy import inspect
from sqlmodel import create_engine, Session

logger = logging.getLogger("stratum.db")

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

def _alembic_config():
    """Alembic config pointed at backend/migrations, wherever we're launched from."""
    from alembic.config import Config

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    return cfg


def create_db_and_tables() -> None:
    """Bring the database up to the latest schema.

    Replaces the old create_all + hand-written ALTER TABLE patching, which only
    ever ran on SQLite — meaning any column added after the first deploy would
    silently never reach the production Postgres.

    Databases that predate Alembic already have the tables but no
    alembic_version, so running the baseline against them would fail on
    "table already exists". Those get stamped at the baseline instead, then
    carried forward by the later revisions like everyone else.
    """
    from alembic import command

    cfg = _alembic_config()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "user" in tables and "alembic_version" not in tables:
        logger.info("existing pre-Alembic database detected — stamping at baseline")
        command.stamp(cfg, "0001_baseline")

    command.upgrade(cfg, "head")


def get_session():
    with Session(engine) as session:
        yield session


def new_session() -> Session:
    """A standalone session for contexts where dependency injection isn't
    available (e.g. long-lived WebSocket connections, where each write should
    use a fresh short-lived session rather than holding one open)."""
    return Session(engine)
