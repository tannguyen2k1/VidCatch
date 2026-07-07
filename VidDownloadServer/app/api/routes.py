import asyncio
import os
import logging
import shutil
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, Depends, Query, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse
from app.core.config import settings
from app.core.security import (
    authenticate_api_key,
    authenticate_websocket,
    check_rate_limit,
    check_rate_limit_for_ws,
    validate_public_url,
    validate_public_url_for_ws,
)
from app.models.schemas import VideoExtractionResponse
from app.services.job_store import job_store
from app.services.extractor import DownloadCancelled, YtDlpExtractor, sanitize_filename
from fastapi.concurrency import run_in_threadpool

router = APIRouter()
logger = logging.getLogger("vidcatch.api")

active_downloads = {}
completed_downloads = {}
jobs_root = os.path.join(tempfile.gettempdir(), "VidCatch", "jobs")
download_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.JOB_QUEUE_SIZE)
worker_tasks: list[asyncio.Task] = []


def cleanup_path(path: str):
    try:
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def cleanup_expired_completed_downloads(now: float = None) -> int:
    now = now or time.time()
    removed = 0

    for download in job_store.cleanup_expired_tokens():
        completed_downloads.pop(download["token"], None)
        cleanup_path(download["job_dir"])
        removed += 1

    for token, download in list(completed_downloads.items()):
        created_at = download.get("created_at", now)
        if now - created_at < settings.DOWNLOAD_TOKEN_TTL_SECONDS:
            continue

        completed_downloads.pop(token, None)
        cleanup_path(download["job_dir"])
        removed += 1

    return removed


def cleanup_stale_job_dirs(now: float = None, remove_all_orphans: bool = False) -> int:
    now = now or time.time()
    os.makedirs(jobs_root, exist_ok=True)

    protected_dirs = {
        os.path.abspath(download["job_dir"])
        for download in list(active_downloads.values()) + list(completed_downloads.values())
    }
    protected_dirs.update(os.path.abspath(path) for path in job_store.active_token_job_dirs())

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


def enforce_quota(api_key: str):
    since = time.time() - 24 * 60 * 60
    if job_store.count_jobs_for_key_since(api_key, since) >= settings.DAILY_JOB_QUOTA:
        raise HTTPException(status_code=429, detail="Daily job quota exceeded")

    if job_store.count_active_jobs_for_key(api_key) >= settings.MAX_ACTIVE_JOBS_PER_KEY:
        raise HTTPException(status_code=429, detail="Too many active jobs for this API key")

    if len(active_downloads) >= settings.MAX_GLOBAL_ACTIVE_JOBS:
        raise HTTPException(status_code=503, detail="Server is busy")

    if storage_usage_bytes() >= settings.STORAGE_MAX_BYTES:
        raise HTTPException(status_code=507, detail="Temporary storage quota exceeded")


def websocket_error(message: str) -> dict:
    return {"state": "error", "error": message}


async def run_download_job(job: dict):
    job_id = job["job_id"]
    websocket = job["websocket"]
    cancel_event = job["cancel_event"]
    job_dir = job["job_dir"]
    loop = asyncio.get_running_loop()

    def progress_hook(d):
        if cancel_event.is_set():
            raise DownloadCancelled("Download Cancelled")

        if d["status"] == "downloading":
            p = d.get("_percent_str", "0%").strip()
            s = d.get("_speed_str", "0B/s").strip()
            eta = d.get("_eta_str", "Unknown").strip()
            future = asyncio.run_coroutine_threadsafe(
                websocket.send_json({"state": "downloading", "progress": p, "speed": s, "eta": eta}),
                loop,
            )
            future.result(timeout=2)
        elif d["status"] == "finished":
            job_store.update_job(job_id, "muxing")
            future = asyncio.run_coroutine_threadsafe(
                websocket.send_json({"state": "muxing", "progress": "100%", "label": "Merging..."}),
                loop,
            )
            future.result(timeout=2)

    try:
        job_store.update_job(job_id, "downloading")
        file_path = await asyncio.wait_for(
            run_in_threadpool(
                YtDlpExtractor.download_and_mux,
                job["url"],
                job["format_id"],
                progress_hook,
                job["referer"],
                job_id,
                job_dir,
                cancel_event,
            ),
            timeout=settings.JOB_TIMEOUT_SECONDS,
        )

        if cancel_event.is_set():
            raise DownloadCancelled("Download Cancelled")

        if not os.path.exists(file_path):
            raise FileNotFoundError("File not found after download")

        file_size = os.path.getsize(file_path)
        if file_size > settings.MAX_OUTPUT_BYTES:
            raise HTTPException(status_code=413, detail="Output file exceeds configured size limit")

        filename = os.path.basename(file_path)
        token = uuid.uuid4().hex
        expires_at = job_store.add_download_token(token, job_id, file_path, filename, job_dir)
        completed_downloads[token] = {
            "path": file_path,
            "filename": filename,
            "job_dir": job_dir,
            "created_at": time.time(),
        }
        job_store.update_job(
            job_id,
            "done",
            filename=filename,
            file_path=file_path,
            bytes=file_size,
            expires_at=expires_at,
        )
        await websocket.send_json({
            "state": "done",
            "file_url": f"/api/download_file?token={token}",
            "filename": filename,
            "expires_at": expires_at,
        })
    except DownloadCancelled:
        job_store.update_job(job_id, "cancelled", error="Download Cancelled")
        cleanup_path(job_dir)
        try:
            await websocket.send_json(websocket_error("Download Cancelled"))
        except Exception:
            pass
    except Exception as exc:
        detail = getattr(exc, "detail", str(exc))
        job_store.update_job(job_id, "failed", error=str(detail))
        cleanup_path(job_dir)
        logger.exception("download_job_failed", extra={"job_id": job_id})
        try:
            await websocket.send_json(websocket_error(str(detail)))
        except Exception:
            pass
    finally:
        active_downloads.pop(job_id, None)


