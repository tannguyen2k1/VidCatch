from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

from app.core.config import settings

# Đảm bảo thư mục chứa db tồn tại
os.makedirs(os.path.dirname(settings.DATABASE_PATH), exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{settings.DATABASE_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
