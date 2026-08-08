"""baseline schema

The schema as it stood when Alembic was adopted. Databases created before that
(the local app.db, the deployed Postgres) are stamped at this revision rather
than running it — see app/database.py.

Revision ID: 0001_baseline
Revises:
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel  # SQLModel columns use sqlmodel.sql.sqltypes.AutoString

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOTE: user.active_vehicle_id -> vehicle.id and vehicle.user_id -> user.id
    # form a cycle, so neither table can declare its FK inline — whichever is
    # created first would reference a table that doesn't exist yet. SQLite
    # shrugs at that; Postgres refuses. So `user` is created without the
    # constraint and it's added once `vehicle` exists.
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("username", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("display_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("bio", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("profile_picture_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("active_vehicle_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("total_sessions", sa.Integer(), nullable=False),
        sa.Column("total_distance_m", sa.Integer(), nullable=False),
        sa.Column("total_wins", sa.Integer(), nullable=False),
        sa.Column("top_speed_kmh", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)
    op.create_index("ix_user_username", "user", ["username"], unique=True)

    op.create_table(
        "vehicle",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("manufacturer", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("model", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("horsepower", sa.Integer(), nullable=False),
        sa.Column("torque", sa.Integer(), nullable=True),
        sa.Column("fuel_type", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("transmission", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("modifications", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("weight_kg", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Now that `vehicle` exists, close the cycle.
    with op.batch_alter_table("user") as batch_op:
        batch_op.create_foreign_key(
            "fk_user_active_vehicle_id", "vehicle", ["active_vehicle_id"], ["id"]
        )

    op.create_table(
        "session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("host_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("room_code", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("visibility", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("is_solo", sa.Boolean(), nullable=False),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["host_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_room_code", "session", ["room_code"], unique=True)

    op.create_table(
        "sessionparticipant",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("ready", sa.Boolean(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=True),
        sa.Column("final_rank", sa.Integer(), nullable=True),
        sa.Column("total_distance_m", sa.Integer(), nullable=False),
        sa.Column("top_speed_kmh", sa.Integer(), nullable=False),
        sa.Column("average_speed_kmh", sa.Integer(), nullable=False),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("safety_score", sa.Integer(), nullable=True),
        sa.Column("eco_score", sa.Integer(), nullable=True),
        sa.Column("comfort_score", sa.Integer(), nullable=True),
        sa.Column("performance_score", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicle.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "telemetrypoint",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("speed_kmh", sa.Float(), nullable=False),
        sa.Column("heading_deg", sa.Float(), nullable=True),
        sa.Column("distance_delta_m", sa.Float(), nullable=True),
        sa.Column("cumulative_distance_m", sa.Float(), nullable=True),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("g_force", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["participant_id"], ["sessionparticipant.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("telemetrypoint")
    op.drop_table("sessionparticipant")
    op.drop_index("ix_session_room_code", table_name="session")
    op.drop_table("session")
    with op.batch_alter_table("user") as batch_op:
        batch_op.drop_constraint("fk_user_active_vehicle_id", type_="foreignkey")
    op.drop_table("vehicle")
    op.drop_index("ix_user_username", table_name="user")
    op.drop_index("ix_user_email", table_name="user")
    op.drop_table("user")
