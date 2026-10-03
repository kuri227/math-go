from __future__ import annotations

import argparse
import csv
import json
import statistics
import time
from pathlib import Path

import httpx

from backend.app.config import REPO_ROOT
from backend.app.game_questions import QUESTIONS
from backend.app.latex import normalize_latex


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def run(base_url: str, output_json: Path, output_csv: Path) -> dict[str, object]:
    manifest_path = REPO_ROOT / "data" / "custom" / "manifest.csv"
    rows = list(csv.DictReader(manifest_path.open(encoding="utf-8-sig", newline="")))
    predictions: list[dict[str, object]] = []

    with httpx.Client(base_url=base_url, timeout=60.0) as client:
        ready = client.get("/api/v1/health/ready", params={"model": "texteller"})
        ready.raise_for_status()
        readiness = ready.json()

        for row in rows:
            image_path = REPO_ROOT / row["image_path"]
            started = time.perf_counter()
            with image_path.open("rb") as image:
                response = client.post(
                    "/api/v1/recognitions",
                    data={"model": "texteller", "request_id": row["sample_id"]},
                    files={"image": (image_path.name, image, "image/png")},
                )
            client_ms = (time.perf_counter() - started) * 1000
            response.raise_for_status()
            body = response.json()
            expected = normalize_latex(row["ground_truth_latex"])
            predicted = body["normalized_latex"]
            predictions.append(
                {
                    "sample_id": row["sample_id"],
                    "category": row["category"],
                    "ground_truth": row["ground_truth_latex"],
                    "ground_truth_normalized": expected,
                    "prediction": body["raw_latex"],
                    "prediction_normalized": predicted,
                    "correct": predicted == expected,
                    "client_ms": round(client_ms, 3),
                    "api_total_ms": round(body["timing"]["total_ms"], 3),
                    "inference_ms": round(body["timing"]["inference_ms"], 3),
                    "queue_ms": round(body["timing"]["queue_ms"], 3),
                    "image_bytes": body["image"]["bytes"],
                }
            )

        judgement_latencies: list[float] = []
        for _ in range(5):
            for question in QUESTIONS:
                started = time.perf_counter()
                response = client.post(
                    "/api/v1/judgements",
                    json={
                        "question_id": question.id,
                        "recognized_latex": question.accepted_latex[0],
                    },
                )
                judgement_latencies.append((time.perf_counter() - started) * 1000)
                response.raise_for_status()
                if not response.json()["correct"]:
                    raise RuntimeError(f"Known answer rejected for {question.id}")

    client_latencies = [float(row["client_ms"]) for row in predictions]
    inference_latencies = [float(row["inference_ms"]) for row in predictions]
    correct_count = sum(bool(row["correct"]) for row in predictions)
    fieldnames = list(predictions[0]) if predictions else []
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(predictions)

    result: dict[str, object] = {
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "base_url": base_url,
        "model": readiness,
        "custom_web_samples": {
            "count": len(predictions),
            "normalized_exact_correct": correct_count,
            "normalized_exact_accuracy": correct_count / len(predictions) if predictions else 0,
            "client_latency_ms": {
                "mean": statistics.fmean(client_latencies) if client_latencies else 0,
                "p50": percentile(client_latencies, 0.50),
                "p95": percentile(client_latencies, 0.95),
                "max": max(client_latencies, default=0),
            },
            "inference_latency_ms": {
                "mean": statistics.fmean(inference_latencies) if inference_latencies else 0,
                "p50": percentile(inference_latencies, 0.50),
                "p95": percentile(inference_latencies, 0.95),
                "max": max(inference_latencies, default=0),
            },
            "image_bytes": {
                "mean": statistics.fmean(int(row["image_bytes"]) for row in predictions)
                if predictions else 0,
                "max": max((int(row["image_bytes"]) for row in predictions), default=0),
            },
        },
        "judgement_api": {
            "calls": len(judgement_latencies),
            "all_known_answers_accepted": True,
            "latency_ms": {
                "mean": statistics.fmean(judgement_latencies),
                "p50": percentile(judgement_latencies, 0.50),
                "p95": percentile(judgement_latencies, 0.95),
                "max": max(judgement_latencies),
            },
        },
        "ux_budget": {
            "target_feedback_p50_ms": 1000,
            "acceptable_feedback_p95_ms": 2000,
            "blocking_feedback_ms": 3000,
            "note": "Browser PNG encoding is measured separately in E2E; model initialization is hidden behind the disabled submit state.",
        },
    }
    output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure the game recognition and judgement path.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output-json", type=Path, default=REPO_ROOT / "results" / "game_ux_benchmark.json")
    parser.add_argument("--output-csv", type=Path, default=REPO_ROOT / "results" / "game_ux_predictions.csv")
    args = parser.parse_args()
    result = run(args.base_url, args.output_json, args.output_csv)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
