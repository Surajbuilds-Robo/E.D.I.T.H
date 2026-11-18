
from backend.database.connection import Base, engine, SessionLocal
from backend.database.models import User


def create_development_user():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        user = db.query(User).filter(
            User.username == "edith_local"
        ).first()

        if user:
            print(f"Development user already exists. ID: {user.id}")
            return

        user = User(
            username="edith_local",
            email="edith_local@edith.local",
            password_hash="DISABLED_LOCAL_DEVELOPMENT_ACCOUNT",
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        print(f"Development user created. ID: {user.id}")

    finally:
        db.close()


if __name__ == "__main__":
    create_development_user()
