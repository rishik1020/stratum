"""Signup and login."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app import auth
from app.auth import create_access_token
from app.database import get_session
from app.models import User
from app.rate_limit import limiter
from app.schemas import AuthSchema, LoginSchema, Token

router = APIRouter(tags=["auth"])


# Generous — this exists to stop scripted mass account creation, not to get in
# a real user's way. `request: Request` is unused directly but required: it's
# how slowapi reads the caller's IP for the decorator above it.
@router.post("/auth/signup", response_model=Token)
@limiter.limit("10/hour")
def signup(request: Request, data: AuthSchema, db: Session = Depends(get_session)) -> Token:
    existing = db.exec(
        select(User).where((User.email == data.email) | (User.username == data.username))
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already registered")
    user = User(
        email=data.email,
        username=data.username,
        display_name=data.display_name,
        hashed_password=auth.get_password_hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token({"sub": str(user.id)}))


# Tight enough to stop brute-forcing a password, loose enough that a driver who
# fat-fingers their password a couple of times isn't locked out. Keyed by IP
# (see rate_limit.py) rather than by account, so it can't be used to lock a
# specific user out by deliberately failing their login from elsewhere.
@router.post("/auth/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, data: LoginSchema, db: Session = Depends(get_session)) -> Token:
    try:
        user = db.exec(select(User).where(User.email == data.email)).one()
    except NoResultFound:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_access_token({"sub": str(user.id)}))
