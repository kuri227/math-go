"""Exhaustive bank/API/static checks; no model downloads or real bank edits."""
from io import BytesIO
import re

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.app.game_questions import get_questions
from backend.app.main import app, GAME_DIST_DIR

QUESTIONS = get_questions()
ALIASES = [(q.id, answer) for q in QUESTIONS for answer in q.accepted_latex]


@pytest.mark.parametrize("question_id,answer", ALIASES, ids=[f"{i}-{qid}" for i, (qid, _) in enumerate(ALIASES)])
def test_every_registered_alias_is_accepted(question_id, answer):
    with TestClient(app) as client:
        response = client.post("/api/v1/judgements", json={"question_id": question_id, "recognized_latex": answer})
    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.parametrize("question", QUESTIONS, ids=[q.id for q in QUESTIONS])
def test_every_solution_is_available_and_empty_answer_is_not_correct(question):
    with TestClient(app) as client:
        response = client.get(f"/api/v1/solutions/{question.id}")
        assert response.status_code == 200
        assert response.json()["expected_latex"] == question.answer_latex
        assert response.json()["explanation"].strip()
        invalid = client.post("/api/v1/judgements", json={"question_id": question.id, "recognized_latex": "not-an-answer"})
        assert invalid.status_code == 200
        assert invalid.json()["correct"] is False


@pytest.mark.parametrize("format", ["PNG", "JPEG", "WEBP"])
def test_supported_image_formats_reach_recognizer(format, monkeypatch):
    import backend.app.main as main
    from backend.app.recognizers.base import Recognition

    class Recognizer:
        def recognize(self, path):
            assert path.exists()
            return Recognition("12", 1, "texteller", "test", "cpu", 0, None)

    monkeypatch.setattr(main.registry, "get", lambda _: Recognizer())
    image = BytesIO()
    Image.new("RGB", (32, 32), "white").save(image, format=format)
    with TestClient(app) as client:
        response = client.post("/api/v1/recognitions", data={"request_id": "format-test"}, files={"image": (f"test.{format.lower()}", image.getvalue(), f"image/{format.lower()}")})
    assert response.status_code == 200
    assert response.json()["request_id"] == "format-test"


def test_oversized_image_is_rejected_before_inference():
    with TestClient(app) as client:
        response = client.post("/api/v1/recognitions", files={"image": ("oversized.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")})
    assert response.status_code == 413


@pytest.mark.parametrize("route,filename", [("/", "index.html"), ("/display", "display.html"), ("/controller", "controller.html")])
def test_production_pages_and_their_assets(route, filename):
    if not (GAME_DIST_DIR / filename).is_file():
        pytest.skip("Build first; exhibition verification requires this test without skips")
    with TestClient(app) as client:
        page = client.get(route)
        assert page.status_code == 200
        assert "text/html" in page.headers["content-type"]
        assets = set(re.findall(r'(?:src|href)="(/game-assets/[^"]+)"', page.text))
        assert assets
        for asset in assets:
            response = client.get(asset)
            assert response.status_code == 200, asset
            if asset.endswith(".js"):
                assert "javascript" in response.headers["content-type"]


def test_readiness_rejects_unknown_model():
    with TestClient(app) as client:
        assert client.get("/api/v1/health/ready?model=missing").status_code == 400


def test_admin_rejects_malformed_payload_without_editing_bank():
    before = [q.id for q in get_questions()]
    with TestClient(app) as client:
        assert client.post("/api/v1/admin/questions", json={"id": "invalid"}).status_code == 422
    assert [q.id for q in get_questions()] == before
