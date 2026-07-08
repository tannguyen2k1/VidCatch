from sqlalchemy import Column, String, Float, Integer
from app.db.database import Base

class Job(Base):
    __tablename__ = "jobs"
    
    job_id = Column(String, primary_key=True, index=True)
    api_key = Column(String, nullable=False)
    status = Column(String, nullable=False)
    source_url = Column(String, nullable=False)
    filename = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    job_dir = Column(String, nullable=False)
    error = Column(String, nullable=True)
    bytes = Column(Integer, default=0)
    created_at = Column(Float, nullable=False)
    updated_at = Column(Float, nullable=False)
    expires_at = Column(Float, nullable=True)

class DownloadToken(Base):
    __tablename__ = "download_tokens"
    
    token = Column(String, primary_key=True, index=True)
    job_id = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    job_dir = Column(String, nullable=False)
    created_at = Column(Float, nullable=False)
    expires_at = Column(Float, nullable=False)
