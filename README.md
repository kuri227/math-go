# 数学でGO

文化祭向けの手書き数学ゲームと、その認識基盤を開発するプロジェクトです。ゲームではTexTellerを低遅延で利用し、評価画面ではTexTellerとUniMERNetを同一条件で比較できます。初期PoCで得た評価結果、共通API、データ収集基盤を保持しながら、最終展示へ向けたゲーム本体を同じリポジトリで育てています。

## 高専祭展示PCでのクイックスタート

通常の展示では **TexTellerだけ** を使用します。UniMERNet・評価データの取得は不要です。
Git cloneだけではモデルや依存関係は入りません。初回セットアップにはインターネットが必要です。

検証済み環境はWindows 11 x64、64bit Python 3.10.5、Node.js 22.17.1、pnpm 11.25.0、RAM 16GB、RTX 3050 Laptop GPU（VRAM 4GB）です。
展示用の推奨目安はRAM 16GB以上・空き容量20GB以上・CUDA対応NVIDIA GPU（4GB以上。ただしモデル同時ロードは避ける）です。
Python 3.10–3.12を受け付けますが、3.11/3.12およびLinux・CPU推論の速度はこの検証では未測定です。
CPU用セットアップも提供します。macOS・ARM・AMD GPU・WSLでの動作は保証しません。
「どの環境でも」無条件に動くとはせず、対応条件と未検証条件を分けています。

