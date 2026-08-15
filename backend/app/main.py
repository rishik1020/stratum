"""Stratum backend — app assembly.

Routes live in `routers/`, domain rules in `services.py`, authorization in
`deps.py`. This file only wires them together.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import create_db_and_tables
from app.rate_limit import limiter
from app.routers import auth, sessions, telemetry, users, vehicles


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup. (The deprecated @app.on_event("startup") hook is
    # replaced by this lifespan handler, the supported API in modern FastAPI.)
    create_db_and_tables()
    yield


app = FastAPI(title="Stratum Backend", lifespan=lifespan)

# Rate limiting (currently only applied to the auth routes — see rate_limit.py).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS. By default we allow any localhost port (local dev) AND the native
# Capacitor WebView origins (Android serves the app from https://localhost, iOS
# from capacitor://localhost — neither carries a port). To race across real
# devices on the web, set STRATUM_ALLOWED_ORIGINS to a comma-separated list of
# the exact frontend origins phones will use, e.g.
#   STRATUM_ALLOWED_ORIGINS="https://192.168.1.50:5173,https://stratum.example.com"
_cors_kwargs = dict(allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
_allowed_origins = [o.strip() for o in os.getenv("STRATUM_ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _allowed_origins:
    _cors_kwargs["allow_origins"] = _allowed_origins
else:
    # localhost dev servers + the Capacitor native shells (https/capacitor://localhost).
    _cors_kwargs["allow_origin_regex"] = r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|capacitor://localhost)"
app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(vehicles.router)
app.include_router(sessions.router)
app.include_router(telemetry.router)
