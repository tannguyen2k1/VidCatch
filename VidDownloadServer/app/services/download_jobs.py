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
from app.services.storage import cleanup_path, ensure_jobs_root, jobs_root, storage_usage_bytes


logger = logging.getLogger("vidcatch.download_jobs")

active_downloads = {}
completed_downloads = {}
download_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.JOB_QUEUE_SIZE)
worker_tasks: list[asyncio.Task] = []


def enforce_quota(api_key: str):
    active_for_key = sum(1 for job in active_downloads.values() if job.get("api_key") == api_key)
    if active_for_key >= settings.MAX_ACTIVE_JOBS_PER_KEY:
        raise HTTPException(status_code=429, detail="Too many active jobs for this API key")

    if len(active_downloads) >= settings.MAX_GLOBAL_ACTIVE_JOBS + settings.JOB_QUEUE_SIZE:
        raise HTTPException(status_code=503, detail="Server queue is full")

    if storage_usage_bytes() >= settings.STORAGE_MAX_BYTES:
        raise HTTPException(status_code=507, detail="Temporary storage quota exceeded")


def websocket_error(message: str) -> dict:
    return {"state": "error", "error": message}


def create_active_download(job_id: str, api_key: str, job_dir: str, title: str = "", thumbnail: str = "") -> threading.Event:
    cancel_event = threading.Event()
    active_downloads[job_id] = {
        "cancel_event": cancel_event,
        "job_dir": job_dir,
        "api_key": api_key,
        "title": title,
        "thumbnail": thumbnail,
        "state": "queued",
        "progress": "0%",
        "speed": "0B/s",
        "eta": "Unknown",
        "label": "Queued...",
        "error": None,
        "done_payload": None,
    }
    return cancel_event


async def enqueue_download_job(job: dict):
    download_queue.put_nowait(job)


async def run_download_job(job: dict):
    job_id = job["job_id"]
    cancel_event = job["cancel_event"]
    job_dir = job["job_dir"]

    if cancel_event.is_set():
        return

    def progress_hook(d):
        if cancel_event.is_set():
            raise DownloadCancelled("Download Cancelled")
        if job_id not in active_downloads:
            return

        if d["status"] == "downloading":
            active_downloads[job_id]["state"] = "downloading"
            active_downloads[job_id]["label"] = "Downloading..."
            active_downloads[job_id]["progress"] = d.get("_percent_str", "0%").strip()
            active_downloads[job_id]["speed"] = d.get("_speed_str", "0B/s").strip()
            active_downloads[job_id]["eta"] = d.get("_eta_str", "Unknown").strip()
        elif d["status"] == "finished":
            active_downloads[job_id]["state"] = "muxing"
            active_downloads[job_id]["progress"] = "100%"
            active_downloads[job_id]["label"] = "Merging..."

    try:
        if job_id in active_downloads:
            active_downloads[job_id]["state"] = "downloading"

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
        created_at = time.time()
        expires_at = created_at + settings.DOWNLOAD_TOKEN_TTL_SECONDS
        
        completed_downloads[token] = {
            "path": file_path,
            "filename": filename,
            "job_dir": job_dir,
            "created_at": created_at,
        }
        if job_id in active_downloads:
            active_downloads[job_id]["state"] = "done"
            active_downloads[job_id]["done_payload"] = {
                "state": "done",
                "file_url": f"/api/download_file?token={token}",
                "filename": filename,
                "expires_at": expires_at,
            }
            async def cleanup_active():
                await asyncio.sleep(10)
                active_downloads.pop(job_id, None)
            asyncio.create_task(cleanup_active())
    except DownloadCancelled:
        cleanup_path(job_dir)
        if job_id in active_downloads:
            active_downloads[job_id]["state"] = "cancelled"
            active_downloads[job_id]["error"] = "Download Cancelled"
            async def cleanup_error():
                await asyncio.sleep(10)
                active_downloads.pop(job_id, None)
            asyncio.create_task(cleanup_error())
    except Exception as exc:
        detail = getattr(exc, "detail", str(exc))
        cleanup_path(job_dir)
        logger.exception("download_job_failed", extra={"job_id": job_id})
        if job_id in active_downloads:
            active_downloads[job_id]["state"] = "error"
            active_downloads[job_id]["error"] = str(detail)
            async def cleanup_error():
                await asyncio.sleep(10)
                active_downloads.pop(job_id, None)
            asyncio.create_task(cleanup_error())


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
    # Set cancel_event cho tất cả các tiến trình đang chạy
    for job_id, job in active_downloads.items():
        if not job["cancel_event"].is_set():
            job["cancel_event"].set()
            
    for task in worker_tasks:
        task.cancel()
    await asyncio.gather(*worker_tasks, return_exceptions=True)
    worker_tasks.clear()
