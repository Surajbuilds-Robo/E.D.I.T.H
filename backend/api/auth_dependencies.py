
import os
import jwt

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.database.connection import get_db
from backend.database.models import User, UserSession


load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid, expired, or revoked authentication session.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not JWT_SECRET or credentials is None:
        raise unauthorized

    if credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={
                "require": ["sub", "exp", "iat", "type", "sid"],
            },
        )

        if payload.get("type") != "access":
            raise unauthorized

        user_id = int(payload.get("sub", 0))
        session_id = int(payload.get("sid", 0))

        if user_id <= 0 or session_id <= 0:
            raise unauthorized

    except jwt.InvalidTokenError:
        raise unauthorized

    except (ValueError, TypeError):
        raise unauthorized

    session = (
        db.query(UserSession)
        .filter(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ),
        )
        .first()
    )

    if not session:
        raise unauthorized

    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.is_active.is_(True),
        )
        .first()
    )

    if not user:
        raise unauthorized

    return user
