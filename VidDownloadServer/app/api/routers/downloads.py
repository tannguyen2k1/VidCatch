import asyncio
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse

from app.core.security import (
    authenticate_api_key,
    authenticate_websocket,
    check_rate_limit,
    check_rate_limit_for_ws,
    validate_public_url_for_ws,
)
from app.services.download_jobs import (
    active_downloads,
    completed_downloads,
    create_active_download,
    enforce_quota,
    enqueue_download_job,
    websocket_error,
)
from app.services.extractor import sanitize_filename
from app.services.job_store import job_store
from app.services.storage import cleanup_path, jobs_root


router = APIRouter()


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
    cancel_event = create_active_download(job_id, api_key, job_dir)
    job_store.create_job(job_id, api_key, url, job_dir)

    try:
        await enqueue_download_job({
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
