
import os
import jwt

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.database.connection import get_db
from backend.database.models import User

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not JWT_SECRET or credentials is None:
        print("AUTH ERROR: Missing JWT secret or bearer credentials.")
        raise unauthorized

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        print("AUTH DEBUG: JWT signature and expiration valid.")
        print("AUTH DEBUG: Token type:", payload.get("type"))

        if payload.get("type") != "access":
            print("AUTH ERROR: Incorrect token type.")
            raise unauthorized

        user_id = int(payload.get("sub", 0))

        if user_id <= 0:
            print("AUTH ERROR: Invalid user ID.")
            raise unauthorized

    except jwt.ExpiredSignatureError:
        print("AUTH ERROR: Token expired.")
        raise unauthorized

    except jwt.InvalidSignatureError:
        print("AUTH ERROR: JWT signature mismatch.")
        raise unauthorized

    except jwt.InvalidTokenError as error:
        print("AUTH ERROR: Invalid JWT:", type(error).__name__)
        raise unauthorized

    except (ValueError, TypeError):
        print("AUTH ERROR: Invalid user ID in token.")
        raise unauthorized

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        print("AUTH ERROR: User does not exist:", user_id)
        raise unauthorized

    if not user.is_active:
        print("AUTH ERROR: User is inactive:", user_id)
        raise unauthorized

    return user
