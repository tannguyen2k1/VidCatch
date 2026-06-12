import os

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
        # 'cookiefile': 'cookies.txt', # Uncomment if you need authentication
    }

settings = Settings()
