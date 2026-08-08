import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app.models import User
from app.database import get_session

logger = logging.getLogger("stratum.auth")

# Tokens are signed with STRATUM_SECRET_KEY. In production this MUST be set to a
# strong random value (e.g. `openssl rand -hex 32`); otherwise anyone can forge a
# token. We only fall back to a known dev key for local development, and warn
# loudly so it never silently ships to prod.
_DEV_SECRET = "dev-only-insecure-secret-change-me"
SECRET_KEY = os.getenv("STRATUM_SECRET_KEY", _DEV_SECRET)
if SECRET_KEY == _DEV_SECRET:
    logger.warning(
        "STRATUM_SECRET_KEY is not set - using an insecure development key. "
        "Set STRATUM_SECRET_KEY to a strong random value before deploying."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


_credentials_exception = HTTPException(
    status_code=401,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_user_from_token(token: str, session: Session) -> User:
    """Resolve a bearer token to its User, or raise 401. Shared by the HTTP
    dependency and the WebSocket handshake (which can't use Depends)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        raise _credentials_exception
    try:
        return session.exec(select(User).where(User.id == user_id)).one()
    except NoResultFound:
        raise _credentials_exception


def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    return get_user_from_token(token, session)
