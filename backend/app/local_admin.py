"""Administrative writes are local-only and reject cross-origin browser requests."""
from ipaddress import ip_address

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def loopback_host(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


class LocalAdminMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        protected = request.url.path.startswith("/api/v1/admin/") or request.url.path == "/questions/editor"
        if protected:
            origin = request.headers.get("origin")
            expected = f"{request.url.scheme}://{request.url.netloc}"
            permitted = request.client is not None and loopback_host(request.client.host) and loopback_host(request.url.hostname or "")
            if not permitted or origin is not None and origin != expected:
                return JSONResponse({"detail": "問題管理は、このPC上の同じURLからのみ利用できます。"}, status_code=403)
        response = await call_next(request)
        if protected:
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        return response
