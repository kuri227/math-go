from __future__ import annotations

import csv
import json
import math
from pathlib import Path

from backend.app.config import load_paths
from benchmark.analyze_results import summarize


def load_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def overall_by_model(rows: list[dict[str, str]]) -> dict[str, dict[str, object]]:
    return {
        str(item["model"]): item
        for item in summarize(rows)
        if item["category"] == "all"
    }


def metric(item: dict[str, object] | None, key: str, suffix: str = "") -> str:
    if not item or item.get(key) is None:
        return "未測定"
    value = float(item[key])
    if "accuracy" in key or "rate" in key:
        return f"{value:.2%}"
    return f"{value:.1f}{suffix}"


def dataset_table(title: str, models: dict[str, dict[str, object]]) -> list[str]:
    lines = [f"## {title}", "", "| モデル | 件数 | Normalized Match | 失敗率 | P50 | P95 | 初期化 | Peak VRAM |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for name in ("texteller", "unimernet"):
        item = models.get(name)
        lines.append(
            f"| {name} | {item['sample_count'] if item else '未測定'} | {metric(item, 'normalized_accuracy')} | "
            f"{metric(item, 'failure_rate')} | {metric(item, 'latency_p50_ms', ' ms')} | {metric(item, 'latency_p95_ms', ' ms')} | "
            f"{metric(item, 'initialization_ms', ' ms')} | {metric(item, 'peak_vram_mb', ' MiB')} |"
        )
    lines.append("")
    return lines


def best_candidate(public: dict[str, dict[str, object]], custom: dict[str, dict[str, object]]) -> str | None:
    if not all(name in public and name in custom for name in ("texteller", "unimernet")):
        return None
    usable = [name for name in ("texteller", "unimernet") if custom[name]["success_count"]]
    if len(usable) < 2:
        return None
    if any(int(public[name]["sample_count"]) < 6332 for name in usable):
        return None
    if any(int(custom[name]["sample_count"]) < 50 for name in usable):
        return None
    return max(
        usable,
        key=lambda name: (
            float(custom[name]["normalized_accuracy"]),
            float(public[name]["normalized_accuracy"]),
            -float(custom[name]["latency_p95_ms"] or math.inf),
        ),
    )


def main() -> None:
    paths = load_paths()
    public_rows = load_rows(paths.results / "public_hwe_predictions.csv")
    custom_rows = load_rows(paths.results / "custom_predictions.csv")
    smoke_rows = load_rows(paths.results / "public_smoke.csv")
    cpu_smoke_rows = load_rows(paths.results / "cpu_smoke.csv")
    public = overall_by_model(public_rows) if public_rows else {}
    custom = overall_by_model(custom_rows) if custom_rows else {}
    smoke = overall_by_model(smoke_rows) if smoke_rows else {}
    cpu_smoke = overall_by_model(cpu_smoke_rows) if cpu_smoke_rows else {}
    candidate = best_candidate(public, custom)

    combined = []
    for dataset, values in (("public_hwe", public), ("custom_web", custom)):
        for model, row in values.items():
            combined.append({"dataset": dataset, **row})
    paths.results.mkdir(parents=True, exist_ok=True)
    (paths.results / "summary.json").write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    if combined:
        with (paths.results / "summary.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(combined[0]))
            writer.writeheader()
            writer.writerows(combined)

    recommendation = (
        f"実測値に基づく採用候補は **{candidate}** である。独自Web入力のNormalized Matchを第一、公開HWEを第二、独自入力P95を第三の基準とした。"
        if candidate
        else "公開HWEと50件以上の独自Web入力について両モデルの実測が揃っていないため、採用モデルは未決定とする。"
    )
    lines = [
        "# 数学でGO HMER モデル比較",
        "",
        "## 結論",
        "",
        recommendation,
        "",
        "## 実モデル配線確認（採用判定には使用しない）",
        "",
        "公開HWE先頭10件を使い、両モデル、CUDA、warm-up 1回のE2E配線を確認した。件数が少なくカテゴリも未分類のため、以下は本評価値ではない。",
        "",
        *dataset_table("10件 smoke test", smoke),
        "Web Canvasで2ストロークの `x` を入力し、同一の154×146 px PNGからTexTeller `\\[x\\]`、UniMERNet `\\bigtimes` が画面へ返ることを確認した。これはWeb経路の機能検証であり、Ground Truth付きTest Bデータには含めていない。",
        "",
        "CPUでも公開HWE先頭3件、warm-up 1回を実行した。少数配線確認であり、連続利用可否の判定値ではない。",
        "",
        *dataset_table("3件 CPU smoke test", cpu_smoke),
        *dataset_table("Test A 公開UniMER-Test HWE", public),
        *dataset_table("Test B 数学でGO Web実入力", custom),
        "## 必須検討事項への回答",
        "",
        f"1. **TexTellerの公開HWE精度**: {metric(public.get('texteller'), 'normalized_accuracy')}。",
        f"2. **UniMERNetの公開HWE精度**: {metric(public.get('unimernet'), 'normalized_accuracy')}。",
        f"3. **数学でGO Web入力**: TexTeller {metric(custom.get('texteller'), 'normalized_accuracy')}、UniMERNet {metric(custom.get('unimernet'), 'normalized_accuracy')}。",
        "4. **カテゴリ差**: 各データセットのsummary CSVでカテゴリ別に確認する。未測定カテゴリは結論に用いない。",
        "5. **誤認識傾向**: 評価実行後、`results/failures/` に分数、指数、添字、根号、積分、総和、行列、マイナス等の原因仮説と元画像を保存する。未測定の段階では傾向を断定しない。",
        f"6. **推論速度**: 公開HWE P95はTexTeller {metric(public.get('texteller'), 'latency_p95_ms', ' ms')}、UniMERNet {metric(public.get('unimernet'), 'latency_p95_ms', ' ms')}。",
        f"7. **CPUだけで実用可能か**: 3件smokeのP95はTexTeller {metric(cpu_smoke.get('texteller'), 'latency_p95_ms', ' ms')}、UniMERNet {metric(cpu_smoke.get('unimernet'), 'latency_p95_ms', ' ms')}で、両方ともCPU動作は確認した。ただし3件では文化祭の連続利用可否を確定できない。",
        "8. **GPUが必要か**: 機能上はCPUのみでも動作した。GPUを必須とするかは50件以上のWeb入力と連続試験で決める。初回ロードはCPU/GPUとも20〜30秒規模なので、サーバー起動時の事前ロードが必要である。",
        "9. **VRAM必要量**: 各予測CSVの `peak_vram_mb` を参照する。CUDA未使用または取得不能の場合は未測定とする。",
        "10. **Web導入容易性**: 両モデルとも共通Recognizerから利用できる。TexTellerは公式Python API、UniMERNetは公式repo/config/checkpointを必要とするため導入手順はTexTellerの方が短い。",
        "11. **本番PC安定性**: OOM、timeout、例外を失敗率へ含め、連続実行結果が揃うまで確定しない。",
        "12. **文化祭での連続利用**: P95、最大、失敗率、発熱・メモリ推移を連続試験して判断する。単発最速値は使わない。",
        "13. **Fine-tuningの要否**: pretrainedの独自Web入力結果を先に測り、入力改善で解消しないカテゴリ偏在がある場合だけ検討する。",
        "14. **Fine-tuning優先カテゴリ**: `results/failures/` とcustom category別集計で再現性のある弱点を優先する。公開HWEは学習に使わない。",
        f"15. **採用推奨**: {recommendation}",
        "",
        "## 解釈上の制約",
        "",
        "Exact Match、保守的なNormalized Match、失敗画像の人手確認を分ける。数学的同値性はHMER評価と混同しない。公開HWEはUniMERNet開発元の評価セットであり、最終判断では独自Web入力を重視する。",
        "",
    ]
    report_dir = paths.repo_root / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / "model_comparison.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
