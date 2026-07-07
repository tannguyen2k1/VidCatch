import os

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.security import authenticate_api_key, check_rate_limit
from app.services.download_jobs import active_downloads, download_queue, worker_tasks
from app.services.job_store import job_store
from app.services.storage import ensure_jobs_root, jobs_root, storage_usage_bytes


router = APIRouter()


@router.get("/health")
def health_check():
    ffmpeg_ok = True
    ffmpeg_error = None
    try:
        import imageio_ffmpeg
        imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        ffmpeg_ok = False
        ffmpeg_error = str(exc)

    temp_writable = True
    try:
        ensure_jobs_root()
        probe = os.path.join(jobs_root, ".write-test")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
    except Exception:
        temp_writable = False

    import yt_dlp

    return {
        "status": "ok" if ffmpeg_ok and temp_writable else "degraded",
        "yt_dlp": getattr(yt_dlp.version, "__version__", "unknown"),
        "ffmpeg": "ok" if ffmpeg_ok else ffmpeg_error,
        "jobs_root": jobs_root,
        "temp_writable": temp_writable,
        "active_downloads": len(active_downloads),
        "queue_size": download_queue.qsize(),
        "cleanup": {
            "token_ttl_seconds": settings.DOWNLOAD_TOKEN_TTL_SECONDS,
            "stale_job_seconds": settings.DOWNLOAD_STALE_JOB_SECONDS,
            "interval_seconds": settings.DOWNLOAD_CLEANUP_INTERVAL_SECONDS,
        },
    }


@router.get("/ready")
def ready_check():
    return {
        "status": "ready",
        "database": os.path.exists(settings.DATABASE_PATH),
        "storage_usage_bytes": storage_usage_bytes(),
        "storage_limit_bytes": settings.STORAGE_MAX_BYTES,
        "workers": len(worker_tasks),
    }


@router.get("/metrics")
def metrics(api_key: str = Depends(authenticate_api_key)):
    check_rate_limit(api_key)
    return {
        "active_downloads": len(active_downloads),
        "queue_size": download_queue.qsize(),
        "storage_usage_bytes": storage_usage_bytes(),
        **job_store.metrics(),
    }
