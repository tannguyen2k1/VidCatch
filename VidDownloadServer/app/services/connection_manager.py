import asyncio
from typing import Dict
from fastapi import WebSocket
from app.services.download_jobs import active_downloads

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, int] = {}
        self.cleanup_tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, api_key: str):
        await websocket.accept()
        if api_key not in self.active_connections:
            self.active_connections[api_key] = 0
        self.active_connections[api_key] += 1
        
        # H?y b? task d?n d?p n?u ngu?i dùng reconnect k?p th?i
        if api_key in self.cleanup_tasks:
            self.cleanup_tasks[api_key].cancel()
            del self.cleanup_tasks[api_key]

    def disconnect(self, websocket: WebSocket, api_key: str):
        if api_key in self.active_connections:
            self.active_connections[api_key] -= 1
            if self.active_connections[api_key] <= 0:
                self.active_connections.pop(api_key, None)
                # Lên l?ch d?n d?p ti?n trình sau 5s grace period
                task = asyncio.create_task(self._cleanup_after_grace_period(api_key))
                self.cleanup_tasks[api_key] = task

    async def _cleanup_after_grace_period(self, api_key: str):
        try:
            await asyncio.sleep(5)
            if api_key not in self.active_connections:
                jobs_to_cancel = [
                    job_id for job_id, job in active_downloads.items()
                    if job["api_key"] == api_key
                ]
                for job_id in jobs_to_cancel:
                    job = active_downloads.get(job_id)
                    if job and not job["cancel_event"].is_set():
                        job["cancel_event"].set()
                        job["state"] = "error"
                        job["error"] = "Cancelled due to browser disconnect"
        except asyncio.CancelledError:
            pass

manager = ConnectionManager()
