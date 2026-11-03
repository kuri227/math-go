from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.app.local_admin import LocalAdminMiddleware, SlidingWindowLimiter, local_only_path


@pytest.mark.parametrize("client_host,host,origin,expected", [
    ("127.0.0.1", "127.0.0.1:8000", None, 200),
    ("::1", "localhost:8000", "http://localhost:8000", 200),
    ("192.168.1.10", "127.0.0.1:8000", None, 403),
    ("127.0.0.1", "evil.example:8000", None, 403),
    ("127.0.0.1", "127.0.0.1:8000", "https://evil.example", 403),
    ("127.0.0.1", "127.0.0.1:8000", "null", 403),
])
def test_admin_write_boundary(client_host, host, origin, expected):
    app = FastAPI(); app.add_middleware(LocalAdminMiddleware)
    calls = []
    @app.post("/api/v1/admin/test")
    def mutate():
        calls.append(1); return {"ok": True}
    headers = {"Origin": origin} if origin is not None else {}
    with TestClient(app, client=(client_host, 50000), base_url=f"http://{host}") as client:
        response = client.post("/api/v1/admin/test", headers=headers)
    assert response.status_code == expected
    assert len(calls) == (expected == 200)
    if expected == 200:
        assert response.headers["x-frame-options"] == "DENY"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "no-referrer"


@pytest.mark.parametrize("path", [
    "/questions/editor", "/models/preload", "/recognize", "/recognize/compare",
    "/samples", "/api/v1/test-samples", "/api/v1/recognitions",
    "/api/v1/models/texteller/preload", "/api/v1/admin/questions",
])
def test_local_only_route_inventory(path):
    assert local_only_path(path)


def test_security_headers_apply_to_public_responses():
    app = FastAPI(); app.add_middleware(LocalAdminMiddleware)
    @app.get("/public")
    def public():
        return {"ok": True}
    with TestClient(app, client=("192.168.1.10", 50000), base_url="http://example.test") as client:
        response = client.get("/public")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'self'" in response.headers["content-security-policy"]


def test_request_size_and_rate_limits_are_enforced():
    app = FastAPI()
    app.add_middleware(LocalAdminMiddleware, limiter=SlidingWindowLimiter(limit=1, window_seconds=60))
    @app.post("/samples")
    def mutate():
        return {"ok": True}
    with TestClient(app, client=("127.0.0.1", 50000), base_url="http://127.0.0.1") as client:
        assert client.post("/samples").status_code == 200
        limited = client.post("/samples")
        oversized = client.post("/samples", headers={"Content-Length": str(13 * 1024 * 1024)})
    assert limited.status_code == 429
    assert limited.headers["retry-after"]
    assert oversized.status_code == 413