事前にGit、64bit Python 3.10系、Node.js 22.12以上（検証系列は22）を導入し、PowerShellで実行してください。
公式配布元: [Git](https://git-scm.com/downloads)、[Python](https://www.python.org/downloads/)、[Node.js](https://nodejs.org/en/download)、[PyTorchの実行環境](https://pytorch.org/get-started/locally/)。

```powershell
git clone https://github.com/kuri227/math-go.git
cd math-go
python --version
node --version
npm install -g pnpm@11.25.0
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_festival.ps1 -Python python -Device cuda
.\scripts\check_environment.ps1 -RequireReady -Device cuda
.\scripts\start_festival.ps1 -Device cuda
```

Pythonが複数ある場合、`-Python` に使用するpython.exeのフルパスを指定してください。
GPUがない場合はセットアップと起動の **両方** を `-Device cpu` に変更します。CPUでもゲームの時間制限は変わらないため、まず時間制限なしの練習で遅延を確認してください。
GPU版は検証済みのtorch 2.14.0 / torchvision 0.29.0 / CUDA 13.2 wheelを使用し、互換性のあるNVIDIAドライバーが必要です。別途CUDA Toolkitを導入する手順ではありません。
モデルは [公式TexTeller](https://github.com/OleehyO/TexTeller) の固定revisionを取得します。

起動はモデルの準備完了を確認してから `/display` を開きます。Display側の液タブを開く操作でControllerを別ウィンドウに出し、OSの拡張ディスプレイで液タブへ移してください。
両画面は **同じPC・同じブラウザーのプロファイル・同じOrigin・同じsession** が必要です。別PC同士の同期機能ではありません。
停止は起動したPowerShellでCtrl+C。1画面版は `-SingleScreen`、ポート変更は `-Port 8001` です。

- [設営・当日の運用・トラブル対処・Linux手順](docs/festival-operation.md)
- [大規模テスト結果と検証限界](reports/exhibition_release_validation_2026-10-08.md)
- [開発の変遷とコミットの読み方](docs/development-history.md)

初回のモデル取得・ビルド後、展示ゲームはローカルで動作します。配布ZIPにはビルド済み画面を入れますが、Python環境とモデルのセットアップは別途必要です。
評価画面の外部CDNや追加評価データは別条件です。当日のネットワークなし運用は事前リハーサルをしてください。

### 開発・回帰テスト

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements/test.txt
.\.venv\Scripts\python.exe scripts/verify_exhibition.py
# サーバー起動済みの別PowerShellで実モデルの連続認識を確認
.\.venv\Scripts\python.exe scripts/smoke_exhibition.py --requests 30 --concurrency 2
```

回帰テストはビルド、全50問の検証、TypeScript/Pythonのテスト、依存関係チェックを実行します。
実モデルテストはAPIの安定性を調べるもので、合成入力を使い、手書き認識精度や実機のペン操作を保証するものではありません。
バックエンドの直接依存は `requirements/festival.txt` に検証済みバージョンを固定し、フロントエンドは `game/pnpm-lock.yaml` で固定しています。Pythonの推移的依存の全固定ではありません。

## 開発状況

本プロジェクトは、文化祭で実際に遊べる手書き数学ゲームとして公開することを目標に**開発中**です。現在はモデル比較、認識API、手書き入力、7段階の難易度選択、50問のJSON問題データ、正答・解説表示、5問練習、20秒チャレンジ、30問マラソンまで動作します。

現段階は完成版ではありません。文化祭での運用前に、複数筆者・ペン・タッチ端末での入力評価、連続稼働、複数端末からの同時利用、問題と難易度の調整、プレイ前後のUX、数学的同値判定を追加検証します。モデル比較用データとゲーム本体を同じリポジトリで管理していますが、個人の筆跡データ、モデル本体、公開データセット本体はGitへコミットしません。

最終展示向けに、問題・演出を表示するモニター用Displayと、手書き・提出操作を行う液タブ用Controllerを実装しています。現行の1画面版はフォールバックとして残し、同一PC・同一ブラウザー・同一Originの別ウィンドウを `BroadcastChannel` で同期します。実装方針は `docs/dual-screen-game-design.md`、引き継ぎ時点の進捗は `docs/agent-handoff-2026-10-08.md` を参照してください。

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
config/game_questions.json  展示用の問題・正答・解説
config/game_questions.schema.json  問題JSONの構造定義
data/manifests/           UniMER-Test HWE manifest
data/custom/              独自Canvas評価データ（Git対象外）
docs/architecture.md      設計とデータフロー
docs/recognition_service_requirements.md  外部プログラム向け認識サービス要件
docs/game_prototype_plan.md  最小ゲーム画面と低遅延化の実装計画
docs/final-exhibition-game-spec.md  最終展示向けゲーム・システム仕様
docs/question-authoring-guide.md  問題追加の形式・判断基準・検証手順
docs/dual-screen-game-design.md  モニターと液タブへ分割する次期ゲーム構成
docs/agent-handoff-2026-10-08.md  次のコーディング担当向けの現状・検証・実装順
docs/adr/0002-file-based-question-bank.md  問題をJSONで管理する判断とDB移行条件
docs/adr/0003-dual-screen-game-ui.md  2画面同期方式と責務分離の判断
docs/adr/0001-game-frontend-stack.md  採用済みのPhaser中心構成
results/                  生結果、集計、図、失敗分析、最終レポート
scripts/                  Windowsセットアップと起動
```

## 前提環境

- Windows 11 x64で検証済み。Linuxの手順は運用マニュアル参照（未実機検証）
- Python 3.10を推奨
- Node.js 22.12以上とpnpm 11.25.0（ソースからのbuild時）
- NVIDIA GPUは任意。CPUでもAPIは起動できますが、モデル推論は大幅に遅くなります。
- このPCではNVIDIA GeForce RTX 3050 Laptop GPU、VRAM 4,096 MiBを確認しました。ブラウザでページを開くと2モデルを順番にバックグラウンドロードし、一時的なVRAM使用量の急増を避けます。

TexTellerは `transformers==4.47`、UniMERNetは `transformers==4.42.4` を要求するため、単一環境へ混在させません。`.venv`、`.venv-texteller`、`.venv-unimernet` の3環境へ分離します。

## セットアップ

PowerShellでリポジトリルートから実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build_game.ps1
.\scripts\setup_models.ps1 -Python python -UniMERNetVariant tiny
```

以下はモデル比較・評価を行う開発者向けの手順です。展示のみなら上の `setup_festival.ps1` を使ってください。このスクリプトは次を行います。

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

2画面版は、モニターで [http://127.0.0.1:8000/display](http://127.0.0.1:8000/display) を開き、「液タブ画面を開く」からControllerウィンドウを起動します。ポップアップを許可し、Controllerを液タブ側へ移動してから全画面にしてください。直接開く場合は、DisplayとControllerの両URLへ同じ `session` クエリを付けます（例: `/display?session=festival-a` と `/controller?session=festival-a`）。

- ページ表示と同時にTexTellerだけをバックグラウンドで準備する。準備中はタイトルとコース選択を表示し、開始ボタンを理由付きで無効にする。Phaserは開始後に遅延読込する。
- 小学校低学年から大学院まで7段階の難易度を選ぶ。選択段階を上限に、直下の復習問題も混ぜる。
- 時間制限なしの5問練習、1問20秒・7問のチャレンジ、時間制限なし・30問のマラソンから選ぶ。
- 問題を確認し、Canvasへマウス、ペン、タッチで回答を書く。
- 「回答を提出」で手書き画像を読み取り、登録済みの正答候補と照合する。
- 判定後はプレイ画面から結果画面へ切り替え、書いた画像・読み取った答え・正答・解説をスクロールせず比較できる構成にする。
- 正解数、連続正解、残機を更新する。認識・判定中は時計を止め、最後に正解数／回答した問題数と正解率を表示する。
- 残り時間に応じて問題を上限付きで拡大し、終了直前は切替可能な警告音で知らせる。
- 時間切れや「わからない」でも自動遷移せず、正答と解説を確認してから次へ進む。
- 認識結果が意図と違う場合は失点を確定せず書き直せる。`Q` で中断、`Enter` で提出／次へ進める。

比較・評価データ収集画面は `http://127.0.0.1:8000/evaluation` に残しています。操作は次のとおりです。

- ページ表示直後にTexTeller、UniMERNetの順でモデル準備を開始する。準備中は進捗を表示し、「両モデルで認識する」は押せません。
- Canvasへマウス、ペン、タッチで入力する。
- 「1画戻す」「全消去」で編集する。
- 「PNGと筆跡を保存」でcrop済みPNGとstroke JSONをローカル保存する。
- 「両モデルで認識する」で、同一のcrop済みPNGをTexTellerとUniMERNetへ渡し、LaTeX、レンダリング、推論時間を並べて表示する。
- 人手確認した正解LaTeX、カテゴリ、難易度、匿名writer IDを入力し、「評価データとして保存」で `data/custom/` へ保存する。

問題作成者は、サーバー起動中に [http://127.0.0.1:8000/questions/editor](http://127.0.0.1:8000/questions/editor) を開くと、フォームから問題を登録できます。詳細とJSONを直接編集する方法は [`docs/question-authoring-guide.md`](docs/question-authoring-guide.md) を参照してください。編集後は次のコマンドで、ID重複、必須項目、正答候補、難易度範囲を検証できます。

```powershell
.\.venv\Scripts\python.exe scripts\validate_game_questions.py
```

ゲーム用APIは `GET /api/v1/health/live`、`GET /api/v1/health/ready`、`GET /api/v1/questions`、`GET /api/v1/solutions/{question_id}`、`POST /api/v1/models/{model}/preload`、`POST /api/v1/recognitions`、`POST /api/v1/judgements` を提供します。ローカル問題登録画面は `POST /api/v1/admin/questions` を使用します。旧PoC用の `GET /health`、`GET /models`、`POST /models/preload`、`POST /recognize`、`POST /recognize/compare`、`POST /samples` も維持しています。比較APIはアップロードを一度だけ検証・一時保存し、その同一ファイルパスを両workerへ渡します。

フロントだけをHMR付きで開発する場合は次を使用します。FastAPIは8000番、Viteは5173番で起動し、`/api` はViteからFastAPIへproxyされます。

```powershell
.\scripts\run_game_dev.ps1
```

ゲームのUX実測を再実行するには、サーバーとTexTellerを準備した状態で次を実行します。

```powershell
.\.venv\Scripts\python.exe -m benchmark.game_ux_benchmark
```

生データは `results/game_ux_benchmark.json` と `results/game_ux_predictions.csv`、仕様は `docs/kanji-go-inspired-game-spec.md`、検証レポートは `reports/game_ux_validation.md` にあります。

問題と手書き欄の同時表示は、デスクトップ、ノートPC、タブレット縦、スマートフォン縦横、320×568の最小想定画面で確認しています。寸法と検証範囲は `reports/responsive_layout_validation.md` を参照してください。

## 文化祭向け開発版Release

文化祭PCへGitやNode.jsを要求せずに配布できるよう、Windows用ZIPを生成できます。現段階では正式版ではなく、セットアップと運用を検証するPre-releaseです。

```powershell
.\scripts\package_release.ps1 -Version 0.1.0-alpha.2
```

`release-build/math-go-0.1.0-alpha.2-windows.zip` とSHA-256ファイルが生成され、展開後の必須ファイルと禁止データを自動検査します。ZIPにはbuild済みの3画面、FastAPI、固定直接依存、起動・診断スクリプト、運用マニュアルを含みます。仮想環境、モデル重み、個人筆跡、実行ログ、公開データセット本体は含みません。これはローカル生成物であり、GitHub Releaseの公開やタグ作成は別の操作です。

展開先PCでは次を実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_festival.ps1
.\scripts\start_festival.ps1
```

初回セットアップはゲーム用のTexTellerだけを導入します。比較画面でUniMERNetも使う開発PCでは、`setup_festival.ps1 -IncludeEvaluationModels` を指定します。`start_festival.ps1 -Lan` は信頼できるLANでのAPI公開用です。問題編集APIに認証はなく、公衆ネットワークへ公開しないでください。Display/Controllerを別PC間で同期する機能ではありません。

配布前の環境診断だけを実行する場合：

```powershell
.\scripts\check_environment.ps1 -RequireReady
```

旧alpha.1のリリースノートは `docs/releases/v0.1.0-alpha.1.md`、今回の展示前検証は `reports/exhibition_release_validation_2026-10-08.md` を参照してください。

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
