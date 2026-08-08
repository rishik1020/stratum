from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


class Visibility(str, Enum):
    private = "private"
    invite = "invite"


class SessionStatus(str, Enum):
    waiting = "waiting"
    live = "live"
    ended = "ended"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    display_name: str
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None
    hashed_password: str
    active_vehicle_id: Optional[int] = Field(default=None, foreign_key="vehicle.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    total_sessions: int = 0
    total_distance_m: int = 0
    total_wins: int = 0
    top_speed_kmh: int = 0

    # active_vehicle_id below is a second FK from user -> vehicle, so the
    # user<->vehicle join is ambiguous; pin this relationship to Vehicle.user_id.
    vehicles: List["Vehicle"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"foreign_keys": "[Vehicle.user_id]"},
    )
    sessions: List["Session"] = Relationship(back_populates="host")
    participant_rows: List["SessionParticipant"] = Relationship(back_populates="user")


class Vehicle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    manufacturer: str
    model: str
    year: int
    horsepower: int
    torque: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    modifications: Optional[str] = None
    weight_kg: Optional[int] = None
    is_active: bool = False

    owner: Optional[User] = Relationship(
        back_populates="vehicles",
        sa_relationship_kwargs={"foreign_keys": "[Vehicle.user_id]"},
    )
    participants: List["SessionParticipant"] = Relationship(back_populates="vehicle")


class Session(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    host_user_id: int = Field(foreign_key="user.id")
    name: str
    room_code: str = Field(index=True, unique=True)
    visibility: Visibility = Visibility.private
    max_players: int = 6
    is_solo: bool = False  # a solo tracked drive (no opponents), not a race
    status: SessionStatus = SessionStatus.waiting
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    host: Optional[User] = Relationship(back_populates="sessions")
    participants: List["SessionParticipant"] = Relationship(back_populates="session")


class SessionParticipant(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    user_id: int = Field(foreign_key="user.id")
    vehicle_id: int = Field(foreign_key="vehicle.id")
    ready: bool = False
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    left_at: Optional[datetime] = None
    final_rank: Optional[int] = None
    total_distance_m: int = 0
    top_speed_kmh: int = 0
    average_speed_kmh: int = 0
    # Driving Score snapshot, computed once when the session ends (so the stats
    # dashboard can read it cheaply instead of recomputing from telemetry).
    overall_score: Optional[int] = None
    safety_score: Optional[int] = None
    eco_score: Optional[int] = None
    comfort_score: Optional[int] = None
    performance_score: Optional[int] = None

    session: Optional[Session] = Relationship(back_populates="participants")
    user: Optional[User] = Relationship(back_populates="participant_rows")
    vehicle: Optional[Vehicle] = Relationship(back_populates="participants")


class TelemetryPoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Indexed: this table grows a row per GPS fix, and both of these are the
    # filter for a hot read (replay by session, end-of-race rollup by racer).
    session_id: int = Field(foreign_key="session.id", index=True)
    participant_id: int = Field(foreign_key="sessionparticipant.id", index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    latitude: float
    longitude: float
    speed_kmh: float
    heading_deg: Optional[float] = None
    distance_delta_m: Optional[float] = None
    cumulative_distance_m: Optional[float] = None
    accuracy_m: Optional[float] = None
    # Phone-derived extras for the telemetry HUD (GPS altitude, DeviceMotion g-force).
    altitude_m: Optional[float] = None
    g_force: Optional[float] = None
