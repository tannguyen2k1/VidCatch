import os
import sqlite3
import threading
import time
from contextlib import contextmanager

from app.core.config import settings


class JobStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.init()

    @contextmanager
    def connect(self):
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            finally:
                conn.close()

    def init(self):
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    api_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    filename TEXT,
                    file_path TEXT,
                    job_dir TEXT NOT NULL,
                    error TEXT,
                    bytes INTEGER DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    expires_at REAL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS download_tokens (
                    token TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    job_dir TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                )
                """
            )

    def create_job(self, job_id: str, api_key: str, source_url: str, job_dir: str):
        now = time.time()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO jobs (job_id, api_key, status, source_url, job_dir, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, api_key, "queued", source_url, job_dir, now, now),
            )

    def update_job(self, job_id: str, status: str, **fields):
        allowed_fields = {"filename", "file_path", "error", "bytes", "expires_at"}
        assignments = ["status = ?", "updated_at = ?"]
        values = [status, time.time()]

        for key, value in fields.items():
            if key in allowed_fields:
                assignments.append(f"{key} = ?")
                values.append(value)

        values.append(job_id)
        with self.connect() as conn:
            conn.execute(
                f"UPDATE jobs SET {', '.join(assignments)} WHERE job_id = ?",
                values,
            )

    def add_download_token(self, token: str, job_id: str, file_path: str, filename: str, job_dir: str):
        now = time.time()
        expires_at = now + settings.DOWNLOAD_TOKEN_TTL_SECONDS
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO download_tokens (token, job_id, file_path, filename, job_dir, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (token, job_id, file_path, filename, job_dir, now, expires_at),
            )
        return expires_at

    def consume_download_token(self, token: str):
        now = time.time()
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM download_tokens WHERE token = ? AND expires_at > ?",
                (token, now),
            ).fetchone()
            if not row:
                return None
            conn.execute("DELETE FROM download_tokens WHERE token = ?", (token,))
            return dict(row)

    def cleanup_expired_tokens(self):
        now = time.time()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM download_tokens WHERE expires_at <= ?",
                (now,),
            ).fetchall()
            conn.execute("DELETE FROM download_tokens WHERE expires_at <= ?", (now,))
            return [dict(row) for row in rows]

    def active_token_job_dirs(self):
        now = time.time()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT job_dir FROM download_tokens WHERE expires_at > ?",
                (now,),
            ).fetchall()
            return [row["job_dir"] for row in rows]

    def count_jobs_for_key_since(self, api_key: str, since: float) -> int:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM jobs WHERE api_key = ? AND created_at >= ?",
                (api_key, since),
            ).fetchone()
            return int(row["count"])

    def count_active_jobs_for_key(self, api_key: str) -> int:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM jobs WHERE api_key = ? AND status IN ('queued', 'downloading', 'muxing')",
                (api_key,),
            ).fetchone()
            return int(row["count"])

    def metrics(self) -> dict:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status"
            ).fetchall()
            token_row = conn.execute("SELECT COUNT(*) AS count FROM download_tokens").fetchone()
        return {
            "jobs": {row["status"]: int(row["count"]) for row in rows},
            "download_tokens": int(token_row["count"]),
        }


job_store = JobStore(settings.DATABASE_PATH)
