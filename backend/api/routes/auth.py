
import hashlib
import os
import secrets

from datetime import datetime, timedelta, timezone

import jwt

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database.connection import get_db
from backend.database.models import User, UserSession
from backend.api.auth_dependencies import get_current_user


load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET is missing or too short.")

JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

password_hash = PasswordHash.recommended()


# ==============================
# REQUEST AND RESPONSE SCHEMAS
# ==============================

class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_.-]+$",
    )
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterResponse(BaseModel):
    status: str
    message: str
    user_id: int
    username: str
    email: EmailStr
    created_at: datetime


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    device_name: str | None = Field(default=None, max_length=150)


class LoginResponse(BaseModel):
    status: str
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    refresh_expires_in: int
    session_id: int
    user_id: int
    username: str
    email: EmailStr


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=256)


class RefreshResponse(BaseModel):
    status: str
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    refresh_expires_in: int
    session_id: int


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=256)


class SessionResponse(BaseModel):
    id: int
    device_name: str | None
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None


# ==============================
# TOKEN HELPERS
# ==============================

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(user_id: int, session_id: int) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "type": "access",
        "iat": now,
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_session_tokens(session: UserSession) -> dict:
    access_token = create_access_token(
        session.user_id,
        session.id,
    )

    refresh_token = create_refresh_token()

    session.refresh_token_hash = hash_refresh_token(
        refresh_token
    )

    session.expires_at = (
        datetime.now(timezone.utc)
        + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )

    session.last_used_at = datetime.now(timezone.utc)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_expires_in": REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        "session_id": session.id,
    }


# ==============================
# REGISTRATION
# ==============================

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    username = request.username.strip().lower()
    email = str(request.email).strip().lower()

    existing_user = db.query(User).filter(
        or_(
            User.username == username,
            User.email == email,
        )
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Username or email is already registered.",
        )

    new_user = User(
        username=username,
        email=email,
        password_hash=password_hash.hash(request.password),
        is_active=True,
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username or email is already registered.",
        )

    return RegisterResponse(
        status="success",
        message="Account registered successfully.",
        user_id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        created_at=new_user.created_at,
    )


# ==============================
# LOGIN
# ==============================


@router.post(
    "/login",
    response_model=LoginResponse,
)
def login_user(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    identifier = request.identifier.strip().lower()

    user = db.query(User).filter(
        or_(
            User.username == identifier,
            User.email == identifier,
        )
    ).first()

    if not user or not password_hash.verify(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    refresh_token = create_refresh_token()

    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        device_name=request.device_name,
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        ),
    )

    try:
        db.add(session)
        db.flush()

        access_token = create_access_token(
            user.id,
            session.id,
        )

        db.commit()
        db.refresh(session)

    except Exception:
        db.rollback()
        raise

    return LoginResponse(
        status="success",
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        session_id=session.id,
        user_id=user.id,
        username=user.username,
        email=user.email,
    )



# ==============================
# REFRESH ACCESS TOKEN
# ==============================

@router.post(
    "/refresh",
    response_model=RefreshResponse,
)
def refresh_access_token(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    token_hash = hash_refresh_token(request.refresh_token)

    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token_hash == token_hash,
        )
        .with_for_update()
        .first()
    )

    now = datetime.now(timezone.utc)

    if (
        not session
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or revoked refresh token.",
        )

    user = (
        db.query(User)
        .filter(
            User.id == session.user_id,
            User.is_active.is_(True),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is unavailable.",
        )

    tokens = create_session_tokens(session)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return RefreshResponse(
        status="success",
        **tokens,
    )


# ==============================
# LOGOUT
# ==============================

@router.post("/logout")
def logout_user(
    request: LogoutRequest,
    db: Session = Depends(get_db),
):
    token_hash = hash_refresh_token(request.refresh_token)

    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token_hash == token_hash,
            UserSession.revoked_at.is_(None),
        )
        .with_for_update()
        .first()
    )

    if session:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "status": "success",
        "message": "Session revoked.",
    }


# ==============================
# LIST ACTIVE SESSIONS
# ==============================

@router.get(
    "/sessions",
    response_model=list[SessionResponse],
)
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .order_by(UserSession.created_at.desc())
        .all()
    )

    return sessions


# ==============================
# REVOKE INDIVIDUAL SESSION
# ==============================

@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(UserSession)
        .filter(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
        )
        .with_for_update()
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    session.revoked_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "success",
        "message": "Session revoked successfully.",
    }
