from fastapi import APIRouter, Query, HTTPException
from app.models.schemas import VideoExtractionResponse
from app.services.extractor import YtDlpExtractor
from fastapi.concurrency import run_in_threadpool

router = APIRouter()

@router.get("/extract", response_model=VideoExtractionResponse)
async def extract_video(url: str = Query(..., description="The URL of the video to extract"), referer: str = None):
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL format")
        
    result = await run_in_threadpool(YtDlpExtractor.extract, url, referer)
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)
    return result

@router.get("/download_file")
def download_static_file(filename: str = Query(...)):
    import os
    import tempfile
    from fastapi.responses import FileResponse
    from fastapi.background import BackgroundTasks
    
    file_path = os.path.join(tempfile.gettempdir(), 'VidCatch', filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    def remove_file(path: str):
        try:
            os.remove(path)
        except:
            pass
            
    bg_tasks = BackgroundTasks()
    bg_tasks.add_task(remove_file, file_path)
    
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream", background=bg_tasks)

from fastapi import WebSocket, WebSocketDisconnect
import asyncio

@router.websocket("/ws/download")
async def websocket_download(websocket: WebSocket, url: str, format_id: str, referer: str = None):
    await websocket.accept()
    
    loop = asyncio.get_running_loop()
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            p = d.get('_percent_str', '0%').strip()
            s = d.get('_speed_str', '0B/s').strip()
            eta = d.get('_eta_str', 'Unknown').strip()
            try:
                future = asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"state": "downloading", "progress": p, "speed": s, "eta": eta}),
                    loop
                )
                future.result(timeout=2)
            except Exception:
                raise Exception("AbortDownload")
        elif d['status'] == 'finished':
            try:
                future = asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"state": "muxing", "progress": "100%", "label": "Merging..."}),
                    loop
                )
                future.result(timeout=2)
            except Exception:
                raise Exception("AbortDownload")

    try:
        # Run blocking yt-dlp logic in a separate thread
        file_path = await run_in_threadpool(YtDlpExtractor.download_and_mux, url, format_id, progress_hook, referer)
        
        # Verify file exists, adjusting extension if ffmpeg changed it
        import os
        if not os.path.exists(file_path):
            base, _ = os.path.splitext(file_path)
            for ext in ['.mp4', '.mkv', '.webm']:
                if os.path.exists(base + ext):
                    file_path = base + ext
                    break
                    
        if not os.path.exists(file_path):
            await websocket.send_json({"state": "error", "error": "File not found after download"})
            return
            
        import urllib.parse
        filename = os.path.basename(file_path)
        encoded_filename = urllib.parse.quote(filename)
        await websocket.send_json({"state": "done", "file_url": f"http://localhost:8000/api/download_file?filename={encoded_filename}"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        if "AbortDownload" in str(e):
            import glob, os, tempfile
            temp_dir = os.path.join(tempfile.gettempdir(), 'VidCatch')
            if os.path.exists(temp_dir):
                for f in glob.glob(os.path.join(temp_dir, "*.part")):
                    try: os.remove(f)
                    except: pass
                for f in glob.glob(os.path.join(temp_dir, "*.ytdl")):
                    try: os.remove(f)
                    except: pass
            
            try:
                await websocket.send_json({"state": "error", "error": "Download Cancelled"})
            except:
                pass
        else:
            try:
                await websocket.send_json({"state": "error", "error": str(e)})
            except:
                pass
