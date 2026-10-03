from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath

from PIL import Image, UnidentifiedImageError

from backend.app.config import Paths, load_paths

OFFICIAL_URL = (
    "https://huggingface.co/datasets/wanderkid/UniMER_Dataset/resolve/main/"
    "UniMER-Test.zip?download=true"
)
OFFICIAL_SHA256 = "9bf370b8cac868fee84835f40dec26c477430611253e3feb681356a8149a3a90"
EXPECTED_HWE = 6_332


def classify_latex(latex: str) -> tuple[str, str]:
    """Assign a reproducible primary structural category for grouped reporting."""
    checks = [
        ("matrix", (r"\begin{matrix", r"\begin{pmatrix", r"\begin{bmatrix", r"\begin{array")),
        ("multiple_integral", (r"\iint", r"\iiint", r"\iiiint")),
        ("integral", (r"\int",)),
        ("summation", (r"\sum", r"\prod")),
        ("limit", (r"\lim",)),
        ("partial_derivative", (r"\partial",)),
        ("root", (r"\sqrt",)),
        ("nested_fraction", (r"\frac{\frac", r"\frac { \frac")),
        ("fraction", (r"\frac", r"\over")),
        ("trigonometry", (r"\sin", r"\cos", r"\tan", r"\cot", r"\sec", r"\csc")),
        ("logarithm", (r"\log", r"\ln")),
        ("vector", (r"\vec", r"\overrightarrow", r"\mathbf")),
        ("set", (r"\in", r"\subset", r"\cup", r"\cap", r"\emptyset")),
    ]
    compact = latex.replace(" ", "")
    for category, markers in checks:
        if any(marker.replace(" ", "") in compact for marker in markers):
            break
    else:
        if "=" in latex or r"\neq" in latex or r"\le" in latex or r"\ge" in latex:
            category = "equation"
        elif "^" in latex and "_" in latex:
            category = "superscript_subscript"
        elif "^" in latex:
            category = "exponent"
        elif "_" in latex:
            category = "subscript"
        elif any(char.isalpha() for char in latex):
            category = "variable"
        else:
            category = "arithmetic"

    nesting = 0
    maximum_nesting = 0
    for char in latex:
        nesting += char == "{"
        nesting -= char == "}"
        maximum_nesting = max(maximum_nesting, nesting)
    complex_markers = sum(marker in compact for marker in (r"\begin", r"\iint", r"\iiint", r"\sum", r"\int", r"\lim"))
    difficulty = "hard" if len(compact) >= 80 or maximum_nesting >= 4 or complex_markers >= 2 else "medium" if len(compact) >= 35 or maximum_nesting >= 2 else "easy"
    return category, difficulty


@dataclass
class PreparationReport:
    archive: str
    sha256: str
    expected_pairs: int
    label_count: int
    image_count: int
    usable_pairs: int
    missing_images: list[str]
    corrupt_images: list[str]
    extra_images: list[str]
    empty_labels: list[str]
    manifest: str


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_archive(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(OFFICIAL_URL, headers={"User-Agent": "math-go-hmer-poc/0.1"})
    temporary = path.with_suffix(".zip.part")
    with urllib.request.urlopen(request) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)
    temporary.replace(path)


