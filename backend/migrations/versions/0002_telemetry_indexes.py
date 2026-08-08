"""index telemetrypoint on its two foreign keys

telemetrypoint is the only table that grows without bound — every drive appends
a row per GPS fix, and neither of its FKs was indexed. Both hot reads scan it:
the replay/series lookup filters by session_id, and the end-of-session rollup
filters by participant_id once per racer. On SQLite with a few hundred rows
that's invisible; on a shared Postgres with real usage it is a full scan per
replay.

Revision ID: 0002_telemetry_indexes
Revises: 0001_baseline
"""
from alembic import op

revision = "0002_telemetry_indexes"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_telemetrypoint_session_id", "telemetrypoint", ["session_id"])
    op.create_index("ix_telemetrypoint_participant_id", "telemetrypoint", ["participant_id"])


def downgrade() -> None:
    op.drop_index("ix_telemetrypoint_participant_id", table_name="telemetrypoint")
    op.drop_index("ix_telemetrypoint_session_id", table_name="telemetrypoint")
