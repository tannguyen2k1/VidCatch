from fastapi import APIRouter

from app.api.routers.downloads import router as downloads_router
from app.api.routers.extract import router as extract_router
from app.api.routers.health import router as health_router


router = APIRouter()
router.include_router(extract_router)
router.include_router(health_router)
router.include_router(downloads_router)
