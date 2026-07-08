import asyncio
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
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
    enqueue_download_job
)
from app.services.extractor import sanitize_filename
from app.services.storage import jobs_root
from app.services.connection_manager import manager
from app.models.schemas import JobStartRequest

router = APIRouter()

@router.get("/download_file")
def download_static_file(
    token: str = Query(...),
    api_key: str = Depends(authenticate_api_key)
):
    check_rate_limit(api_key)
    # Giữ token lại (không pop) để cho phép tải lại nhiều lần trong thời gian TTL.
    # File sẽ được cleanup định kỳ dọn dẹp khi hết DOWNLOAD_TOKEN_TTL_SECONDS.
    download = completed_downloads.get(token)
    if not download:
        raise HTTPException(status_code=404, detail="Download token not found or expired")

    file_path = download.get("path") or download.get("file_path")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=download["filename"],
        media_type="application/octet-stream",
    )

@router.post("/cancel_download")
def cancel_download(job_id: str = Query(...), api_key: str = Depends(authenticate_api_key)):
    check_rate_limit(api_key)
    download = active_downloads.get(job_id)
    if not download or download["api_key"] != api_key:
        return {"cancelled": False, "detail": "Download is not active"}

    download["cancel_event"].set()
    download["state"] = "error"
    download["error"] = "download cancel"
    return {"cancelled": True}

@router.get("/jobs/active")
def get_active_jobs(api_key: str = Depends(authenticate_api_key)):
    jobs = []
    for j_id, j_data in list(active_downloads.items()):
        if j_data["api_key"] == api_key:
            jobs.append({
                "job_id": j_id,
                "state": j_data.get("state", "queued"),
                "progress": j_data.get("progress", "0%"),
                "label": j_data.get("label", ""),
                "title": j_data.get("title", ""),
                "thumbnail": j_data.get("thumbnail", ""),
            })
    return {"jobs": jobs}

@router.post("/jobs/start")
async def start_job(request: JobStartRequest, api_key: str = Depends(authenticate_api_key)):
    check_rate_limit(api_key)
    try:
        validate_public_url_for_ws(request.url)
        if request.referer:
            validate_public_url_for_ws(request.referer)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
        
    enforce_quota(api_key)

    job_id = sanitize_filename(uuid.uuid4().hex)
    job_dir = os.path.join(jobs_root, job_id)
    cancel_event = create_active_download(job_id, api_key, job_dir, title=request.title, thumbnail=request.thumbnail)
    
    # Lưu thêm url và format_id để frontend mapping
    if job_id in active_downloads:
        active_downloads[job_id]["url"] = request.url
        active_downloads[job_id]["format_id"] = request.format_id

    try:
        await enqueue_download_job({
            "job_id": job_id,
            "api_key": api_key,
            "url": request.url,
            "format_id": request.format_id,
            "referer": request.referer,
            "job_dir": job_dir,
            "cancel_event": cancel_event,
        })
    except asyncio.QueueFull:
        active_downloads.pop(job_id, None)
        raise HTTPException(status_code=503, detail="Download queue is full")

    return {"job_id": job_id, "state": "queued"}

@router.websocket("/ws/sync")
async def sync_websocket(websocket: WebSocket):
    await websocket.accept()
    api_key = await authenticate_websocket(websocket)
    if not api_key:
        return
        
    try:
        check_rate_limit_for_ws(api_key)
    except ValueError as exc:
        await websocket.close(code=1008, reason=str(exc))
        return

    # Call connect directly (we already accepted)
    if api_key not in manager.active_connections:
        manager.active_connections[api_key] = 0
    manager.active_connections[api_key] += 1
    
    if api_key in manager.cleanup_tasks:
        manager.cleanup_tasks[api_key].cancel()
        del manager.cleanup_tasks[api_key]
    try:
        while True:
            jobs_to_send = {}
            queued_jobs = [j for j, job_data in active_downloads.items() if job_data.get("state") == "queued"]
            for jid, job in list(active_downloads.items()):
                if job["api_key"] == api_key:
                    q_pos = queued_jobs.index(jid) + 1 if job["state"] == "queued" and jid in queued_jobs else None
                    jobs_to_send[jid] = {
                        "job_id": jid,
                        "url": job.get("url", ""),
                        "format_id": job.get("format_id", ""),
                        "title": job.get("title", ""),
                        "thumbnail": job.get("thumbnail", ""),
                        "state": job["state"],
                        "progress": job["progress"],
                        "speed": job["speed"],
                        "eta": job["eta"],
                        "label": job["label"],
                        "error": job.get("error"),
                        "file_url": job.get("done_payload", {}).get("file_url") if job.get("done_payload") else None,
                        "queue_position": q_pos,
                    }
                    
            await websocket.send_json({"type": "sync", "jobs": jobs_to_send})
            await asyncio.sleep(1)
            
            if websocket.client_state.name == "DISCONNECTED":
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, api_key)
