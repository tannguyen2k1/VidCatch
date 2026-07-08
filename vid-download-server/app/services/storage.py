import os
import shutil
import tempfile

from app.core.config import settings


jobs_root = os.path.join(tempfile.gettempdir(), "VidCatch", "jobs")


def cleanup_path(path: str):
    try:
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def ensure_jobs_root():
    os.makedirs(jobs_root, exist_ok=True)


def storage_usage_bytes() -> int:
    if not os.path.exists(jobs_root):
        return 0

    total = 0
    for root, _, files in os.walk(jobs_root):
        for filename in files:
            path = os.path.join(root, filename)
            try:
                total += os.path.getsize(path)
            except OSError:
                pass
    return total


def has_storage_capacity() -> bool:
    return storage_usage_bytes() < settings.STORAGE_MAX_BYTES
