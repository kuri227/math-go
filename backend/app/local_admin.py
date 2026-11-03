"""Security boundary for the local exhibition service.

The game intentionally has no login screen. Operations that write local data
or consume model resources are therefore available only from this machine and
from the same browser origin.
"""
from __future__ import annotations

from collections import defaultdict, deque
from ipaddress import ip_address
from threading import Lock
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


MAX_REQUEST_BYTES = 12 * 1024 * 1024
GLOBAL_SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
        "form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "font-src 'self' data:; img-src 'self' data: blob:; media-src 'self'; "
        "connect-src 'self' ws: wss:; worker-src 'self' blob:"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
LOCAL_ONLY_EXACT = frozenset(
    {
        "/questions/editor",
        "/models/preload",
        "/recognize",
        "/recognize/compare",
        "/samples",
        "/api/v1/test-samples",
        "/api/v1/recognitions",
    }
)


def loopback_host(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def local_only_path(path: str) -> bool:
    return (
        path in LOCAL_ONLY_EXACT
        or path.startswith("/api/v1/admin/")
        or path.startswith("/api/v1/models/") and path.endswith("/preload")
    )


def _same_origin(request) -> bool:
    origin = request.headers.get("origin")
    expected = f"{request.url.scheme}://{request.url.netloc}"
    return origin is None or origin == expected


class SlidingWindowLimiter:
    """Process-local limiter for the single-PC service."""

    def __init__(self, limit: int = 90, window_seconds: float = 60.0):
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (current - events[0])) + 1)
                return False, retry_after
            events.append(current)
        return True, 0


class LocalAdminMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limiter: SlidingWindowLimiter | None = None):
        super().__init__(app)
        self.limiter = limiter or SlidingWindowLimiter()

    async def dispatch(self, request, call_next):
        path = request.url.path
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_BYTES:
                    return self._response({"detail": "Request body exceeds 12 MiB"}, status_code=413)
            except ValueError:
                return self._response({"detail": "Invalid Content-Length"}, status_code=400)

        protected = local_only_path(path)
        if protected:
            permitted = (
                request.client is not None
                and loopback_host(request.client.host)
                and loopback_host(request.url.hostname or "")
                and _same_origin(request)
            )
            if not permitted:
                return self._response(
                    {"detail": "この操作は、このPC上の同じURLからのみ利用できます。"},
                    status_code=403,
                )
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                allowed, retry_after = self.limiter.allow(f"{request.client.host}:{path}")
                if not allowed:
                    return self._response(
                        {"detail": "操作が集中しています。少し待ってから再試行してください。"},
                        status_code=429,
                        headers={"Retry-After": str(retry_after)},
                    )

        response = await call_next(request)
        for name, value in GLOBAL_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response

    @staticmethod
    def _response(content, *, status_code: int, headers: dict[str, str] | None = None):
        response = JSONResponse(content, status_code=status_code, headers=headers)
        for name, value in GLOBAL_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response
