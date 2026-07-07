import os
from yt_dlp.networking.impersonate import ImpersonateTarget

class Settings:
    PROJECT_NAME: str = "VidDownloadServer"
    API_V1_STR: str = "/api"
    PUBLIC_BASE_URL: str = os.getenv("VIDCATCH_PUBLIC_BASE_URL", "http://localhost:8000")

    # Public deployment security settings
    BACKEND_CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("VIDCATCH_CORS_ORIGINS", "http://localhost:5173,http://localhost:8000").split(",")
        if origin.strip()
    ]
    BACKEND_CORS_ORIGIN_REGEX: str | None = os.getenv("VIDCATCH_CORS_ORIGIN_REGEX", r"chrome-extension://.*")
    API_KEYS: set[str] = {
        key.strip()
        for key in os.getenv("VIDCATCH_API_KEYS", "dev-local-key").split(",")
        if key.strip()
    }
    REQUIRE_API_KEY: bool = os.getenv("VIDCATCH_REQUIRE_API_KEY", "true").lower() != "false"
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("VIDCATCH_RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_REQUESTS: int = int(os.getenv("VIDCATCH_RATE_LIMIT_REQUESTS", "60"))
    DAILY_JOB_QUOTA: int = int(os.getenv("VIDCATCH_DAILY_JOB_QUOTA", "50"))
    MAX_ACTIVE_JOBS_PER_KEY: int = int(os.getenv("VIDCATCH_MAX_ACTIVE_JOBS_PER_KEY", "2"))
    MAX_GLOBAL_ACTIVE_JOBS: int = int(os.getenv("VIDCATCH_MAX_GLOBAL_ACTIVE_JOBS", "8"))
    JOB_QUEUE_SIZE: int = int(os.getenv("VIDCATCH_JOB_QUEUE_SIZE", "100"))
    JOB_TIMEOUT_SECONDS: int = int(os.getenv("VIDCATCH_JOB_TIMEOUT_SECONDS", "1800"))
    MAX_OUTPUT_BYTES: int = int(os.getenv("VIDCATCH_MAX_OUTPUT_BYTES", str(2 * 1024 * 1024 * 1024)))
    STORAGE_MAX_BYTES: int = int(os.getenv("VIDCATCH_STORAGE_MAX_BYTES", str(20 * 1024 * 1024 * 1024)))
    DATABASE_PATH: str = os.getenv(
        "VIDCATCH_DATABASE_PATH",
        os.path.join(os.getenv("TEMP", "/tmp"), "VidCatch", "vidcatch.db"),
    )

    # Temporary download cleanup settings
    DOWNLOAD_TOKEN_TTL_SECONDS: int = 30 * 60
    DOWNLOAD_STALE_JOB_SECONDS: int = 6 * 60 * 60
    DOWNLOAD_CLEANUP_INTERVAL_SECONDS: int = 10 * 60
    
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
