import ipaddress
import socket
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from fastapi import Header, HTTPException, Query, WebSocket

from app.core.config import settings


rate_buckets: dict[str, deque[float]] = defaultdict(deque)


def _is_forbidden_ip(ip: str) -> bool:
    address = ipaddress.ip_address(ip)
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def validate_public_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")

    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL host is required")

    try:
        resolved = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="URL host cannot be resolved")

    for result in resolved:
        ip = result[4][0]
        if not settings.ALLOW_LOCAL_URLS and _is_forbidden_ip(ip):
            raise HTTPException(status_code=400, detail="Private or local network URLs are not allowed")

    return url


def validate_public_url_for_ws(url: str):
    try:
        validate_public_url(url)
    except HTTPException as exc:
        raise ValueError(str(exc.detail)) from exc


def authenticate_api_key(x_api_key: str = Header(default=""), api_key: str = Query(default="")) -> str:
    key = x_api_key or api_key
    return key or "anonymous"


async def authenticate_websocket(websocket: WebSocket) -> str | None:
    key = websocket.query_params.get("api_key") or websocket.headers.get("x-api-key")
    key = websocket.query_params.get("api_key")
    if not key and "x-api-key" in websocket.headers:
        key = websocket.headers["x-api-key"]

    return key or "anonymous"


def check_rate_limit(api_key: str):
    now = time.time()
    bucket = rate_buckets[api_key]
    window_start = now - settings.RATE_LIMIT_WINDOW_SECONDS

    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= settings.RATE_LIMIT_REQUESTS:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    bucket.append(now)


def check_rate_limit_for_ws(api_key: str):
    try:
        check_rate_limit(api_key)
    except HTTPException as exc:
        raise ValueError(str(exc.detail)) from exc
