import csv
import json
import uuid
from collections import Counter
from dataclasses import replace
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import backend.app.main as main
from backend.app.game_questions import DEFAULT_QUESTION_PATH, load_questions, update_question_review
from scripts.import_friend_questions import convert


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "paths", replace(main.paths, custom_eval=tmp_path / "custom", repo_root=tmp_path))
    with TestClient(main.app) as client:
        yield client


def payload(**overrides):
    return {"question_id": "d1-s1-r01-v01", "ground_truth_latex": "4", "recognized_latex": "9", "recognition_request_id": str(uuid.uuid4()), "consent": "true", "label_confirmed": "true", "strokes_json": json.dumps({"strokes": [{"pointerType": "pen", "points": [{"x": 1, "y": 2, "pressure": .5}]}], "pointer_types": ["pen"]}), **overrides}


def png():
    data = BytesIO(); Image.new("RGB", (40, 20), "white").save(data, format="PNG")
    return {"image": ("ink.png", data.getvalue(), "image/png")}


def test_import_has_516_questions_and_keeps_originals():
    questions = load_questions()
    assert Counter(q.difficulty for q in questions) == {1: 36, 2: 30, 3: 90, 4: 90, 5: 90, 6: 90, 7: 90}
    assert sum(q.exhibition_enabled for q in questions) >= 49
    assert len(load_questions(DEFAULT_QUESTION_PATH.parent / "question_sources/legacy_50_questions.json")) == 50
    assert all(q.review_status == "approved" for q in questions if q.exhibition_enabled)


def test_sample_uses_actual_transcription_not_problem_solution(client, tmp_path):
    result = client.post("/api/v1/test-samples", data=payload(), files=png())
    assert result.status_code == 201, result.text
    sample_id = result.json()["sample_id"]
    metadata = json.loads((tmp_path / "custom/metadata" / f"{sample_id}.json").read_text(encoding="utf-8"))
    assert metadata["ground_truth_latex"] == "4"  # written, intentionally wrong math answer
    assert metadata["recognized_latex"] == "9"  # model's error is retained separately
    assert metadata["reference_answer_latex"] == "3"  # never substituted for handwritten label
    assert metadata["human_verified"] is True
    assert metadata["training_status"] == "candidate_requires_dataset_review"
    with (tmp_path / "custom/manifest.csv").open(encoding="utf-8", newline="") as handle:
        row = next(csv.DictReader(handle))
    assert row["ground_truth_latex"] == "4"
    assert (tmp_path / result.json()["image_path"]).is_file()
    assert (tmp_path / result.json()["stroke_path"]).is_file()


@pytest.mark.parametrize("override,code", [({"consent": "false"}, 400), ({"label_confirmed": "false"}, 400), ({"ground_truth_latex": " "}, 400), ({"ground_truth_latex": "x" * 4001}, 400), ({"strokes_json": "invalid"}, 400), ({"strokes_json": "[]"}, 400), ({"strokes_json": '{"strokes":[]}'}, 400), ({"strokes_json": '{"strokes":[{}]}'}, 400), ({"strokes_json": '{"strokes":[{"points":[{"x":"bad","y":0}]}]}'}, 400), ({"question_id": "unknown"}, 404), ({"recognition_request_id": "../../bad"}, 400), ({"writer_id": "../../bad"}, 400)])
def test_invalid_samples_do_not_write_files(client, tmp_path, override, code):
    response = client.post("/api/v1/test-samples", data=payload(**override), files=png())
    assert response.status_code == code
    assert not list((tmp_path / "custom").rglob("*.png"))


def test_corrupt_sample_image_rejected(client):
    assert client.post("/api/v1/test-samples", data=payload(), files={"image": ("bad.png", b"bad", "image/png")}).status_code == 400


def test_save_retry_does_not_duplicate_or_overwrite_labels(client, tmp_path):
    data = payload()
    first = client.post("/api/v1/test-samples", data=data, files=png())
    second = client.post("/api/v1/test-samples", data=data, files=png())
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert len(list((tmp_path / "custom/images").glob("*.png"))) == 1
    with (tmp_path / "custom/manifest.csv").open(encoding="utf-8", newline="") as handle:
        assert len(list(csv.DictReader(handle))) == 1
    assert client.post("/api/v1/test-samples", data={**data, "ground_truth_latex": "different"}, files=png()).status_code == 400


def test_review_update_validates_before_write(tmp_path):
    path = tmp_path / "bank.json"; path.write_bytes(DEFAULT_QUESTION_PATH.read_bytes())
    before = path.read_bytes()
    with pytest.raises(ValueError): update_question_review("d1-s1-r01-v01", "pending", True, path)
    assert path.read_bytes() == before
    q = update_question_review("d1-s1-r01-v01", "needs_revision", False, path)
    assert not q.exhibition_enabled
    assert load_questions(path)[0].review_status == "needs_revision"
    with pytest.raises(KeyError): update_question_review("missing", "approved", False, path)


def test_review_endpoint_returns_updated_public_fields(client, monkeypatch):
    original = load_questions()[0]
    monkeypatch.setattr(main, "update_question_review", lambda qid, status, enabled: replace(original, review_status=status, exhibition_enabled=enabled))
    result = client.patch(f"/api/v1/admin/questions/{original.id}/review", json={"review_status": "approved", "exhibition_enabled": True})
    assert result.status_code == 200
    assert result.json()["exhibition_enabled"] is True
    assert "answer" not in result.json()


def test_source_transform_fixes_ambiguous_notation():
    base = {"difficulty": 7, "sublevel": 3, "rank": 8, "question": "$c_n$", "answer": ["3"], "description": "説明"}
    assert convert(base, 1)["prompt"] == "$c_2$"


def test_question_cache_reuses_immutable_bank_but_refreshes_on_review(tmp_path):
    from backend.app.game_questions import get_questions
    path = tmp_path / "questions.json"
    path.write_bytes(DEFAULT_QUESTION_PATH.read_bytes())
    before = get_questions(path)
    assert get_questions(path) is before
    update_question_review(before[0].id, "needs_revision", False, path)
    after = get_questions(path)
    assert after is not before
    assert after[0].review_status == "needs_revision"
