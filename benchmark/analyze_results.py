from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from backend.app.config import load_paths


def percentile(values: list[float], proportion: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * proportion
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def as_bool(value: str) -> bool:
    return value.lower() == "true"


def summarize(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    groups: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[(row["model"], row.get("category") or "all")].append(row)
        groups[(row["model"], "__overall__")].append(row)
    summary: list[dict[str, object]] = []
    for (model, category), group in sorted(groups.items()):
        successful = [row for row in group if row["status"] == "success"]
        latencies = [float(row["inference_ms"]) for row in successful if row["inference_ms"]]
        initialization = [float(row["initialization_ms"]) for row in successful if row.get("initialization_ms")]
        peak_vram = [float(row["peak_vram_mb"]) for row in successful if row.get("peak_vram_mb")]
        summary.append(
            {
                "model": model,
                "category": "all" if category == "__overall__" else category,
                "sample_count": len(group),
                "success_count": len(successful),
                "failure_count": len(group) - len(successful),
                "failure_rate": (len(group) - len(successful)) / len(group),
                "exact_accuracy": sum(as_bool(row["exact_match"]) for row in successful) / len(group),
                "normalized_accuracy": sum(as_bool(row["normalized_match"]) for row in successful) / len(group),
                "latency_mean_ms": statistics.fmean(latencies) if latencies else None,
                "latency_p50_ms": percentile(latencies, 0.50),
                "latency_p95_ms": percentile(latencies, 0.95),
                "latency_max_ms": max(latencies) if latencies else None,
                "initialization_ms": max(initialization) if initialization else None,
                "peak_vram_mb": max(peak_vram) if peak_vram else None,
            }
        )
    return summary


def failure_hypothesis(prediction: str, ground_truth: str) -> str:
    checks = [
        (("\\frac" in ground_truth) != ("\\frac" in prediction), "分数構造または分数線"),
        (("^" in ground_truth) != ("^" in prediction), "指数位置"),
        (("_" in ground_truth) != ("_" in prediction), "添字位置"),
        (("\\sqrt" in ground_truth) != ("\\sqrt" in prediction), "根号と適用範囲"),
        (("\\int" in ground_truth) != ("\\int" in prediction), "積分記号または積分範囲"),
        (("\\sum" in ground_truth) != ("\\sum" in prediction), "総和記号または上下限"),
        (("\\begin" in ground_truth) != ("\\begin" in prediction), "行列または複数行構造"),
        (("-" in ground_truth) != ("-" in prediction), "マイナス記号"),
    ]
    for condition, label in checks:
        if condition:
            return label
    return "文字・記号の混同またはLaTeX表記差"


def write_failure_cases(rows: list[dict[str, str]], output: Path, failure_dir: Path, repo_root: Path) -> None:
    lines = ["# 代表的失敗例", "", "推論エラーと正規化後不一致をモデルごとに最大10件抽出した。原因は自動分類による仮説であり、採用判断前に画像を目視確認する。", ""]
    for model in sorted({row["model"] for row in rows}):
        failures = [
            row for row in rows
            if row["model"] == model and (row["status"] != "success" or not as_bool(row["normalized_match"]))
        ][:10]
        lines.extend([f"## {model}", ""])
        if not failures:
            lines.extend(["該当なし。", ""])
            continue
        for row in failures:
            hypothesis = row["error"] or failure_hypothesis(row["pred_latex"], row["gt_latex"])
            image_ref = row.get("image_path", "")
            if image_ref:
                source = Path(image_ref)
                if not source.is_absolute():
                    source = repo_root / source
                if source.exists():
                    target_dir = failure_dir / model
                    target_dir.mkdir(parents=True, exist_ok=True)
                    target = target_dir / f"{row['sample_id']}{source.suffix.lower()}"
                    shutil.copy2(source, target)
                    image_ref = target.relative_to(output.parent).as_posix()
            lines.extend(
                [
                    f"### {row['sample_id']}",
                    "",
                    f"- 正解: `{row['gt_latex']}`",
                    f"- 予測: `{row['pred_latex']}`",
                    f"- 原因仮説: {hypothesis}",
                    f"- 入力画像: [{image_ref}]({image_ref})" if image_ref else "- 入力画像: 記録なし",
                    "",
                ]
            )
    output.write_text("\n".join(lines), encoding="utf-8")


def write_report(rows: list[dict[str, str]], summary: list[dict[str, object]], output: Path) -> None:
    overall = [item for item in summary if item["category"] == "all"]
    subsets = Counter(row.get("subset") or "unknown" for row in rows)
    devices = Counter(row.get("input_device") or "unknown" for row in rows)
    lines = [
        "# 数学でGO HMER PoC 評価レポート",
        "",
        "## 結論",
        "",
    ]
    has_custom = any((row.get("subset") or "").lower() != "hwe" for row in rows)
    if len(overall) < 2:
        lines.append("両モデルの結果が揃っていないため、採用モデルは未決定とする。")
    elif not has_custom:
        lines.append("公開HWEの基礎比較は完了したが、独自Canvas評価がないため本番採用は保留する。")
    else:
        best = max(overall, key=lambda item: (item["normalized_accuracy"], -(item["latency_p95_ms"] or math.inf)))
        lines.append(f"測定結果上の採用候補は {best['model']} である。独自Canvas精度とP95レイテンシを優先して最終判断する。")
    lines.extend(["", "## 評価範囲", "", f"- 記録行数: {len(rows)}", f"- サブセット: {dict(subsets)}", f"- 入力デバイス: {dict(devices)}", ""])
    lines.extend(["## モデル別結果", ""])
    for item in overall:
        lines.extend(
            [
                f"### {item['model']}",
                "",
                f"- サンプル数: {item['sample_count']}",
                f"- Exact Match: {item['exact_accuracy']:.3%}",
                f"- Normalized Match: {item['normalized_accuracy']:.3%}",
                f"- 失敗率: {item['failure_rate']:.3%}",
                f"- 推論時間 P50 / P95: {item['latency_p50_ms']} / {item['latency_p95_ms']} ms",
                "",
            ]
        )
    lines.extend(
        [
            "## 解釈上の注意",
            "",
            "UniMER-Test HWEは公開テスト専用であり、学習やFine-tuningには使用していない。Exact MatchはLaTeX表記ゆれを過大評価するため、保守的な正規化後一致も併記した。数学的同値判定は今回のHMER評価には含めない。公開HWEはUniMERNet開発元の評価セットであるため、数学でGOの採用判断では独自Canvas入力をより重視する。",
            "",
            "## 残課題",
            "",
            "独自Canvasデータを複数人・複数入力機器で50件以上収集し、人手レビュー済みの正解LaTeXを付与する。代表的失敗例は元画像と照合し、自動分類した原因仮説を確認する。Render/Structure MatchはCDMのWindows導入コストを確認したうえで追加する。",
            "",
        ]
    )
    output.write_text("\n".join(lines), encoding="utf-8")


def make_figure(summary: list[dict[str, object]], output: Path) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    overall = [item for item in summary if item["category"] == "all"]
    if not overall:
        return
    names = [str(item["model"]) for item in overall]
    accuracy = [float(item["normalized_accuracy"]) * 100 for item in overall]
    latency = [float(item["latency_p95_ms"] or 0) for item in overall]
    figure, axes = plt.subplots(1, 2, figsize=(9, 4))
    axes[0].bar(names, accuracy, color="#1d5a48")
    axes[0].set_title("Normalized match")
    axes[0].set_ylabel("Accuracy (%)")
    axes[0].set_ylim(0, 100)
    axes[1].bar(names, latency, color="#af3d29")
    axes[1].set_title("Inference latency P95")
    axes[1].set_ylabel("Milliseconds")
    figure.tight_layout()
    output.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output, dpi=180)
    plt.close(figure)


def main() -> None:
    paths = load_paths()
    parser = argparse.ArgumentParser(description="Analyze HMER benchmark results")
    parser.add_argument("--input", type=Path, default=paths.results / "public_hwe_predictions.csv")
    parser.add_argument("--name", default="public_hwe")
    args = parser.parse_args()
    with args.input.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise RuntimeError("No benchmark results found")
    summary = summarize(rows)
    summary_json = paths.results / f"{args.name}_summary.json"
    summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_csv = paths.results / f"{args.name}_summary.csv"
    with summary_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
    failure_dir = paths.results / "failures" / args.name
    write_failure_cases(rows, failure_dir / "index.md", failure_dir, paths.repo_root)
    write_report(rows, summary, paths.results / f"{args.name}_report.md")
    make_figure(summary, paths.results / "figures" / f"{args.name}_accuracy_latency.png")
    print(summary_json)


if __name__ == "__main__":
    main()