async def download_worker(worker_id: int):
    while True:
        job = await download_queue.get()
        try:
            await run_download_job(job)
        finally:
            download_queue.task_done()


async def start_download_workers():
    if worker_tasks:
        return

    os.makedirs(jobs_root, exist_ok=True)
    for worker_id in range(settings.MAX_GLOBAL_ACTIVE_JOBS):
        worker_tasks.append(asyncio.create_task(download_worker(worker_id)))


async def stop_download_workers():
    for task in worker_tasks:
        task.cancel()
    await asyncio.gather(*worker_tasks, return_exceptions=True)
    worker_tasks.clear()


@router.get("/extract", response_model=VideoExtractionResponse)
async def extract_video(
    url: str = Query(..., description="The URL of the video to extract"),
    referer: str = None,
    api_key: str = Depends(authenticate_api_key),
):
    check_rate_limit(api_key)
    validate_public_url(url)
    if referer:
        validate_public_url(referer)

    result = await run_in_threadpool(YtDlpExtractor.extract, url, referer)
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)
    return result

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
        os.makedirs(jobs_root, exist_ok=True)
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
        "pending_download_files": len(completed_downloads),
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

@router.get("/download_file")
def download_static_file(background_tasks: BackgroundTasks, token: str = Query(...), api_key: str = Depends(authenticate_api_key)):
    check_rate_limit(api_key)
    download = completed_downloads.pop(token, None) or job_store.consume_download_token(token)
    if not download:
        raise HTTPException(status_code=404, detail="Download token not found or expired")

    file_path = download.get("path") or download.get("file_path")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    background_tasks.add_task(cleanup_path, download["job_dir"])
    return FileResponse(
        path=file_path,
        filename=download["filename"],
        media_type="application/octet-stream",
        background=background_tasks,
    )

@router.post("/cancel_download")
def cancel_download(job_id: str = Query(...), api_key: str = Depends(authenticate_api_key)):
    check_rate_limit(api_key)
    download = active_downloads.get(job_id)
    if not download:
        return {"cancelled": False, "detail": "Download is not active"}

    download["cancel_event"].set()
    return {"cancelled": True}

@router.websocket("/ws/download")
async def websocket_download(websocket: WebSocket, url: str, format_id: str, referer: str = None, job_id: str = None):
    await websocket.accept()

    api_key = await authenticate_websocket(websocket)
    if not api_key:
        return

    try:
        check_rate_limit_for_ws(api_key)
        validate_public_url_for_ws(url)
        if referer:
            validate_public_url_for_ws(referer)
    except ValueError as exc:
        await websocket.send_json(websocket_error(str(exc)))
        return

    try:
        enforce_quota(api_key)
    except HTTPException as exc:
        await websocket.send_json(websocket_error(str(exc.detail)))
        return

    job_id = sanitize_filename(job_id or uuid.uuid4().hex)
    job_dir = os.path.join(jobs_root, job_id)
    cancel_event = threading.Event()
    active_downloads[job_id] = {
        "cancel_event": cancel_event,
        "job_dir": job_dir,
        "api_key": api_key,
    }
    job_store.create_job(job_id, api_key, url, job_dir)

    try:
        download_queue.put_nowait({
            "job_id": job_id,
            "api_key": api_key,
            "url": url,
            "format_id": format_id,
            "referer": referer,
            "job_dir": job_dir,
            "cancel_event": cancel_event,
            "websocket": websocket,
        })
    except asyncio.QueueFull:
        active_downloads.pop(job_id, None)
        job_store.update_job(job_id, "failed", error="Download queue is full")
        await websocket.send_json(websocket_error("Download queue is full"))
        return

    await websocket.send_json({"state": "queued", "job_id": job_id, "label": "Queued..."})
    try:
        while job_id in active_downloads:
            await asyncio.sleep(1)
            if websocket.client_state.name == "DISCONNECTED":
                active_downloads[job_id]["cancel_event"].set()
                break
    except WebSocketDisconnect:
        if job_id in active_downloads:
            active_downloads[job_id]["cancel_event"].set()
    finally:
        if job_id in active_downloads:
            active_downloads[job_id]["cancel_event"].set()
            job_store.update_job(job_id, "cancelled", error="WebSocket disconnected")
            return
