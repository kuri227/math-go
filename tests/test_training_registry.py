import json
import sqlite3

import pytest
from PIL import Image, ImageDraw, ImageOps

from backend.training.registry import Registry, canonical_image, normalize_label
from backend.training.execution_lock import execution_lock


def test_abandon_interrupted_never_releases_consumed_images(setup):
    registry = reviewed(setup)
    run_id, _ = registry.reserve(registry.plan(), {})
    uses = list(registry.db.execute("SELECT * FROM uses"))
    with execution_lock(registry.root), pytest.raises(ValueError, match="active"):
        registry.abandon_interrupted(run_id, "operator", "power loss", True)
    with pytest.raises(ValueError, match="confirmation"):
        registry.abandon_interrupted(run_id, "operator", "power loss", False)
    registry.abandon_interrupted(run_id, "operator", "power loss", True)
    assert registry.plan()["train"] == []
    assert list(registry.db.execute("SELECT * FROM uses")) == uses
    run = registry.status()["runs"][0]
    assert run["status"] == "failed" and "operator" in run["detail"]
    with pytest.raises(ValueError, match="interrupted"):
        registry.abandon_interrupted(run_id, "operator", "again", True)


def test_offline_near_duplicate_sheet_is_read_only_and_escapes_labels(setup, tmp_path):
    from backend.training.review_report import write_near_duplicate_report
    registry = reviewed(setup)
    registry.db.execute("UPDATE samples SET label='<script>bad</script>'"); registry.db.commit()
    before = registry.status()
    output = tmp_path / "review.html"
    assert write_near_duplicate_report(registry, output) > 0
    assert registry.status() == before
    html = output.read_text(encoding="utf-8")
    assert "data:image/png;base64," in html and "<script>" not in html
    assert "自動承認は行いません" in html
    with pytest.raises(FileExistsError):
        write_near_duplicate_report(registry, output)


@pytest.fixture
def setup(tmp_path):
    source = tmp_path / "data/custom"
    (source / "images").mkdir(parents=True)
    (source / "metadata").mkdir()
    registry = Registry(tmp_path / "training")
    yield registry, source, tmp_path
    registry.close()


def sample(source, name, number=1, writer=None, **extra):
    image = Image.new("RGB", (120, 80), "white")
    draw = ImageDraw.Draw(image)
    draw.line((20, 20, 30 + number * 3, 50), fill="black", width=4)
    draw.line((20, 50, 60 + number * 2, 50), fill="black", width=4)
    image.save(source / "images" / f"{name}.png")
    meta = {"sample_id": name, "image_path": str(source / "images" / f"{name}.png"),
            "ground_truth_latex": "$3$", "writer_id": writer or name,
            "consent": True, "human_verified": True, **extra}
    (source / "metadata" / f"{name}.json").write_text(json.dumps(meta), encoding="utf-8")
    return meta


def reviewed(setup):
    registry, source, repo = setup
    for n, split in enumerate(("train", "validation", "test"), 1):
        sample(source, split, n)
    assert registry.scan(source, repo)["imported"] == 3
    for split in ("train", "validation", "test"):
        registry.review(split, split, "reviewer", True)
    return registry


@pytest.mark.parametrize("value", ["3", "$3$", "$$3$$", r"\[3\]", r"\(3\)"])
def test_normalize(value):
    assert normalize_label(value) == "3"


@pytest.mark.parametrize("value", ["", "$$", "x" * 4001])
def test_reject_label(value):
    with pytest.raises(ValueError):
        normalize_label(value)


def test_scan_is_idempotent_and_deduplicates_renamed_reencoded_padded_images(setup):
    registry, source, repo = setup
    sample(source, "a", writer="w")
    sample(source, "b", writer="w")
    padded = ImageOps.expand(Image.open(source / "images/b.png"), border=20, fill="white")
    padded.save(source / "images/b.png", compress_level=1)
    first = registry.scan(source, repo)
    assert (first["imported"], first["duplicates"]) == (1, 1)
    assert registry.scan(source, repo)["duplicates"] == 2
    assert len(registry.status()["samples"]) == 1


@pytest.mark.parametrize("extra", [{"consent": False}, {"human_verified": False}, {"consent": "true"},
                                    {"writer_id": "anonymous"}, {"writer_id": "qa-synthetic-exclude"}, {"writer_id": ""}])
def test_excludes_unconsented_unverified_qa_anonymous(setup, extra):
    registry, source, repo = setup
    sample(source, "a", **extra)
    assert len(registry.scan(source, repo)["rejected"]) == 1
    assert registry.status()["samples"] == []


def test_legacy_metadata_is_not_implicitly_consented(setup):
    registry, source, repo = setup
    meta = sample(source, "a"); del meta["consent"]
    (source / "metadata/a.json").write_text(json.dumps(meta))
    assert registry.scan(source, repo)["rejected"]


