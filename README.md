# 数学でGO 手書き数式認識 PoC

文化祭向けゲーム「数学でGO」の手書き数式入力を、TexTellerとUniMERNetのローカル推論で比較するPoCです。ブラウザのCanvas入力からcrop済みPNGと筆跡系列を生成し、共通API、同一評価画像、再実行可能な集計コードで2モデルを比較します。

## 開発状況

本プロジェクトは、文化祭で実際に遊べる手書き数学ゲームとして公開することを目標に**開発中**です。現在はモデル比較、認識API、手書き入力、サンプル問題、正答判定、5問練習、30秒チャレンジまで動作します。

現段階は完成版ではありません。文化祭での運用前に、複数筆者・ペン・タッチ端末での入力評価、連続稼働、複数端末からの同時利用、問題と難易度の調整、プレイ前後のUX、数学的同値判定を追加検証します。モデル比較用データとゲーム本体を同じリポジトリで管理していますが、個人の筆跡データ、モデル本体、公開データセット本体はGitへコミットしません。

## 現在の検証状態

- 公式UniMER-Test ZIPはSHA-256 `9bf370b8cac868fee84835f40dec26c477430611253e3feb681356a8149a3a90` を確認済みです。
- HWEは画像6,332件、正解LaTeX 6,332件、利用可能ペア6,332件です。欠損、破損、余剰画像、空ラベルはありません。
- manifestは `data/manifests/unimer_hwe.csv` に生成します。公開HWEはテスト専用で、学習・Fine-tuningには使用しません。
- Web/API/評価・集計コードはモデル別の仮想環境を前提にしています。モデル実測の完了状況と採用判断は `reports/model_comparison.md` を参照してください。

## 構成

```text
frontend/                 Canvas、Pointer Events、crop、保存、結果表示
game/                     Phaser + TypeScript + Viteのゲーム本体
backend/app/              FastAPIと共通Recognizer
backend/model_workers/    TexTeller / UniMERNetの常駐ワーカー
benchmark/                データ準備、評価、集計、レポート生成
config/paths.toml         データ位置の唯一の設定元
data/manifests/           UniMER-Test HWE manifest
data/custom/              独自Canvas評価データ（Git対象外）
docs/architecture.md      設計とデータフロー
docs/recognition_service_requirements.md  外部プログラム向け認識サービス要件
docs/game_prototype_plan.md  最小ゲーム画面と低遅延化の実装計画
docs/adr/0001-game-frontend-stack.md  採用済みのPhaser中心構成
results/                  生結果、集計、図、失敗分析、最終レポート
scripts/                  Windowsセットアップと起動
```

## 前提環境

- Windows 11またはLinux
- Python 3.10を推奨
- Node.js 22以降とpnpm 11以降（ゲームフロントのbuild時）
- NVIDIA GPUは任意。CPUでもAPIは起動できますが、モデル推論は大幅に遅くなります。
- このPCではNVIDIA GeForce RTX 3050 Laptop GPU、VRAM 4,096 MiBを確認しました。ブラウザでページを開くと2モデルを順番にバックグラウンドロードし、一時的なVRAM使用量の急増を避けます。

TexTellerは `transformers==4.47`、UniMERNetは `transformers==4.42.4` を要求するため、単一環境へ混在させません。`.venv`、`.venv-texteller`、`.venv-unimernet` の3環境へ分離します。

## セットアップ

