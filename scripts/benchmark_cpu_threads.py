"""Compare process-local Torch CPU thread counts on fixed public images, never train."""
import argparse
import csv
import json
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.latex import normalize_latex


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threads", type=int, nargs="+", default=[1, 2, 4, 6])
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/manifests/unimer_hwe.csv")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if any(not 1 <= value <= 256 for value in args.threads):
        parser.error("Thread counts must be in 1..256")
    samples = {}
    if not args.manifest.is_file():
        parser.error("Public HWE manifest missing; see docs/model-evaluation-guide.md. This benchmark is optional for running the game.")
    with args.manifest.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            samples.setdefault(row["category"], row)
    if not samples:
        parser.error("Public HWE manifest is empty")
    for row in samples.values():
        path = Path(row["image_path"])
        if not (path if path.is_absolute() else ROOT / path).is_file():
            parser.error("Public HWE images missing; obtain them separately using docs/model-evaluation-guide.md. No model was loaded.")
    import torch
    from texteller import load_model, load_tokenizer, img2latex
    model_dir = str(ROOT / ".model-cache/texteller")
    model = load_model(model_dir=model_dir, use_onnx=False).to("cpu").eval()
    tokenizer = load_tokenizer(tokenizer_dir=model_dir)
    report = {"torch": torch.__version__, "default_threads": torch.get_num_threads(), "device": "cpu", "runs": []}
    def infer(row):
        path = Path(row["image_path"])
        with torch.inference_mode():
            return img2latex(model, tokenizer, [str(path if path.is_absolute() else ROOT / path)], device=torch.device("cpu"), out_format="latex")[0]
    for threads in args.threads:
        torch.set_num_threads(threads)
        infer(next(iter(samples.values())))  # Exclude warmup for every setting.
        records = []
        for row in samples.values():
            began = time.perf_counter(); latex = infer(row)
            record = {"sample_id": row["sample_id"], "ms": round((time.perf_counter() - began) * 1000, 2), "latex": latex, "match": normalize_latex(latex) == normalize_latex(row["ground_truth_latex"])}
            records.append(record)
            print(json.dumps({"threads": threads, **record}, ensure_ascii=True), flush=True)
        report["runs"].append({"threads": threads, "median_ms": statistics.median(r["ms"] for r in records), "max_ms": max(r["ms"] for r in records), "normalized_matches": sum(r["match"] for r in records), "records": records})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**report, "runs": [{k: v for k, v in run.items() if k != "records"} for run in report["runs"]]}, indent=2))


if __name__ == "__main__":
    main()
