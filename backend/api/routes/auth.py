
import os
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
from backend.database.models import User


load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET is missing or too short. Configure it in .env."
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

password_hash = PasswordHash.recommended()


# Registration request
class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_.-]+$",
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class RegisterResponse(BaseModel):
    status: str
    message: str
    user_id: int
    username: str
    email: EmailStr
    created_at: datetime


# Login request
class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    status: str
    access_token: str
    token_type: str
    expires_in: int
    user_id: int
    username: str
    email: EmailStr


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


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

    # Use the same response for unknown accounts and wrong passwords.
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

    token = create_access_token(user.id)

    return LoginResponse(
        status="success",
        access_token=token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        username=user.username,
        email=user.email,
    )
