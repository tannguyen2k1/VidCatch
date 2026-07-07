import asyncio
import logging
import os
import threading
import time
import uuid

from fastapi import HTTPException, WebSocket
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings
from app.services.extractor import DownloadCancelled, YtDlpExtractor
from app.services.job_store import job_store
from app.services.storage import cleanup_path, ensure_jobs_root, jobs_root, storage_usage_bytes


logger = logging.getLogger("vidcatch.download_jobs")

active_downloads = {}
completed_downloads = {}
download_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.JOB_QUEUE_SIZE)
worker_tasks: list[asyncio.Task] = []


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


def create_active_download(job_id: str, api_key: str, job_dir: str) -> threading.Event:
    cancel_event = threading.Event()
    active_downloads[job_id] = {
        "cancel_event": cancel_event,
        "job_dir": job_dir,
        "api_key": api_key,
    }
    return cancel_event


async def enqueue_download_job(job: dict):
    download_queue.put_nowait(job)


async def run_download_job(job: dict):
    job_id = job["job_id"]
    websocket: WebSocket = job["websocket"]
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

    ensure_jobs_root()
    for worker_id in range(settings.MAX_GLOBAL_ACTIVE_JOBS):
        worker_tasks.append(asyncio.create_task(download_worker(worker_id)))


async def stop_download_workers():
    for task in worker_tasks:
        task.cancel()
    await asyncio.gather(*worker_tasks, return_exceptions=True)
    worker_tasks.clear()
