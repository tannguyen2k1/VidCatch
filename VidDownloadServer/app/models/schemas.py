from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Literal

class StreamInfo(BaseModel):
    format_id: str
    url: str
    quality: Optional[str] = None
    streamType: Literal["full", "auto-merge", "video-only", "audio"] = "full"
    resolution: Optional[int] = None
    ext: str
    filesize: Optional[float] = 0

class VideoExtractionResponse(BaseModel):
    title: str
    thumbnail: Optional[str] = None
    duration: float = 0
    uploader: Optional[str] = None
    view_count: Optional[int] = None
    description: Optional[str] = None
    streams: List[StreamInfo] = []
    error: Optional[str] = None

class JobStartRequest(BaseModel):
    url: str
    format_id: str
    title: str = ""
    thumbnail: str = ""
    referer: Optional[str] = None
