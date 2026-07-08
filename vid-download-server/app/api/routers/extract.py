from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app.core.security import authenticate_api_key, check_rate_limit, validate_public_url
from app.models.schemas import VideoExtractionResponse
from app.services.extractor import YtDlpExtractor


router = APIRouter()


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
