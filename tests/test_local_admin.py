from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.app.local_admin import LocalAdminMiddleware


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
        assert response.headers["content-security-policy"] == "frame-ancestors 'none'"
