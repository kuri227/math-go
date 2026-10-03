from backend.app.config import REPO_ROOT, load_paths


def test_paths_resolve_from_repo_root(monkeypatch):
    monkeypatch.delenv("HMER_DATA_ROOT", raising=False)
    paths = load_paths()
    assert paths.repo_root == REPO_ROOT
    assert paths.hwe_manifest == REPO_ROOT / "data" / "manifests" / "unimer_hwe.csv"

