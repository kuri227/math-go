from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10
    import tomli as tomllib


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Paths:
    repo_root: Path
    unimer_archive: Path
    unimer_test: Path
    hwe_manifest: Path
    custom_eval: Path
    results: Path


def load_paths(config_path: Path | None = None) -> Paths:
    config_path = config_path or REPO_ROOT / "config" / "paths.toml"
    with config_path.open("rb") as handle:
        raw = tomllib.load(handle)["paths"]

    override = os.getenv("HMER_DATA_ROOT")
    data_root = Path(override).expanduser().resolve() if override else REPO_ROOT

    def resolve(value: str) -> Path:
        path = Path(value)
        return path.resolve() if path.is_absolute() else (data_root / path).resolve()

    return Paths(
        repo_root=REPO_ROOT,
        unimer_archive=resolve(raw["unimer_archive"]),
        unimer_test=resolve(raw["unimer_test"]),
        hwe_manifest=resolve(raw["hwe_manifest"]),
        custom_eval=resolve(raw["custom_eval"]),
        results=resolve(raw["results"]),
    )

