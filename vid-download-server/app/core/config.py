import os
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional
from yt_dlp.networking.impersonate import ImpersonateTarget


CONFIG_DIR = Path(__file__).resolve().parent
APP_DIR = CONFIG_DIR.parent
PROJECT_ROOT = APP_DIR.parent


def load_environment():
    env_file = os.getenv("VIDCATCH_ENV_FILE")
    load_dotenv(Path(env_file) if env_file else PROJECT_ROOT / ".env")


load_environment()


def env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value else default


class Settings:
    PROJECT_NAME: str = "VidDownloadServer"
    API_V1_STR: str = "/api"
    PUBLIC_BASE_URL: str = os.getenv("VIDCATCH_PUBLIC_BASE_URL", "http://localhost:8000")

    # Public deployment security settings
    BACKEND_CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("VIDCATCH_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:8000").split(",")
        if origin.strip()
    ]
    BACKEND_CORS_ORIGIN_REGEX: Optional[str] = os.getenv("VIDCATCH_CORS_ORIGIN_REGEX", r"chrome-extension://.*")
    ALLOW_LOCAL_URLS: bool = os.getenv("VIDCATCH_ALLOW_LOCAL_URLS", "true").lower() == "true"
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("VIDCATCH_RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_REQUESTS: int = int(os.getenv("VIDCATCH_RATE_LIMIT_REQUESTS", "60"))
    DAILY_JOB_QUOTA: int = int(os.getenv("VIDCATCH_DAILY_JOB_QUOTA", "50"))
    MAX_ACTIVE_JOBS_PER_KEY: int = int(os.getenv("VIDCATCH_MAX_ACTIVE_JOBS_PER_KEY", "2"))
    MAX_GLOBAL_ACTIVE_JOBS: int = int(os.getenv("VIDCATCH_MAX_GLOBAL_ACTIVE_JOBS", "8"))
    JOB_QUEUE_SIZE: int = int(os.getenv("VIDCATCH_JOB_QUEUE_SIZE", "100"))
    JOB_TIMEOUT_SECONDS: int = int(os.getenv("VIDCATCH_JOB_TIMEOUT_SECONDS", "1800"))
    MAX_OUTPUT_BYTES: int = int(os.getenv("VIDCATCH_MAX_OUTPUT_BYTES", str(2 * 1024 * 1024 * 1024)))
    STORAGE_MAX_BYTES: int = int(os.getenv("VIDCATCH_STORAGE_MAX_BYTES", str(20 * 1024 * 1024 * 1024)))
    DATABASE_PATH: str = env_str(
        "VIDCATCH_DATABASE_PATH",
        os.path.join(os.getenv("TEMP", "/tmp"), "VidCatch", "vidcatch.db"),
    )

    # Temporary download cleanup settings
    DOWNLOAD_TOKEN_TTL_SECONDS: int = int(os.getenv("VIDCATCH_DOWNLOAD_TOKEN_TTL_SECONDS", str(30 * 60)))
    DOWNLOAD_STALE_JOB_SECONDS: int = int(os.getenv("VIDCATCH_DOWNLOAD_STALE_JOB_SECONDS", str(6 * 60 * 60)))
    DOWNLOAD_CLEANUP_INTERVAL_SECONDS: int = int(os.getenv("VIDCATCH_DOWNLOAD_CLEANUP_INTERVAL_SECONDS", str(10 * 60)))
    YTDLP_CONCURRENT_FRAGMENTS: int = int(os.getenv("VIDCATCH_YTDLP_CONCURRENT_FRAGMENTS", "16"))
    YTDLP_SOCKET_TIMEOUT: int = int(os.getenv("VIDCATCH_YTDLP_SOCKET_TIMEOUT", "30"))
    
    # yt-dlp specific settings
    YTDLP_OPTIONS: dict = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'nocheckcertificate': True,
        'legacyserverconnect': True,
        'impersonate': ImpersonateTarget.from_str('chrome-110'),
        'noplaylist': True,
        'socket_timeout': YTDLP_SOCKET_TIMEOUT,
        'retries': 10,
        'fragment_retries': 10,
        'retry_sleep': 2,
        # 'cookiefile': 'cookies.txt', # Uncomment if you need authentication
    }

settings = Settings()
