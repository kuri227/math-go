# 数学でGO HMER モデル比較

## 結論

公開HWEと50件以上の独自Web入力について両モデルの実測が揃っていないため、採用モデルは未決定とする。

## 実モデル配線確認（採用判定には使用しない）

公開HWE先頭10件を使い、両モデル、CUDA、warm-up 1回のE2E配線を確認した。件数が少なくカテゴリも未分類のため、以下は本評価値ではない。

## 10件 smoke test

| モデル | 件数 | Normalized Match | 失敗率 | P50 | P95 | 初期化 | Peak VRAM |
|---|---:|---:|---:|---:|---:|---:|---:|
| texteller | 10 | 100.00% | 0.00% | 500.4 ms | 791.1 ms | 27959.7 ms | 1239.1 MiB |
| unimernet | 10 | 80.00% | 0.00% | 997.4 ms | 1789.5 ms | 31453.3 ms | 474.8 MiB |

Web Canvasで2ストロークの `x` を入力し、同一の154×146 px PNGからTexTeller `\[x\]`、UniMERNet `\bigtimes` が画面へ返ることを確認した。これはWeb経路の機能検証であり、Ground Truth付きTest Bデータには含めていない。

CPUでも公開HWE先頭3件、warm-up 1回を実行した。少数配線確認であり、連続利用可否の判定値ではない。

## 3件 CPU smoke test

| モデル | 件数 | Normalized Match | 失敗率 | P50 | P95 | 初期化 | Peak VRAM |
|---|---:|---:|---:|---:|---:|---:|---:|
| texteller | 3 | 100.00% | 0.00% | 2716.4 ms | 3360.1 ms | 23257.7 ms | 未測定 |
| unimernet | 3 | 66.67% | 0.00% | 1450.2 ms | 1725.6 ms | 29253.2 ms | 未測定 |

## Test A 公開UniMER-Test HWE

| モデル | 件数 | Normalized Match | 失敗率 | P50 | P95 | 初期化 | Peak VRAM |
|---|---:|---:|---:|---:|---:|---:|---:|
| texteller | 6332 | 90.92% | 0.00% | 552.1 ms | 1204.8 ms | 31610.5 ms | 1264.4 MiB |
| unimernet | 6332 | 59.60% | 0.00% | 1083.4 ms | 2550.1 ms | 43338.9 ms | 483.6 MiB |

## Test B 数学でGO Web実入力

| モデル | 件数 | Normalized Match | 失敗率 | P50 | P95 | 初期化 | Peak VRAM |
|---|---:|---:|---:|---:|---:|---:|---:|
| texteller | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 |
| unimernet | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 | 未測定 |

## 必須検討事項への回答

1. **TexTellerの公開HWE精度**: 90.92%。
2. **UniMERNetの公開HWE精度**: 59.60%。
3. **数学でGO Web入力**: TexTeller 未測定、UniMERNet 未測定。
4. **カテゴリ差**: 各データセットのsummary CSVでカテゴリ別に確認する。未測定カテゴリは結論に用いない。
5. **誤認識傾向**: 評価実行後、`results/failures/` に分数、指数、添字、根号、積分、総和、行列、マイナス等の原因仮説と元画像を保存する。未測定の段階では傾向を断定しない。
6. **推論速度**: 公開HWE P95はTexTeller 1204.8 ms、UniMERNet 2550.1 ms。
7. **CPUだけで実用可能か**: 3件smokeのP95はTexTeller 3360.1 ms、UniMERNet 1725.6 msで、両方ともCPU動作は確認した。ただし3件では文化祭の連続利用可否を確定できない。
8. **GPUが必要か**: 機能上はCPUのみでも動作した。GPUを必須とするかは50件以上のWeb入力と連続試験で決める。初回ロードはCPU/GPUとも20〜30秒規模なので、サーバー起動時の事前ロードが必要である。
9. **VRAM必要量**: 各予測CSVの `peak_vram_mb` を参照する。CUDA未使用または取得不能の場合は未測定とする。
10. **Web導入容易性**: 両モデルとも共通Recognizerから利用できる。TexTellerは公式Python API、UniMERNetは公式repo/config/checkpointを必要とするため導入手順はTexTellerの方が短い。
11. **本番PC安定性**: OOM、timeout、例外を失敗率へ含め、連続実行結果が揃うまで確定しない。
12. **文化祭での連続利用**: P95、最大、失敗率、発熱・メモリ推移を連続試験して判断する。単発最速値は使わない。
13. **Fine-tuningの要否**: pretrainedの独自Web入力結果を先に測り、入力改善で解消しないカテゴリ偏在がある場合だけ検討する。
14. **Fine-tuning優先カテゴリ**: `results/failures/` とcustom category別集計で再現性のある弱点を優先する。公開HWEは学習に使わない。
15. **採用推奨**: 公開HWEと50件以上の独自Web入力について両モデルの実測が揃っていないため、採用モデルは未決定とする。

## 解釈上の制約

Exact Match、保守的なNormalized Match、失敗画像の人手確認を分ける。数学的同値性はHMER評価と混同しない。公開HWEはUniMERNet開発元の評価セットであり、最終判断では独自Web入力を重視する。