PowerShellでリポジトリルートから実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_models.ps1 -Python python -UniMERNetVariant tiny
```

このスクリプトは次を行います。

1. Web/API/ベンチマーク用 `.venv` を作成する。
2. TexTeller用 `.venv-texteller` を作成する。
3. 公式UniMERNetを `third_party/UniMERNet` へ取得する。
4. UniMERNet用 `.venv-unimernet` を作成する。
5. 公式 `wanderkid/unimernet_tiny` checkpointを取得する。

NVIDIA環境ではPyTorch 2.14のCUDA 13.2 wheelを導入します。このPCのCUDA 13.3対応ドライバーで実行可能な公式wheelです。

モデルや公式コードは大容量のためGit管理しません。セットアップ時に、TexTellerは推論に必要なsafetensors/tokenizerだけを、UniMERNetは選択variantのcheckpointを公式配布元から取得します。

### GPUとCPUの指定

認識デバイスは環境変数で指定できます。`auto` はCUDAが利用可能ならGPUを選びます。

```powershell
$env:TEXTELLER_DEVICE = "cuda"
$env:UNIMERNET_DEVICE = "cuda"
$env:UNIMERNET_VARIANT = "tiny"
```

モデルをサーバー起動時にロードする場合は次のように指定します。4 GB VRAMでは両方同時ではなく片方だけを推奨します。

```powershell
$env:HMER_EAGER_MODELS = "texteller"
```

## 評価データの準備

データパスは `config/paths.toml` から解決します。通常はリポジトリ内の相対パスです。外付けSSDを使う場合だけ `HMER_DATA_ROOT` でデータルートを上書きできます。

```powershell
.\.venv\Scripts\python.exe -m benchmark.prepare_unimer
```

処理内容は公式ZIP取得、SHA-256確認、安全な展開、HWE実構造確認、全画像の読込検査、manifest生成、manifest先頭の再読込です。既に公式ZIPがある場合は再取得しません。期待件数と異なる場合は終了コード2で失敗します。

## Webアプリの起動

最初にゲームフロントをbuildします。以後、`game/src/`を変更したときだけ再buildしてください。

```powershell
.\scripts\build_game.ps1
```

production相当の同一Origin構成は次で起動します。

```powershell
.\scripts\run_server.ps1
```

ブラウザで `http://127.0.0.1:8000` を開くとゲーム画面が表示されます。

- ページ表示と同時にTexTellerだけをバックグラウンドで準備する。準備中はタイトルとコース選択を表示し、開始ボタンを理由付きで無効にする。Phaserは開始後に遅延読込する。
- 時間制限なしの5問練習、または1問30秒・7問のチャレンジを選ぶ。
- 問題を確認し、Canvasへマウス、ペン、タッチで回答を書く。
- 「回答を提出」でcrop済みPNGをTexTellerへ送り、LaTeXを正答候補と照合する。
- 認識した数式と正答、画像化・推論・判定・反応までの時間、PNGサイズを毎回表示する。
- スコア、連続正解、残機を更新し、チャレンジでは残り時間ボーナスを加える。認識・判定中は時計を止め、最後に結果を表示する。
- 認識結果が意図と違う場合は失点を確定せず書き直せる。`Q` でスキップ、`Enter` で提出／次へ進める。

比較・評価データ収集画面は `http://127.0.0.1:8000/evaluation` に残しています。操作は次のとおりです。

- ページ表示直後にTexTeller、UniMERNetの順でモデル準備を開始する。準備中は進捗を表示し、「両モデルで認識する」は押せません。
- Canvasへマウス、ペン、タッチで入力する。
- 「1画戻す」「全消去」で編集する。
- 「PNGと筆跡を保存」でcrop済みPNGとstroke JSONをローカル保存する。
- 「両モデルで認識する」で、同一のcrop済みPNGをTexTellerとUniMERNetへ渡し、LaTeX、レンダリング、推論時間を並べて表示する。
- 人手確認した正解LaTeX、カテゴリ、難易度、匿名writer IDを入力し、「評価データとして保存」で `data/custom/` へ保存する。

ゲーム用APIは `GET /api/v1/health/live`、`GET /api/v1/health/ready`、`GET /api/v1/questions`、`POST /api/v1/models/{model}/preload`、`POST /api/v1/recognitions`、`POST /api/v1/judgements` を提供します。旧PoC用の `GET /health`、`GET /models`、`POST /models/preload`、`POST /recognize`、`POST /recognize/compare`、`POST /samples` も維持しています。比較APIはアップロードを一度だけ検証・一時保存し、その同一ファイルパスを両workerへ渡します。

フロントだけをHMR付きで開発する場合は次を使用します。FastAPIは8000番、Viteは5173番で起動し、`/api` はViteからFastAPIへproxyされます。

```powershell
.\scripts\run_game_dev.ps1
```

ゲームのUX実測を再実行するには、サーバーとTexTellerを準備した状態で次を実行します。

```powershell
.\.venv\Scripts\python.exe -m benchmark.game_ux_benchmark
```

生データは `results/game_ux_benchmark.json` と `results/game_ux_predictions.csv`、仕様は `docs/kanji-go-inspired-game-spec.md`、検証レポートは `reports/game_ux_validation.md` にあります。

