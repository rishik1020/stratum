from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthSchema(BaseModel):
    email: EmailStr
    username: str
    password: str
    display_name: str


class LoginSchema(BaseModel):
    email: EmailStr
    password: str


class UserProfile(BaseModel):
    id: int
    email: EmailStr
    username: str
    display_name: str
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None
    active_vehicle_id: Optional[int] = None
    total_sessions: int
    total_distance_m: int
    total_wins: int
    top_speed_kmh: int
    created_at: datetime

    class Config:
        orm_mode = True


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None


class VehicleCreate(BaseModel):
    manufacturer: str
    model: str
    year: int
    horsepower: int
    torque: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    modifications: Optional[str] = None
    weight_kg: Optional[int] = None


class VehicleRead(VehicleCreate):
    id: int
    user_id: int
    is_active: bool

    class Config:
        orm_mode = True


class SessionCreate(BaseModel):
    name: str
    max_players: int = Field(default=6, ge=2, le=12)
    visibility: str = Field(default="private")


class SessionRead(BaseModel):
    id: int
    host_user_id: int
    name: str
    room_code: str
    visibility: str
    max_players: int
    is_solo: bool = False
    status: str
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class SessionParticipantRead(BaseModel):
    id: int
    session_id: int
    user_id: int
    vehicle_id: int
    ready: bool
    joined_at: datetime
    left_at: Optional[datetime] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    vehicle_label: Optional[str] = None
    profile_picture_url: Optional[str] = None

    class Config:
        orm_mode = True


class SessionResultRead(BaseModel):
    final_rank: Optional[int] = None
    user_id: int
    username: str
    display_name: str
    vehicle_label: Optional[str] = None
    total_distance_m: int
    top_speed_kmh: int
    average_speed_kmh: int


class JoinSessionSchema(BaseModel):
    room_code: str


class SessionActionResponse(BaseModel):
    success: bool
    message: str


class TelemetrySchema(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: float
    heading_deg: Optional[float] = None
    distance_delta_m: Optional[float] = None
    cumulative_distance_m: Optional[float] = None
    accuracy_m: Optional[float] = None
    altitude_m: Optional[float] = None
    g_force: Optional[float] = None
    # When the fix was actually taken on the device, not when it reached us.
    # Phones lose the socket constantly — screen off, tunnel, cell handover — so
    # the client buffers and replays. Stamping those on arrival would compress
    # minutes of driving into one instant, and every derived value (Δt, accel,
    # duration, every score) would be computed from that lie.
    recorded_at: Optional[datetime] = None


class UserSessionSummary(BaseModel):
    session_id: int
    host_user_id: int
    name: str
    is_solo: bool = False
    status: str
    created_at: datetime
    ended_at: Optional[datetime] = None
    final_rank: Optional[int] = None
    total_distance_m: int
    top_speed_kmh: int
    average_speed_kmh: int


class StatTotals(BaseModel):
    distance_m: int
    drives: int
    moving_time_s: float


class StatDeltas(BaseModel):
    distance_pct: Optional[float] = None
    drives_pct: Optional[float] = None
    time_pct: Optional[float] = None


class StatTrendPoint(BaseModel):
    label: str
    distance_m: int
    overall_score: Optional[int] = None


class ScoreTrendPoint(BaseModel):
    label: str
    overall: int
    safety: int
    eco: int
    comfort: int
    performance: int


class PersonalBests(BaseModel):
    top_speed_kmh: int
    longest_distance_m: int
    best_avg_speed_kmh: int
    best_overall_score: Optional[int] = None


class VehicleStat(BaseModel):
    vehicle_id: int
    label: str
    drives: int
    distance_m: int
    top_speed_kmh: int


class UserStats(BaseModel):
    range_days: int
    totals: StatTotals
    deltas: StatDeltas
    trend: List[StatTrendPoint]
    score_trend: List[ScoreTrendPoint]
    personal_bests: PersonalBests
    by_vehicle: List[VehicleStat]


class TelemetrySeriesPoint(BaseModel):
    username: str
    elapsed_s: float
    speed_kmh: float
    cumulative_distance_m: Optional[float] = None
    # Included so a session replay can redraw the full HUD + map track.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude_m: Optional[float] = None
    heading_deg: Optional[float] = None
    g_force: Optional[float] = None


# --- Drive analytics & driving score (mirrors app.analytics dataclasses) ------
class DriveMetricsSchema(BaseModel):
    point_count: int
    distance_m: float
    duration_s: float
    moving_time_s: float
    idle_time_s: float
    avg_speed_kmh: float
    avg_moving_speed_kmh: float
    max_speed_kmh: float
    min_moving_speed_kmh: float
    stop_count: int
    day_ratio: float
    night_ratio: float
    fuel_liters_est: Optional[float] = None
    co2_grams_est: Optional[float] = None
    elevation_gain_m: Optional[float] = None
    elevation_loss_m: Optional[float] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None


class EventCountsSchema(BaseModel):
    harsh_braking: int
    rapid_acceleration: int
    sharp_cornering: int
    speeding_seconds: float
    speeding_ratio: float
    # How far over the limit, not just how long — see analytics.EventCounts.
    speeding_severity: float = 0.0
    max_over_limit_kmh: float = 0.0
    # False means the flat fallback limit was used, not real road data. The UI
    # needs this to avoid presenting a guess as a measurement.
    limits_matched: bool = False


class DriveScoreSchema(BaseModel):
    overall: int
    safety: int
    eco: int
    performance: int
    comfort: int


class CoachInsightsSchema(BaseModel):
    summary: str
    smooth_pct: int
    strengths: List[str]
    weaknesses: List[str]
    recommendations: List[str]
    explanations: List[str]


class DriveAnalyticsSchema(BaseModel):
    status: str
    metrics: DriveMetricsSchema
    events: EventCountsSchema
    score: DriveScoreSchema
    insights: CoachInsightsSchema
