"""cache table for map-matched road speed limits

The Safety score measured speeding against a flat 120 km/h placeholder, so city
driving never registered as speeding at all. Real limits come from
OpenStreetMap via Overpass, which is a free, rate-limited public service — this
table caches its answers per map tile so repeat drives down the same roads cost
nothing and we stay a polite client.

`ways_json` holds a whole tile's road geometry as one JSON blob. That is
deliberately denormalised: it's a cache, keyed and read as a unit, and one row
per tile beats reassembling thousands of segment rows on every drive.

Revision ID: 0003_road_tiles
Revises: 0002_telemetry_indexes
"""
import sqlalchemy as sa
from alembic import op
from sqlmodel.sql.sqltypes import AutoString

revision = "0003_road_tiles"
down_revision = "0002_telemetry_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadtile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tile_key", AutoString(), nullable=False),
        sa.Column("lat0", sa.Float(), nullable=False),
        sa.Column("lng0", sa.Float(), nullable=False),
        sa.Column("ways_json", AutoString(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Unique: one row per tile, and the lookup is always "give me these keys".
    op.create_index("ix_roadtile_tile_key", "roadtile", ["tile_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_roadtile_tile_key", table_name="roadtile")
    op.drop_table("roadtile")
