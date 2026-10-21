import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
import backend.app.main as main


@pytest.mark.parametrize("styles", [["game-assets/math.css"], ["game-assets/math.css", "game-assets/support.css"]])
def test_support_styles_resolve_transitive_manifest_imports(monkeypatch, tmp_path, styles):
    (tmp_path / ".vite").mkdir()
    (tmp_path / ".vite/manifest.json").write_text(json.dumps({"src/support.ts": {"imports": ["shared"]}, "shared": {"css": styles}}))
    monkeypatch.setattr(main, "GAME_DIST_DIR", tmp_path)
    with TestClient(main.app) as client:
        response = client.get("/support.css", follow_redirects=False)
    if len(styles) == 1:
        assert response.status_code == 307 and response.headers["location"] == "/" + styles[0]
    else:
        assert response.status_code == 200 and "text/css" in response.headers["content-type"]
        assert all('/' + style in response.text for style in styles)


def test_evaluation_and_editor_use_local_bounded_dependencies():
    root = Path(__file__).parents[1]
    html = (root / "frontend/index.html").read_text(encoding="utf-8")
    assert "cdn.jsdelivr" not in html and 'href="/support.css"' in html
    for name in ("app.js", "question-editor.js"):
        script = (root / "frontend" / name).read_text(encoding="utf-8")
        assert 'from "/game-assets/support.js"' in script
        assert "fetch(" not in script
