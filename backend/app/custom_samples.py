from __future__ import annotations

import csv
import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from backend.app.config import Paths

MANIFEST_FIELDS = [
    "sample_id",
    "image_path",
    "stroke_path",
    "ground_truth_latex",
    "subset",
    "category",
    "difficulty",
    "input_device",
    "writer_id",
    "created_at",
]
SAFE_VALUE = re.compile(r"^[\w .-]{0,64}$", re.UNICODE)
_MANIFEST_LOCK = threading.Lock()


def _safe_metadata_value(name: str, value: str) -> str:
    value = value.strip()
    if not SAFE_VALUE.fullmatch(value):
        raise ValueError(f"Invalid {name}")
    return value


def save_custom_sample(
    *,
    paths: Paths,
    image_path: Path,
    strokes_json: str,
    ground_truth_latex: str,
    category: str,
    difficulty: str,
    writer_id: str,
) -> dict[str, str]:
    ground_truth_latex = ground_truth_latex.strip()
    if not ground_truth_latex:
        raise ValueError("Ground Truth LaTeX is required")
    category = _safe_metadata_value("category", category)
    difficulty = _safe_metadata_value("difficulty", difficulty)
    writer_id = _safe_metadata_value("writer_id", writer_id)
    strokes = json.loads(strokes_json)
    if not isinstance(strokes, dict) or not isinstance(strokes.get("strokes"), list):
        raise ValueError("Invalid stroke JSON")
    pointer_types = strokes.get("pointer_types") or sorted(
        {
            str(stroke.get("pointerType", "unknown"))
            for stroke in strokes["strokes"]
            if isinstance(stroke, dict)
        }
    )
    created_at = datetime.now(timezone.utc)
    sample_id = f"sample_{created_at:%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}"
    images_dir = paths.custom_eval / "images"
    strokes_dir = paths.custom_eval / "strokes"
    metadata_dir = paths.custom_eval / "metadata"
    for directory in (images_dir, strokes_dir, metadata_dir):
        directory.mkdir(parents=True, exist_ok=True)

    saved_image = images_dir / f"{sample_id}.png"
    with Image.open(image_path) as image:
        image.convert("RGB").save(saved_image, format="PNG")
    saved_strokes = strokes_dir / f"{sample_id}.json"
    saved_strokes.write_text(json.dumps(strokes, ensure_ascii=False, indent=2), encoding="utf-8")

    def relative(path: Path) -> str:
        try:
            return path.resolve().relative_to(paths.repo_root).as_posix()
        except ValueError:
            return str(path.resolve())

    row = {
        "sample_id": sample_id,
        "image_path": relative(saved_image),
        "stroke_path": relative(saved_strokes),
        "ground_truth_latex": ground_truth_latex,
        "subset": "custom_web",
        "category": category or "unclassified",
        "difficulty": difficulty or "unclassified",
        "input_device": "+".join(pointer_types) if pointer_types else "unknown",
        "writer_id": writer_id or "anonymous",
        "created_at": created_at.isoformat(),
    }
    (metadata_dir / f"{sample_id}.json").write_text(
        json.dumps(row, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    manifest = paths.custom_eval / "manifest.csv"
    with _MANIFEST_LOCK:
        needs_header = not manifest.exists()
        with manifest.open("a", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=MANIFEST_FIELDS)
            if needs_header:
                writer.writeheader()
            writer.writerow(row)
    return {**row, "manifest_path": relative(manifest)}

