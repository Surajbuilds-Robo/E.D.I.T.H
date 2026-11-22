
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.database.models import User


ADVISORY_LOCK_NAMESPACE = 0x45444954


def acquire_user_memory_lock(db: Session, user_id: int) -> None:
    """
    Serialize memory writes for one user within the current transaction.

    PostgreSQL uses a transaction-level advisory lock.
    Other database dialects fall back to locking the user's row.

    The caller is responsible for committing or rolling back.
    """
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
            {
                "namespace": ADVISORY_LOCK_NAMESPACE,
                "user_id": user_id,
            },
        )
        return

    db.query(User.id).filter(
        User.id == user_id
    ).with_for_update().first()
