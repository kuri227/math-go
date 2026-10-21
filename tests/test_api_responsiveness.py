import asyncio
import threading
import time
from io import BytesIO

import httpx
import pytest
from PIL import Image

import backend.app.main as main
from backend.app.recognizers.base import Recognition


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["/recognize", "/recognize/compare"])
async def test_legacy_recognition_does_not_block_health_requests(monkeypatch, route):
    started, release = threading.Event(), threading.Event()
    class SlowRecognizer:
        variant = "test"
        device = "cpu"
        initialization_ms = 0
        peak_vram_mb = None
        def __init__(self, name): self.name = name
        def recognize(self, _path):
            started.set(); release.wait(3)
            return Recognition("1", 1, self.name, "test", "cpu", 0, None)
    monkeypatch.setattr(main.registry, "get", lambda name: SlowRecognizer(name))
    image = BytesIO(); Image.new("RGB", (20, 10), "white").save(image, format="PNG")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        began = time.perf_counter()
        task = asyncio.create_task(client.post(route, data={"model": "texteller"}, files={"image": ("test.png", image.getvalue(), "image/png")}))
        try:
            assert await asyncio.to_thread(started.wait, 1)
            assert time.perf_counter() - began < 1, "Inference blocked the event loop before health could run"
            health = await asyncio.wait_for(client.get("/api/v1/health/live"), .5)
            assert health.status_code == 200
        finally:
            release.set()
            response = await task
        assert response.status_code == 200


@pytest.mark.parametrize("route", ["/recognize", "/recognize/compare", "/api/v1/recognitions"])
def test_pixel_limit_is_shared_by_all_recognition_routes(monkeypatch, route):
    from fastapi.testclient import TestClient
    import backend.app.uploads as uploads
    monkeypatch.setattr(uploads, "MAX_IMAGE_PIXELS", 100)
    image = BytesIO(); Image.new("RGB", (20, 10), "white").save(image, format="PNG")
    with TestClient(main.app) as client:
        response = client.post(route, data={"model": "texteller"}, files={"image": ("test.png", image.getvalue(), "image/png")})
    assert response.status_code == 413
