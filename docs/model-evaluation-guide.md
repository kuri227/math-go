# モデル比較・データ収集・評価ガイド

ゲーム展示にはこの手順は不要です。通常はREADMEのCPU/GPU別セットアップを使い、TexTellerだけを導入します。
この文書はTexTellerとUniMERNetを比較・評価する開発者向けです。リポジトリルートから実行してください。

## 評価用環境を作る

READMEのGit・Python・Node・pnpmの共通準備を済ませてから実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build_game.ps1
.\scripts\setup_models.ps1 -Python python -UniMERNetVariant tiny
```

アプリ・評価用 `.venv`、TexTeller用 `.venv-texteller`、UniMERNet用 `.venv-unimernet` を分離します。
TexTellerはtransformers 4.47.0、UniMERNetは4.42.4を使用するため、単一環境へ混在させません。
UniMERNetの公式コードは `third_party/UniMERNet`、選択したvariantの重みはその `models/` に取得します。
追加モデル・公開データは大容量です。空き容量を確認してください。

CPU評価なら `setup_models.ps1` に `-Device cpu` を付けます。TexTellerのCPU環境は `.venv-texteller-cpu` です。
比較用途のUniMERNet環境はCPU/GPUで同じ `.venv-unimernet` を使うため、その切替では環境内ライブラリが変更されます。

## 比較画面と独自手書きデータ

モデル環境準備後に `scripts/run_server.ps1` で起動し、`http://127.0.0.1:8000/evaluation` を開きます。

- 同一のcrop済みPNGをTexTellerとUniMERNetへ渡し、LaTeXと推論時間を比較する。
- Canvasに入力し、1画戻す・全消去・PNGとstroke JSONの保存を行う。
- 人手で確認した正解LaTeX・カテゴリ・難易度・匿名writer IDを付け、`data/custom/` に保存する。

比較画面は外部CDNを使用します。4GB VRAMでは2モデルのメモリ不足が起こりうるため、ロード・評価を逐次実行し、必要ならCPUを明示的に選びます。
デバイスは `TEXTELLER_DEVICE` / `UNIMERNET_DEVICE`、variantは `UNIMERNET_VARIANT` で指定できます。
CPUの場合は両モデルにcpuを指定します。TexTellerでCPU環境を選ぶためにも `TEXTELLER_DEVICE=cpu` が必要です。

独自評価には、複数筆者・複数入力機器で50〜100件以上を収集する方針です。
画像、stroke JSON、metadata、人手確認済み正解を対応付け、個人名は記録しません。筆跡データはGit対象外です。

## 公開HWEデータを準備する

```powershell
.\.venv\Scripts\python.exe -m benchmark.prepare_unimer
```

`config/paths.toml` に従い、公式ZIPの取得・SHA-256検査・安全な展開・画像読込検査・manifest生成を行います。
別のデータ保存先を使う場合は `HMER_DATA_ROOT` で上書きできます。

検証済みHWEは6,332画像・6,332正解・6,332ペアで、欠損・破損・余剰画像・空ラベルはありません。
公式ZIPのSHA-256は `9bf370b8cac868fee84835f40dec26c477430611253e3feb681356a8149a3a90`。
manifestは `data/manifests/unimer_hwe.csv`。公開HWEは評価専用とし、学習・Fine-tuningに使用しません。
公式配布元：[UniMER dataset](https://huggingface.co/datasets/wanderkid/UniMER_Dataset)。

## ベンチマーク

```powershell
.\.venv\Scripts\python.exe -m benchmark.collect_environment
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset public --limit 5 --output results/public_smoke.csv
```

`--limit` は配線確認用です。全件評価は長時間かかります。

```powershell
.\scripts\run_full_evaluation.ps1 -Device cuda
```

モデルを順番に実行し、成功済み行を保持して中断箇所から再開します。個別実行・集計は次を使用します。

```powershell
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset public --models texteller unimernet --resume
.\.venv\Scripts\python.exe -m benchmark.analyze_results --input results/public_hwe_predictions.csv --name public_hwe
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset custom --resume
.\.venv\Scripts\python.exe -m benchmark.analyze_results --input results/custom_predictions.csv --name custom
.\.venv\Scripts\python.exe -m benchmark.build_comparison_report
```

同じmanifest画像を両モデルへ入力し、ウォームアップを本計測から除外します。例外・OOMもCSVへ保存し、GPUではCUDA同期後に測定します。
生結果・集計・図は `results/`、採用判断と完了状況は [モデル比較レポート](../reports/model_comparison.md) を参照してください。
CPU専用の応答時間検査は [CPU検証レポート](../reports/cpu_performance_validation_2026-10-08.md) に記載しています。

## 指標と解釈

- Exact Match：文字列完全一致。
- Normalized Match：空白、left/right、dfracなど安全な表記差を正規化した一致。
- レイテンシ：平均・中央値・P95・最大。ロード時間とは分離する。
- Render/Structure Match：CSV列を確保しているが、CDMの外部ツール導入・検証は別途必要。

数学的同値判定は認識精度とは別問題です。また、公開HWEだけで採用を決めず、モデルの学習データとの重複可能性や展示に近い独自入力も考慮します。
