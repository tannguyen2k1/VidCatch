import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.core.config import settings
from app.services.cleanup import cleanup_download_storage, periodic_download_cleanup
from app.services.download_jobs import start_download_workers, stop_download_workers
@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(cleanup_download_storage, True)
    await start_download_workers()
    cleanup_task = asyncio.create_task(periodic_download_cleanup())

    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        await stop_download_workers()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend Server for VidCatch using yt-dlp",
    version="1.0.0",
    lifespan=lifespan,
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=settings.BACKEND_CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {"message": "VidDownloadServer is running. Use /api/extract?url=... to extract video links."}