def safe_extract_dataset(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    destination_root = destination.resolve()
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            parts = PurePosixPath(member.filename).parts
            if not parts or parts[0] != "UniMER-Test":
                raise RuntimeError(f"Unexpected archive path: {member.filename}")
            relative = Path(*parts[1:])
            if not relative.parts:
                continue
            target = (destination / relative).resolve()
            if destination_root not in target.parents and target != destination_root:
                raise RuntimeError(f"Unsafe archive path: {member.filename}")
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(member) as input_file, target.open("wb") as output_file:
                shutil.copyfileobj(input_file, output_file)


def relative_to_repo(path: Path, paths: Paths) -> str:
    try:
        return path.resolve().relative_to(paths.repo_root).as_posix()
    except ValueError:
        return str(path.resolve())


def build_manifest(paths: Paths, verify_images: bool) -> PreparationReport:
    hwe_dir = paths.unimer_test / "hwe"
    labels_path = paths.unimer_test / "hwe.txt"
    if not hwe_dir.is_dir() or not labels_path.is_file():
        raise FileNotFoundError(
            f"Official HWE structure was not found under {paths.unimer_test}. "
            "Expected hwe/ and hwe.txt."
        )

    labels = labels_path.read_text(encoding="utf-8-sig").splitlines()
    image_files = sorted(hwe_dir.glob("*.png"))
    image_by_name = {path.name: path for path in image_files}
    missing: list[str] = []
    corrupt: list[str] = []
    empty: list[str] = []
    rows: list[dict[str, str]] = []

    for index, label in enumerate(labels):
        sample_id = f"{index:07d}"
        filename = f"{sample_id}.png"
        image_path = image_by_name.get(filename)
        if image_path is None:
            missing.append(filename)
            continue
        if not label.strip():
            empty.append(sample_id)
            continue
        if verify_images:
            try:
                with Image.open(image_path) as image:
                    image.verify()
            except (UnidentifiedImageError, OSError, ValueError):
                corrupt.append(filename)
                continue
        category, difficulty = classify_latex(label)
        rows.append(
            {
                "sample_id": sample_id,
                "image_path": relative_to_repo(image_path, paths),
                "ground_truth_latex": label,
                "subset": "HWE",
                "category": category,
                "difficulty": difficulty,
                "input_device": "public_dataset",
                "writer_id": "unknown",
            }
        )

    expected_names = {f"{index:07d}.png" for index in range(len(labels))}
    extra = sorted(set(image_by_name) - expected_names)
    paths.hwe_manifest.parent.mkdir(parents=True, exist_ok=True)
    with paths.hwe_manifest.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["sample_id", "image_path", "ground_truth_latex", "subset", "category", "difficulty", "input_device", "writer_id"],
        )
        writer.writeheader()
        writer.writerows(rows)

    return PreparationReport(
        archive=relative_to_repo(paths.unimer_archive, paths),
        sha256=file_sha256(paths.unimer_archive),
        expected_pairs=EXPECTED_HWE,
        label_count=len(labels),
        image_count=len(image_files),
        usable_pairs=len(rows),
        missing_images=missing,
        corrupt_images=corrupt,
        extra_images=extra,
        empty_labels=empty,
        manifest=relative_to_repo(paths.hwe_manifest, paths),
    )


def verify_manifest_head(paths: Paths, count: int = 5) -> None:
    with paths.hwe_manifest.open("r", encoding="utf-8", newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle)):
            if index >= count:
                break
            image_path = Path(row["image_path"])
            if not image_path.is_absolute():
                image_path = paths.repo_root / image_path
            with Image.open(image_path) as image:
                image.load()
            if not row["ground_truth_latex"].strip():
                raise RuntimeError(f"Empty ground truth in manifest row {index + 2}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare the official UniMER-Test HWE manifest")
    parser.add_argument("--no-download", action="store_true", help="Fail instead of downloading")
    parser.add_argument("--force-extract", action="store_true")
    parser.add_argument("--skip-image-verify", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = load_paths()
    if not paths.unimer_archive.exists():
        if args.no_download:
            raise FileNotFoundError(paths.unimer_archive)
        print(f"[download] {OFFICIAL_URL}")
        download_archive(paths.unimer_archive)

    actual_sha = file_sha256(paths.unimer_archive)
    print(f"[sha256] {actual_sha}")
    if actual_sha != OFFICIAL_SHA256:
        raise RuntimeError(
            "UniMER-Test SHA-256 mismatch. "
            f"Expected {OFFICIAL_SHA256}, got {actual_sha}."
        )

    dataset_ready = (paths.unimer_test / "hwe").is_dir() and (paths.unimer_test / "hwe.txt").is_file()
    if args.force_extract or not dataset_ready:
        print(f"[extract] {paths.unimer_archive} -> {paths.unimer_test}")
        safe_extract_dataset(paths.unimer_archive, paths.unimer_test)
    else:
        print(f"[skip] dataset already extracted: {paths.unimer_test}")

    report = build_manifest(paths, verify_images=not args.skip_image_verify)
    verify_manifest_head(paths)
    report_path = paths.hwe_manifest.with_suffix(".report.json")
    report_path.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    if report.usable_pairs != EXPECTED_HWE:
        print("[error] usable HWE pair count does not match the official expectation", file=sys.stderr)
        return 2
    print("[ok] official HWE manifest verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
