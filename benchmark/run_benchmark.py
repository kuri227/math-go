from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

from backend.app.config import load_paths
from backend.app.recognizers.registry import RecognizerRegistry
from backend.app.recognizers.worker import WorkerError
from benchmark.latex_metrics import exact_match, normalized_match

FIELDS = [
    "sample_id",
    "image_path",
    "subset",
    "category",
    "difficulty",
    "input_device",
    "writer_id",
    "model",
    "model_variant",
    "device",
    "pred_latex",
    "gt_latex",
    "exact_match",
    "normalized_match",
    "render_match",
    "inference_ms",
    "end_to_end_ms",
    "initialization_ms",
    "peak_vram_mb",
    "status",
    "error",
]


def parse_args() -> argparse.Namespace:
    paths = load_paths()
    parser = argparse.ArgumentParser(description="Benchmark local HMER recognizers")
    parser.add_argument("--dataset", choices=["public", "custom"], default="public")
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--models", nargs="+", choices=["texteller", "unimernet"], default=["texteller", "unimernet"])
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Smoke-test only; omit for the full set")
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def resolve_image(path_value: str, repo_root: Path) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else repo_root / path


def successful_rows(output: Path) -> list[dict[str, str]]:
    if not output.exists():
        return []
    with output.open("r", encoding="utf-8", newline="") as handle:
        return [row for row in csv.DictReader(handle) if row.get("status") == "success"]


def recognize_with_recovery(recognizer, image_path: Path, warmup_path: Path):
    """Restart once after a worker/protocol failure so a poisoned CUDA context cannot cascade."""
    try:
        return recognizer.recognize(image_path)
    except (WorkerError, UnicodeError, json.JSONDecodeError) as first_error:
        print(f"[retry] {recognizer.name}: {type(first_error).__name__}: {first_error}")
        recognizer.close()
        recognizer.start()
        if not recognizer.available:
            raise first_error
        try:
            if warmup_path != image_path:
                recognizer.recognize(warmup_path)
            return recognizer.recognize(image_path)
        except Exception:
            recognizer.close()
            raise


def main() -> int:
    args = parse_args()
    paths = load_paths()
    if args.manifest is None:
        args.manifest = paths.hwe_manifest if args.dataset == "public" else paths.custom_eval / "manifest.csv"
    if args.output is None:
        filename = "public_hwe_predictions.csv" if args.dataset == "public" else "custom_predictions.csv"
        args.output = paths.results / filename
    with args.manifest.open("r", encoding="utf-8", newline="") as handle:
        samples = list(csv.DictReader(handle))
    if args.limit is not None:
        samples = samples[: args.limit]
    if not samples:
        raise RuntimeError("Manifest has no samples")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    retained = successful_rows(args.output) if args.resume else []
    done = {(row["sample_id"], row["model"]) for row in retained}
    mode = "w"
    registry = RecognizerRegistry()
    failures = 0
    with args.output.open(mode, encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(retained)
        handle.flush()
        for model_name in args.models:
            recognizer = registry.get(model_name)
            warmup_path = resolve_image(samples[0]["image_path"], paths.repo_root)
            recognizer.start()
            if not recognizer.available:
                print(f"[unavailable] {model_name}: {recognizer.detail}")
            else:
                for _ in range(args.warmup):
                    recognizer.recognize(warmup_path)

            for index, sample in enumerate(samples, start=1):
                key = (sample["sample_id"], model_name)
                if key in done:
                    continue
                started = time.perf_counter()
                prediction = ""
                inference_ms = ""
                status = "success"
                error = ""
                try:
                    result = recognize_with_recovery(
                        recognizer,
                        resolve_image(sample["image_path"], paths.repo_root),
                        warmup_path,
                    )
                    prediction = result.latex
                    inference_ms = f"{result.inference_ms:.6f}"
                except Exception as exc:  # Every failure is a benchmark result.
                    status = "error"
                    error = f"{type(exc).__name__}: {exc}"
                    failures += 1
                end_to_end_ms = (time.perf_counter() - started) * 1000
                ground_truth = sample["ground_truth_latex"]
                writer.writerow(
                    {
                        "sample_id": sample["sample_id"],
                        "image_path": sample["image_path"],
                        "subset": sample.get("subset", ""),
                        "category": sample.get("category", "unclassified"),
                        "difficulty": sample.get("difficulty", "unclassified"),
                        "input_device": sample.get("input_device", "unknown"),
                        "writer_id": sample.get("writer_id", "anonymous"),
                        "model": model_name,
                        "model_variant": recognizer.variant,
                        "device": recognizer.device,
                        "pred_latex": prediction,
                        "gt_latex": ground_truth,
                        "exact_match": str(status == "success" and exact_match(prediction, ground_truth)).lower(),
                        "normalized_match": str(status == "success" and normalized_match(prediction, ground_truth)).lower(),
                        "render_match": "",
                        "inference_ms": inference_ms,
                        "end_to_end_ms": f"{end_to_end_ms:.6f}",
                        "initialization_ms": "" if recognizer.initialization_ms is None else f"{recognizer.initialization_ms:.6f}",
                        "peak_vram_mb": "" if recognizer.peak_vram_mb is None else f"{recognizer.peak_vram_mb:.3f}",
                        "status": status,
                        "error": error,
                    }
                )
                handle.flush()
                print(f"[{model_name}] {index}/{len(samples)} {sample['sample_id']} {status}")
            recognizer.close()
    registry.close()
    print(f"[done] {args.output} (failures={failures})")
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
