from __future__ import annotations

import argparse
import csv
import io
import json
import statistics
import tempfile
import time
from pathlib import Path

from PIL import Image

from backend.app.config import load_paths
from backend.app.recognizers.registry import RecognizerRegistry
from benchmark.latex_metrics import normalized_match


def parse_args() -> argparse.Namespace:
    paths = load_paths()
    parser = argparse.ArgumentParser(description="Compare original and 1-bit PNG recognition")
    parser.add_argument("--manifest", type=Path, default=paths.custom_eval / "manifest.csv")
    parser.add_argument("--model", choices=["texteller", "unimernet"], default="texteller")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--threshold", type=int, default=128)
    parser.add_argument("--output", type=Path, default=paths.results / "preprocessing_ab.csv")
    return parser.parse_args()


def resolve_image(path_value: str, repo_root: Path) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else repo_root / path


def make_one_bit_png(source: Path, threshold: int) -> tuple[bytes, float]:
    started = time.perf_counter()
    with Image.open(source) as image:
        grayscale = image.convert("L")
        binary = grayscale.point(lambda value: 255 if value >= threshold else 0, mode="1")
        buffer = io.BytesIO()
        binary.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), (time.perf_counter() - started) * 1000


def percentile(values: list[float], ratio: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * ratio) - 1))
    return ordered[index]


def main() -> int:
    args = parse_args()
    paths = load_paths()
    with args.manifest.open("r", encoding="utf-8", newline="") as handle:
        samples = list(csv.DictReader(handle))
    if args.limit is not None:
        samples = samples[: args.limit]
    if not samples:
        raise RuntimeError("Manifest has no samples")

    registry = RecognizerRegistry()
    recognizer = registry.get(args.model)
    rows: list[dict[str, object]] = []
    try:
        recognizer.start()
        if not recognizer.available:
            raise RuntimeError(recognizer.detail or f"{args.model} is unavailable")
        warmup_path = resolve_image(samples[0]["image_path"], paths.repo_root)
        recognizer.recognize(warmup_path)

        for sample in samples:
            image_path = resolve_image(sample["image_path"], paths.repo_root)
            one_bit_bytes, encode_ms = make_one_bit_png(image_path, args.threshold)
            original = recognizer.recognize(image_path)
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
                handle.write(one_bit_bytes)
                one_bit_path = Path(handle.name)
            try:
                one_bit = recognizer.recognize(one_bit_path)
            finally:
                one_bit_path.unlink(missing_ok=True)

            ground_truth = sample["ground_truth_latex"]
            rows.append(
                {
                    "sample_id": sample["sample_id"],
                    "original_bytes": image_path.stat().st_size,
                    "one_bit_bytes": len(one_bit_bytes),
                    "one_bit_encode_ms": f"{encode_ms:.3f}",
                    "original_inference_ms": f"{original.inference_ms:.3f}",
                    "one_bit_inference_ms": f"{one_bit.inference_ms:.3f}",
                    "original_latex": original.latex,
                    "one_bit_latex": one_bit.latex,
                    "same_normalized_output": normalized_match(original.latex, one_bit.latex),
                    "original_matches_gt": normalized_match(original.latex, ground_truth),
                    "one_bit_matches_gt": normalized_match(one_bit.latex, ground_truth),
                }
            )
            print(f"[{args.model}] {len(rows)}/{len(samples)} {sample['sample_id']}")
    finally:
        registry.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    original_sizes = [int(row["original_bytes"]) for row in rows]
    one_bit_sizes = [int(row["one_bit_bytes"]) for row in rows]
    encode_times = [float(row["one_bit_encode_ms"]) for row in rows]
    original_times = [float(row["original_inference_ms"]) for row in rows]
    one_bit_times = [float(row["one_bit_inference_ms"]) for row in rows]
    summary = {
        "model": args.model,
        "sample_count": len(rows),
        "threshold": args.threshold,
        "original_mean_bytes": statistics.mean(original_sizes),
        "one_bit_mean_bytes": statistics.mean(one_bit_sizes),
        "one_bit_size_ratio": statistics.mean(one_bit_sizes) / statistics.mean(original_sizes),
        "one_bit_encode_mean_ms": statistics.mean(encode_times),
        "original_inference_p50_ms": statistics.median(original_times),
        "one_bit_inference_p50_ms": statistics.median(one_bit_times),
        "original_inference_p95_ms": percentile(original_times, 0.95),
        "one_bit_inference_p95_ms": percentile(one_bit_times, 0.95),
        "same_normalized_output_count": sum(row["same_normalized_output"] is True for row in rows),
        "original_match_count": sum(row["original_matches_gt"] is True for row in rows),
        "one_bit_match_count": sum(row["one_bit_matches_gt"] is True for row in rows),
        "output": str(args.output),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
