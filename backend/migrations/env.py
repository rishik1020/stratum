"""Alembic environment.

Deliberately reads the URL from the app rather than alembic.ini, so `alembic`
on the command line and the app's own startup migration always target the same
database — SQLite locally, Postgres on the host.
"""
from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

# Importing the models registers every table on SQLModel.metadata, which is what
# --autogenerate diffs against.
from app import models  # noqa: F401
from app.database import DATABASE_URL, engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite can't ALTER most things in place; batch mode rebuilds the table.
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
