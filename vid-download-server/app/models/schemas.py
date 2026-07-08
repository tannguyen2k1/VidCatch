from typing import List, Optional
from pydantic import BaseModel

class JobStartRequest(BaseModel):
    url: str
    format_id: str
    title: str
    thumbnail: Optional[str] = None
    referer: Optional[str] = None

class StreamInfo(BaseModel):
    format_id: str
    url: str
    quality: str
    resolution: int
    streamType: str
    ext: str
    filesize: int

class VideoExtractionResponse(BaseModel):
    title: str
    thumbnail: Optional[str] = None
    duration: Optional[float] = 0
    uploader: Optional[str] = None
    view_count: Optional[int] = None
    description: Optional[str] = None
    streams: Optional[List[StreamInfo]] = []
    error: Optional[str] = None
