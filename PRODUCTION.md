# VidCatch Production Deployment

This document covers the public-service deployment mode where the Chrome extension connects to a shared VidCatch backend.

## Required Environment

Set these variables before exposing the backend publicly:

```bash
VIDCATCH_PUBLIC_BASE_URL=https://api.example.com
VIDCATCH_API_KEYS=replace-with-long-random-key
VIDCATCH_CORS_ORIGINS=https://api.example.com
VIDCATCH_CORS_ORIGIN_REGEX=chrome-extension://.*
VIDCATCH_RATE_LIMIT_REQUESTS=60
VIDCATCH_RATE_LIMIT_WINDOW_SECONDS=60
VIDCATCH_DAILY_JOB_QUOTA=50
VIDCATCH_MAX_ACTIVE_JOBS_PER_KEY=2
VIDCATCH_MAX_GLOBAL_ACTIVE_JOBS=8
VIDCATCH_JOB_QUEUE_SIZE=100
VIDCATCH_JOB_TIMEOUT_SECONDS=1800
VIDCATCH_MAX_OUTPUT_BYTES=2147483648
VIDCATCH_STORAGE_MAX_BYTES=21474836480
```

Use a reverse proxy with HTTPS in front of FastAPI. Do not expose an unauthenticated `uvicorn --host 0.0.0.0` server.

## Operational Checks

- `/api/health`: process, FFmpeg, yt-dlp, temp storage and cleanup settings.
- `/api/ready`: database, worker count and storage capacity.
- `/api/metrics`: authenticated operational counters.

## Security Notes

- All production API calls require an API key.
- URL inputs are validated to reject localhost, private IPs, link-local, multicast and non-http schemes.
- Download output uses short-lived tokens and expires automatically.
- Temporary job directories are cleaned on success, cancel, error, token expiry and server startup.

## Extension Permission Justification

The extension requests `webRequest` and `<all_urls>` because VidCatch detects media streams by observing network response headers on arbitrary websites. Without this permission, it cannot reliably discover HLS/DASH/direct media URLs across sites.

If publishing to the Chrome Web Store, include this explanation in the permission justification and privacy disclosure.

## Release Gate

Before production release:

```bash
cd Extension
npm run check
npm run build

cd ../VidDownloadServer
python -m unittest discover -s tests
python -m py_compile app\api\routes.py app\api\routers\extract.py app\api\routers\downloads.py app\api\routers\health.py app\services\cleanup.py app\services\download_jobs.py app\services\storage.py app\services\extractor.py app\services\job_store.py app\core\security.py app\main.py
python -c "from app.main import app; print(app.title)"
```

Then smoke test:

- Invalid/missing API key.
- Unsupported or private-network URLs are rejected.
- Successful download creates and then cleans the job directory.
- Cancelled download cleans the job directory.
- Expired download token removes stale output.
