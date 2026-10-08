from io import BytesIO
import mimetypes

from fastapi.testclient import TestClient
from PIL import Image

from backend.app.config import Paths
from backend.app.main import GAME_DIST_DIR, app
from backend.app.recognizers.base import Recognition


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (20, 10), "white").save(output, format="PNG")
    return output.getvalue()


def test_health():
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_javascript_mime_type_is_safe_for_es_modules():
    assert mimetypes.guess_type("bundle.js")[0] == "text/javascript"


def test_built_game_javascript_is_served_as_a_module_compatible_type():
    javascript_assets = sorted((GAME_DIST_DIR / "game-assets").glob("*.js"))
    if not javascript_assets:
        return

    with TestClient(app) as client:
        response = client.get(f"/game-assets/{javascript_assets[0].name}")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";", 1)[0] == "text/javascript"


def test_model_preload_starts_background_loading(monkeypatch):
    import backend.app.main as main_module

    calls = []
    monkeypatch.setattr(main_module.registry, "begin_preload", lambda: calls.append(True) or "loading")
    with TestClient(app) as client:
        response = client.post("/models/preload")
    assert response.status_code == 200
    assert response.json() == {"status": "loading"}
    assert calls == [True]


def test_game_preload_only_starts_requested_model(monkeypatch):
    import backend.app.main as main_module

    calls = []
    monkeypatch.setattr(
        main_module.registry,
        "begin_preload",
        lambda names=None: calls.append(names) or "loading",
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/models/texteller/preload")
    assert response.status_code == 200
    assert response.json() == {"status": "loading", "model": "texteller"}
    assert calls == [("texteller",)]


def test_unknown_model_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/recognize",
            data={"model": "unknown"},
            files={"image": ("test.png", png_bytes(), "image/png")},
        )
    assert response.status_code == 400


def test_invalid_image_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/recognize",
            data={"model": "texteller"},
            files={"image": ("test.png", b"not an image", "image/png")},
        )
    assert response.status_code == 400


def test_compare_passes_the_exact_same_png_to_both_models(monkeypatch):
    import backend.app.main as main_module

    seen: list[tuple[str, str, bytes]] = []

    class FakeRecognizer:
        variant = "test"
        device = "cpu"
        initialization_ms = 1.0
        peak_vram_mb = None

        def __init__(self, name: str):
            self.name = name

        def recognize(self, image_path):
            seen.append((self.name, str(image_path), image_path.read_bytes()))
            return Recognition("x", 2.0, self.name, self.variant, self.device, 1.0, None)

    recognizers = {name: FakeRecognizer(name) for name in ("texteller", "unimernet")}
    monkeypatch.setattr(main_module.registry, "get", lambda name: recognizers[name])
    with TestClient(app) as client:
        response = client.post(
            "/recognize/compare",
            files={"image": ("test.png", png_bytes(), "image/png")},
        )
    assert response.status_code == 200
    assert [entry[0] for entry in seen] == ["texteller", "unimernet"]
    assert seen[0][1] == seen[1][1]
    assert seen[0][2] == seen[1][2] == png_bytes()


def test_game_recognition_returns_normalized_latex_and_timing(monkeypatch):
    import backend.app.main as main_module

    class FakeRecognizer:
        name = "texteller"
        variant = "test"
        device = "cpu"
        initialization_ms = 10.0
        peak_vram_mb = None

        def recognize(self, _image_path):
            return Recognition(
                r"\[y = x ^ { 2 }\]",
                2.0,
                self.name,
                self.variant,
                self.device,
                self.initialization_ms,
                self.peak_vram_mb,
            )

    monkeypatch.setattr(main_module.registry, "get", lambda _name: FakeRecognizer())
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/recognitions",
            data={"model": "texteller", "request_id": "request-1"},
            files={"image": ("test.png", png_bytes(), "image/png")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == "request-1"
    assert body["raw_latex"] == r"\[y = x ^ { 2 }\]"
    assert body["normalized_latex"] == "y=x^2"
    assert body["timing"]["inference_ms"] == 2.0
    assert body["image"] == {"width": 20, "height": 10, "bytes": len(png_bytes())}


def test_game_questions_do_not_expose_answers():
    with TestClient(app) as client:
        response = client.get("/api/v1/questions")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 50
    assert body[0]["id"] == "add-single"
    assert body[0]["difficulty"] == 1
    assert body[0]["difficulty_label"] == "小学校低学年"
    assert body[0]["display_latex"] == "7+5"
    assert "answer_latex" not in body[0]
    assert "accepted_latex" not in body[0]

    by_id = {question["id"]: question for question in body}
    assert by_id["definite-integral"]["display_latex"] == r"\int_{0}^{1}x\,dx"
    assert by_id["standard-limit"]["display_latex"] == r"\lim_{x\to0}\frac{\sin x}{x}"
    assert by_id["matrix-determinant"]["display_latex"] == r"\begin{vmatrix}1&2\\3&4\end{vmatrix}"


def test_game_judgement_accepts_normalized_aliases():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/judgements",
            json={
                "question_id": "differentiate-quadratic",
                "recognized_latex": r"\[3 + 2x\]",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["correct"] is True
    assert body["recognized_normalized"] == "3+2x"
    assert body["judge_method"] == "normalized_alias"
    assert "導関数" in body["explanation"]


def test_game_judgement_preserves_function_command_boundary():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/judgements",
            json={
                "question_id": "differentiate-sine",
                "recognized_latex": r"\[\cos x\]",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["correct"] is True
    assert body["recognized_normalized"] == r"\cos x"
    assert body["expected_latex"] == r"\cos x"


def test_game_solution_reveals_answer_after_skip_or_timeout():
    with TestClient(app) as client:
        response = client.get("/api/v1/solutions/fraction-add")
    assert response.status_code == 200
    body = response.json()
    assert body["expected_latex"] == r"\frac{3}{4}"
    assert "3/4" in body["explanation"]


def test_game_judgement_rejects_unknown_question():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/judgements",
            json={"question_id": "missing", "recognized_latex": "x"},
        )
    assert response.status_code == 404


def test_custom_sample_is_saved(monkeypatch, tmp_path):
    import backend.app.main as main_module

    custom = tmp_path / "data" / "custom"
    test_paths = Paths(
        repo_root=tmp_path,
        unimer_archive=tmp_path / "archive.zip",
        unimer_test=tmp_path / "unimer",
        hwe_manifest=tmp_path / "hwe.csv",
        custom_eval=custom,
        results=tmp_path / "results",
    )
    monkeypatch.setattr(main_module, "paths", test_paths)
    strokes = '{"pointer_types":["mouse"],"strokes":[{"pointerType":"mouse","points":[{"x":1,"y":2,"t":3,"pressure":0}]}]}'
    with TestClient(app) as client:
        response = client.post(
            "/samples",
            data={
                "strokes_json": strokes,
                "ground_truth_latex": "x^2",
                "category": "exponent",
                "difficulty": "easy",
                "writer_id": "writer-01",
            },
            files={"image": ("test.png", png_bytes(), "image/png")},
        )
    assert response.status_code == 200
    saved = response.json()
    assert (tmp_path / saved["image_path"]).is_file()
    assert (tmp_path / saved["stroke_path"]).is_file()
    assert (custom / "manifest.csv").is_file()