## ベンチマーク

環境情報を記録してから評価します。

```powershell
.\.venv\Scripts\python.exe -m benchmark.collect_environment
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset public --limit 5 --output results/public_smoke.csv
```

`--limit` は配線確認用のsmoke testです。本評価では省略します。

```powershell
.\scripts\run_full_evaluation.ps1 -Device cuda
```

全6,332件は長時間かかります。スクリプトはTexTeller、UniMERNetを順番に実行し、成功済み行を保持して中断箇所から再開します。個別に実行する場合は次のコマンドを使います。

```powershell
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset public --models texteller unimernet --resume
.\.venv\Scripts\python.exe -m benchmark.analyze_results --input results/public_hwe_predictions.csv --name public_hwe
.\.venv\Scripts\python.exe -m benchmark.run_benchmark --dataset custom --resume
.\.venv\Scripts\python.exe -m benchmark.analyze_results --input results/custom_predictions.csv --name custom
.\.venv\Scripts\python.exe -m benchmark.build_comparison_report
```

評価はモデルごとに常駐ワーカーを起動し、最初のwarm-upを本計測から除外します。同じmanifest画像を両モデルへ入力し、失敗・OOM・例外もCSV行として保存します。GPU測定では各ワーカー内でCUDA同期を行います。

生成物:

- `results/public_hwe_predictions.csv`: Test Aの全予測と個別計測
- `results/custom_predictions.csv`: Test Bの全予測と個別計測
- `results/summary.csv`, `results/summary.json`: 公開/独自・モデル別の総合集計
- `results/figures/`: データセット別の精度とP95レイテンシ
- `results/failures/`: 代表的失敗画像、出力、原因仮説
- `reports/model_comparison.md`: 比較、採用判断、残課題
- `results/environment.json`: OS、Python、GPU等

## 独自Canvas評価

公開HWEだけで採用モデルを決めません。数学でGO本番に近い50〜100件以上を複数人・複数入力機器で収集し、1サンプルごとに `image.png`、`strokes.json`、`metadata.json`、人手レビュー済み `ground_truth_latex` を対応付けます。個人名は保存せず、必要なら匿名 `writer_id` を使用します。独自manifestへは `sample_id,image_path,ground_truth_latex,subset,category,input_device` を含め、`--manifest` で評価します。

## テスト

```powershell
.\.venv\Scripts\python.exe -m pytest
pnpm --dir game test
pnpm --dir game build
```

Pythonテストはパス解決、LaTeX正規化、health、不正モデル、不正画像、新ゲームAPIを確認します。TypeScriptテストはゲーム進行を確認し、build時に型検査も実行します。実モデルのEnd-to-End確認は起動後のゲーム画面またはsmoke benchmarkで行います。

## 評価指標

- Exact Match: 文字列完全一致
- Normalized Match: 空白、`\\left` / `\\right`、`\\dfrac`等の安全な表記差だけを正規化
- Render/Structure Match: CSV列は確保していますが、CDMはNode.js、ImageMagick、LaTeX環境を要するため別途導入検証が必要
- レイテンシ: 平均、P50、P95、最大。モデルロード時間とは分離

`x(x+1)` と `x^2+x` のような数学的同値はHMER精度とは別問題であり、今回の正規化では一致扱いにしません。

## 既知の制約

- UniMER-Test HWEはUniMERNet開発元の公開評価セットです。この結果だけでUniMERNetを採用しません。
- TexTeller 3.0の公開学習データには既存手書きデータ由来のsubsetが含まれるため、公開HWE上の数値は学習データ重複の可能性も考慮して解釈します。
- 4 GB VRAMではOOMが起きる可能性があります。tiny variant、逐次実行、CPU fallbackを使い、デバイス条件を結果へ残します。
- ゲーム画面のKaTeXと日本語フォントはbundleへ含めています。旧比較画面だけはCDN assetを利用します。認識画像や筆跡は外部へ送信しません。
- Fine-tuning、SymPyによる数学的同値判定、Online HMER、Unity連携は今回の範囲外です。

## 公式参照先

- TexTeller: https://github.com/OleehyO/TexTeller
- UniMERNet: https://github.com/opendatalab/UniMERNet
- UniMER dataset: https://huggingface.co/datasets/wanderkid/UniMER_Dataset
