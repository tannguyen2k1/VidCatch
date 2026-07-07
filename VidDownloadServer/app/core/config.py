import os
from yt_dlp.networking.impersonate import ImpersonateTarget

class Settings:
    PROJECT_NAME: str = "VidDownloadServer"
    API_V1_STR: str = "/api"
    # Allow CORS from all origins for the browser extension
    BACKEND_CORS_ORIGINS: list[str] = ["*"]
    
    # yt-dlp specific settings
    YTDLP_OPTIONS: dict = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'nocheckcertificate': True,
        'legacyserverconnect': True,
        'impersonate': ImpersonateTarget.from_str('chrome-131'),
        'noplaylist': True,
        'socket_timeout': 15,
        # 'cookiefile': 'cookies.txt', # Uncomment if you need authentication
    }

settings = Settings()