def test_duplicate_label_conflict_quarantines_previously_approved_image(setup):
    registry, source, repo = setup
    sample(source, "a", writer="w"); registry.scan(source, repo); registry.review("a", "train", "r")
    sample(source, "b", writer="w", ground_truth_latex="4")
    assert registry.scan(source, repo)["rejected"]
    assert registry.plan()["train"] == []
    with pytest.raises(ValueError, match="quarantined"):
        registry.review("a", "train", "r")


def test_writer_splits_are_immutable_and_near_duplicates_require_inspection(setup):
    registry, source, repo = setup
    sample(source, "a", 1, "w"); sample(source, "b", 2, "w"); registry.scan(source, repo)
    registry.review("a", "train", "r", True)
    with pytest.raises(ValueError, match="another split"):
        registry.review("b", "test", "r", True)
    with pytest.raises(ValueError):
        registry.review("a", "test", "r", True)
    registry.db.execute("UPDATE samples SET dhash='0000000000000000'"); registry.db.commit()
    with pytest.raises(ValueError, match="Near-duplicate"):
        registry.review("b", "train", "r")


@pytest.mark.parametrize("status", ["completed", "failed"])
def test_used_images_never_return_after_success_or_failure(setup, status):
    registry = reviewed(setup)
    plan = registry.plan(); run_id, _ = registry.reserve(plan, {})
    with pytest.raises(ValueError, match="active"):
        registry.plan()
    registry.finish(run_id, status, "test")
    assert registry.plan()["train"] == []
    assert len(registry.plan()["validation"]) == 1
    with pytest.raises(ValueError, match="Consumed"):
        registry.review("train", "train", "r", True)
    with pytest.raises(ValueError):
        registry.reserve(registry.plan(), {})
    with pytest.raises(ValueError):
        registry.finish(run_id, status, "again")


def test_no_replay_via_new_filename_or_reimport(setup):
    registry = reviewed(setup)
    run_id, _ = registry.reserve(registry.plan(), {}); registry.finish(run_id, "failed", "failure")
    _, source, repo = setup
    sample(source, "renamed", 1, writer="train")
    assert registry.scan(source, repo)["duplicates"] == 4
    registry.review("validation", "validation", "r", True)
    assert registry.plan()["train"] == []


def test_second_connection_and_interrupted_run_cannot_claim_again(setup):
    registry = reviewed(setup); other = Registry(registry.root)
    plan = other.plan(); registry.reserve(registry.plan(), {})
    try:
        with pytest.raises(ValueError, match="active"):
            other.reserve(plan, {})
    finally:
        other.close()


def test_preflight_rejects_changed_plan_without_consumption(setup):
    registry = reviewed(setup); plan = registry.plan()
    registry.db.execute("UPDATE samples SET reviewer='changed'"); registry.db.commit()
    with pytest.raises(ValueError, match="changed"):
        registry.reserve(plan, {})
    assert registry.db.execute("SELECT count(*) FROM uses").fetchone()[0] == 0


@pytest.mark.parametrize("kind", ["image", "consent"])
def test_changed_snapshot_or_consent_blocks_training(setup, kind):
    registry = reviewed(setup); plan = registry.plan()
    path = registry.root / "objects" / f"{plan['train'][0]['hash']}.png" if kind == "image" else setup[1] / "metadata/train.json"
    path.write_bytes(b"changed")
    with pytest.raises(ValueError, match="changed|modified"):
        registry.reserve(plan, {})
    assert registry.db.execute("SELECT count(*) FROM uses").fetchone()[0] == 0


def test_missing_ledger_is_never_reinitialized(setup):
    registry, _, _ = setup
    registry.close(); (registry.root / "registry.sqlite3").unlink()
    with pytest.raises(ValueError, match="Incomplete"):
        Registry(registry.root)


@pytest.mark.parametrize("kind", ["receipt", "uses", "orphan"])
def test_receipt_and_ledger_mismatch_fail_closed(setup, kind):
    registry = reviewed(setup); run_id, _ = registry.reserve(registry.plan(), {})
    if kind == "receipt":
        (registry.root / "runs" / run_id / "reservation.json").write_text("{}")
    elif kind == "uses":
        registry.db.execute("DELETE FROM uses"); registry.db.commit()
    else:
        path = registry.root / "runs/orphan"; path.mkdir(); (path / "reservation.json").write_text("{}")
    with pytest.raises(ValueError):
        registry.audit()


def test_blank_image_rejected_and_path_escape_rejected(setup):
    registry, source, repo = setup
    meta = sample(source, "a")
    Image.new("RGB", (120, 80), "white").save(source / "images/a.png")
    with pytest.raises(ValueError, match="Blank"):
        canonical_image(source / "images/a.png")
    meta["image_path"] = str(repo / "outside.png")
    (source / "metadata/a.json").write_text(json.dumps(meta))
    assert "escapes" in registry.scan(source, repo)["rejected"][0]["reason"]
