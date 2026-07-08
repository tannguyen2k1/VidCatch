import time
from contextlib import contextmanager

from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import Job, DownloadToken
from sqlalchemy import func

class JobStore:
    def __init__(self):
        # Không cần init table ở đây nữa vì Alembic đã lo
        pass

    @contextmanager
    def session(self):
        db = SessionLocal()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def create_job(self, job_id: str, api_key: str, source_url: str, job_dir: str):
        now = time.time()
        with self.session() as db:
            # SQLAlchemy ORM
            job = db.query(Job).filter(Job.job_id == job_id).first()
            if job:
                job.api_key = api_key
                job.status = "queued"
                job.source_url = source_url
                job.job_dir = job_dir
                job.updated_at = now
            else:
                job = Job(
                    job_id=job_id,
                    api_key=api_key,
                    status="queued",
                    source_url=source_url,
                    job_dir=job_dir,
                    created_at=now,
                    updated_at=now,
                )
                db.add(job)

    def update_job(self, job_id: str, status: str, **fields):
        allowed_fields = {"filename", "file_path", "error", "bytes", "expires_at"}
        with self.session() as db:
            job = db.query(Job).filter(Job.job_id == job_id).first()
            if job:
                job.status = status
                job.updated_at = time.time()
                for key, value in fields.items():
                    if key in allowed_fields:
                        setattr(job, key, value)

    def add_download_token(self, token: str, job_id: str, file_path: str, filename: str, job_dir: str):
        now = time.time()
        expires_at = now + settings.DOWNLOAD_TOKEN_TTL_SECONDS
        with self.session() as db:
            dt = DownloadToken(
                token=token,
                job_id=job_id,
                file_path=file_path,
                filename=filename,
                job_dir=job_dir,
                created_at=now,
                expires_at=expires_at,
            )
            db.add(dt)
        return expires_at

    def consume_download_token(self, token: str) -> dict | None:
        now = time.time()
        with self.session() as db:
            dt = db.query(DownloadToken).filter(DownloadToken.token == token, DownloadToken.expires_at > now).first()
            if not dt:
                return None
            
            # Convert to dict before deleting
            result = {
                "token": dt.token,
                "job_id": dt.job_id,
                "file_path": dt.file_path,
                "filename": dt.filename,
                "job_dir": dt.job_dir,
                "created_at": dt.created_at,
                "expires_at": dt.expires_at,
            }
            
            db.delete(dt)
            return result

    def cleanup_expired_tokens(self):
        now = time.time()
        with self.session() as db:
            expired = db.query(DownloadToken).filter(DownloadToken.expires_at <= now).all()
            results = []
            for dt in expired:
                results.append({
                    "token": dt.token,
                    "job_id": dt.job_id,
                    "file_path": dt.file_path,
                    "filename": dt.filename,
                    "job_dir": dt.job_dir,
                    "created_at": dt.created_at,
                    "expires_at": dt.expires_at,
                })
                db.delete(dt)
            return results

    def active_token_job_dirs(self):
        now = time.time()
        with self.session() as db:
            # SELECT DISTINCT job_dir FROM download_tokens WHERE expires_at > now
            query = db.query(DownloadToken.job_dir).filter(DownloadToken.expires_at > now).distinct()
            return [row[0] for row in query.all()]

    def count_jobs_for_key_since(self, api_key: str, since: float) -> int:
        with self.session() as db:
            return db.query(Job).filter(Job.api_key == api_key, Job.created_at >= since).count()

    def count_active_jobs_for_key(self, api_key: str) -> int:
        with self.session() as db:
            return db.query(Job).filter(
                Job.api_key == api_key, 
                Job.status.in_(['queued', 'downloading', 'muxing'])
            ).count()

    def metrics(self) -> dict:
        with self.session() as db:
            status_counts = db.query(Job.status, func.count(Job.job_id)).group_by(Job.status).all()
            token_count = db.query(DownloadToken).count()
            
        return {
            "jobs": {status: count for status, count in status_counts},
            "download_tokens": token_count,
        }

job_store = JobStore()
