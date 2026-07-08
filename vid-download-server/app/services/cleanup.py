import asyncio
import os
import time

from app.core.config import settings
from app.services.storage import cleanup_path, ensure_jobs_root, jobs_root


def cleanup_expired_completed_downloads(now: float = None) -> int:
    from app.services.download_jobs import completed_downloads

    now = now or time.time()
    removed = 0


    for token, download in list(completed_downloads.items()):
        created_at = download.get("created_at", now)
        if now - created_at < settings.DOWNLOAD_TOKEN_TTL_SECONDS:
            continue

        completed_downloads.pop(token, None)
        cleanup_path(download["job_dir"])
        removed += 1

    return removed


def cleanup_stale_job_dirs(now: float = None, remove_all_orphans: bool = False) -> int:
    from app.services.download_jobs import active_downloads, completed_downloads

    now = now or time.time()
    ensure_jobs_root()

    protected_dirs = {
        os.path.abspath(download["job_dir"])
        for download in list(active_downloads.values()) + list(completed_downloads.values())
    }

    removed = 0
    for entry in os.scandir(jobs_root):
        if not entry.is_dir():
            continue

        path = os.path.abspath(entry.path)
        if path in protected_dirs:
            continue

        try:
            age = now - entry.stat().st_mtime
        except FileNotFoundError:
            continue

        if remove_all_orphans or age >= settings.DOWNLOAD_STALE_JOB_SECONDS:
            cleanup_path(path)
            removed += 1

    return removed


def cleanup_download_storage(remove_all_orphans: bool = False) -> dict:
    now = time.time()
    return {
        "expired_completed": cleanup_expired_completed_downloads(now),
        "stale_jobs": cleanup_stale_job_dirs(now, remove_all_orphans),
    }


async def periodic_download_cleanup():
    while True:
        await asyncio.to_thread(cleanup_download_storage)
        await asyncio.sleep(settings.DOWNLOAD_CLEANUP_INTERVAL_SECONDS)
