"""Measure a running CPU API on public HWE images; never uploads to external services."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import statistics
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]


def summarize(values):
    ordered = sorted(values)
    return {"count": len(values), "mean_ms": round(statistics.mean(values), 2), "median_ms": round(statistics.median(values), 2), "p95_ms": round(ordered[min(len(ordered) - 1, int(0.95 * len(ordered)))], 2), "max_ms": round(max(values), 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8014")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/manifests/unimer_hwe.csv")
    parser.add_argument("--per-category", type=int, default=2)
    parser.add_argument("--repeat", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--output", type=Path, default=ROOT / "results/cpu_benchmark.json")
    args = parser.parse_args()
    if min(args.per_category, args.repeat, args.timeout) <= 0:
        parser.error("counts and timeout must be positive")
    base = args.base_url.rstrip("/")
    with urlopen(base + "/api/v1/health/ready?model=texteller", timeout=args.timeout) as response:
        ready = json.load(response)
    assert ready["status"] == "ready" and ready["device"] == "cpu", ready
    samples, counts = [], {}
    with args.manifest.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            category = row["category"]
            if counts.get(category, 0) < args.per_category:
                samples.append(row)
                counts[category] = counts.get(category, 0) + 1
    records = []
    first_started = time.perf_counter()
    for repeat in range(args.repeat):
        for row in samples:
            boundary = "math-go-cpu-benchmark"
            header = f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ntexteller\r\n--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="public.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
            image_path = Path(row["image_path"])
            if not image_path.is_absolute():
                image_path = ROOT / image_path
            data = header + image_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
            request = Request(base + "/api/v1/recognitions", data=data, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
            record = {"sample_id": row["sample_id"], "category": row["category"], "repeat": repeat}
            started = time.perf_counter()
            try:
                with urlopen(request, timeout=args.timeout) as response:
                    result = json.load(response)
                assert result["device"] == "cpu" and result["peak_vram_mb"] is None, result
                record.update(success=True, timing=result["timing"], latex=result["normalized_latex"], label_chars=len(row["ground_truth_latex"]), image=result["image"])
            except (HTTPError, OSError, AssertionError) as exc:
                record.update(success=False, error=str(exc))
            record["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
            records.append(record)
            print(json.dumps(record, ensure_ascii=True), flush=True)
            if not record["success"]:
                # A timed-out worker may still be busy. Do not pile up requests.
                break
        if records and not records[-1]["success"]:
            break
    successes = [row for row in records if row["success"]]
    report = {"readiness": ready, "requests": len(records), "failures": len(records) - len(successes), "wall_seconds": round(time.perf_counter() - first_started, 2), "first_request_ms": records[0]["elapsed_ms"] if records else None, "all": summarize([r["elapsed_ms"] for r in successes]) if successes else None, "by_category": {category: summarize([r["elapsed_ms"] for r in successes if r["category"] == category]) for category in counts if any(r["category"] == category for r in successes)}, "records": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, indent=2))
    raise SystemExit(1 if report["failures"] else 0)


if __name__ == "__main__":
    main()
