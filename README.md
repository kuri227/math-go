# 数学でGO

「数学でGO」は、高専祭・文化祭で来場者が遊べる、手書き回答型の数学ゲームです。
モニターに表示された問題を解き、液タブに答えを書くと、手書き数式認識モデルTexTellerが読み取り、正誤と解説を表示します。
小学校低学年から大学院までの7段階の難易度を用意し、計算から微分・積分などまで楽しめる展示を目指しています。

このリポジトリには、ゲーム本体に加え、ローカル認識API、JSON形式の問題管理、モデル比較・評価基盤を含みます。
画面はPhaser・TypeScript、APIはFastAPIで実装し、認識モデルは専用のPythonプロセスで動かします。
通常のゲームはTexTellerだけを使用します。認識画像を外部サービスへ送信せず、セットアップ後はPC内で認識します。

## 主な機能と現在の状態

- モニター用Displayと液タブ用Controllerの2画面構成。1画面版も利用可能。
- 7難易度・50問の問題バンク。問題・正答候補・解説をJSONで管理し、ブラウザーから問題を追加可能。
- 手書き入力、1画戻す、全消去、提出、認識違いの書き直し、正答・解説の確認。
- モード説明画面、全画面表示、画面サイズに応じたレイアウト、時間制限付き問題の拡大演出。
- 正解数・連続正解数・正解率と、全問完了／残機切れの終了理由を表示。加点スコアは使用しない。
- NVIDIA GPU／CPUでのローカル認識と、それぞれ専用のセットアップ・起動スクリプト。

| モード | 問題数 | 制限時間 | 初期残機 |
| --- | --- | --- | --- |
| じっくり練習 | 5問 | なし | 3回 |
| 20秒チャレンジ | 7問 | 1問20秒 | 3回 |
| 30問マラソン | 30問 | なし | 5回 |

展示に向けて開発・検証を継続しています。WindowsでのCPU/GPU認識とゲームの回帰テストは実施済みですが、展示PC・液タブ実機での操作と長時間稼働は設営前にリハーサルしてください。

## 目次

- [必要なPC環境](#requirements)
- [共通準備：環境確認とgit clone](#prepare)
- [NVIDIA GPUを使う](#gpu-start)
- [GPUなし・GPUを使わない：CPUで使う](#cpu-start)
- [モデル取得と既存環境への影響](#model-and-environment)
- [毎日の起動・2画面の設営](#operation)
- [git pullによる更新](#update)
- [CPU性能と検証結果](#validation)
- [問題編集・開発・テスト](#development)
- [リポジトリ構成と関連文書](#documents)

配布・更新は **git clone / git pullで運用する方針**です。以下は、改修しない展示PCでも同じ手順です。

<a id="requirements"></a>

## 必要なPC環境

git cloneにはビルド済み画面・モデル・Python仮想環境を含めません。
そのため、**改修しないPCにもGit・Python・Node.js・pnpmが必要**です。初回セットアップが画面のビルドまで行います。

| 項目 | 必要な環境・検証範囲 |
| --- | --- |
| OS | Windows 11 x64で検証済み。Linuxの手順は運用マニュアルに記載するが未実機検証 |
| PowerShell | Windows標準のWindows PowerShell 5.1、またはPowerShell 7。起動スクリプトは文字コードの誤読を避けるためASCIIで記述 |
| Python | 64bit Python 3.10系で検証済み。スクリプトは3.10–3.12を受け付けるが、3.11/3.12は未実機検証 |
| Git | リポジトリの取得・更新に必要 |
| Node.js | 22.12以上。検証バージョンは22.17.1。画面のビルドに必要 |
| pnpm | 11.25.0。フロントエンドの依存導入・ビルドに必要 |
| ブラウザー | Display/Controllerを同じブラウザー・プロファイルで開く |
| RAM・空き容量 | RAM 16GB、初回導入前の空き容量20GB以上を目安。評価データや追加モデルにはさらに容量が必要 |
| GPU | **必須ではない**。GPU推論はCUDA対応NVIDIA GPUと互換ドライバーが必要。RTX 3050 Laptop・VRAM 4GBで検証 |
| 液タブ | メーカー製ペンドライバーと、OSの拡張ディスプレイ設定を確認する |
| インターネット | 初回の依存関係・モデル取得と、更新時のセットアップに必要 |

CPU版にはNVIDIAドライバー・CUDA Toolkitは不要です。AMD RyzenでCPU推論を検証済みです。
GPU版も別途CUDA Toolkitを導入する手順ではなく、PyTorchのCUDA wheelと互換ドライバーを使います。
AMD／IntelのGPUによるGPU推論は対象外です。その場合はCPU版を選んでください。macOS・ARM・WSLは未実機検証です。

公式配布元：[Git](https://git-scm.com/downloads)、[Python](https://www.python.org/downloads/)、[Node.js](https://nodejs.org/en/download)。
Anacondaや開発用エディターは不要です。Python仮想環境はセットアップスクリプトが作ります。

<a id="prepare"></a>

## 共通準備：環境確認とgit clone

### 1. 必要なコマンドを確認する

Git・Python・Node.jsを事前に導入し、PowerShellで確認してください。

```powershell
git --version
python --version
node --version
pnpm --version
```

Pythonが複数ある場合は、後述のセットアップの `-Python` に使用するpython.exeのフルパスを指定します。
Pythonは64bit版を選び、インストール時にPATHへ追加してください。

pnpm 11.25.0が既に利用できる場合は、再インストールしません。
**pnpmが未導入の場合だけ**、次で導入できます。

```powershell
npm install -g pnpm@11.25.0
```

これはアプリ専用フォルダーではなく、npmのグローバル領域（PCの設定によってユーザー単位など）へ導入するコマンドです。
既存のpnpmが別バージョンの場合、無条件に実行するとそれを置き換える可能性があります。他プロジェクトで使用中なら管理担当者と調整してください。
このコマンドをアプリのセットアップスクリプトが自動実行することはありません。

### 2. リポジトリを取得する

書き込み可能なユーザーフォルダーで実行します。

```powershell
git clone https://github.com/kuri227/math-go.git
cd math-go
Set-ExecutionPolicy -Scope Process Bypass
```

`Set-ExecutionPolicy` は、このPowerShellだけでスクリプトを実行できるようにする指定です。PC全体の実行ポリシーは変更しません。
以後のコマンドは、READMEがある `math-go` フォルダーで実行してください。

次に **GPU／CPUのどちらか** のセットアップへ進みます。会場へ行く前に、モデル取得と初回起動を済ませてください。

<a id="gpu-start"></a>

## NVIDIA GPUを使う

**対応するNVIDIA GPUと互換ドライバーが入っていれば、必要なモデル・ライブラリを自動導入してGPUで使えます。**
GPUが存在するだけでは十分ではありません。NVIDIAドライバー自体のインストール・更新は、このスクリプトでは行いません。

初回セットアップ：

```powershell
.\scripts\setup_festival_gpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cuda
```

実行内容：アプリ用 `.venv`、GPUモデル用 `.venv-texteller` の作成、必要ライブラリとモデルの取得、画面のビルド、依存関係・CUDA利用可否の検査。
GPU版は検証済みのtorch 2.14.0 / torchvision 0.29.0 / CUDA 13.2 wheelを導入します。
CUDAが使えなければ理由を表示して止まり、勝手にCPUへ切り替えません。

起動：

```powershell
.\scripts\start_festival_gpu.ps1
```

<a id="cpu-start"></a>

## GPUなし・GPUを使わない：CPUで使う

**CPUでの起動・認識は実測済みです。** GPUがないPCや、搭載GPUを使わずに動かしたいPCはこちらを選びます。

初回セットアップ：

```powershell
.\scripts\setup_festival_cpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cpu
```

実行内容：アプリ用 `.venv`、CPUモデル用 `.venv-texteller-cpu` の作成、CPU専用PyTorchなどの導入、モデル取得、画面のビルド、依存関係の検査。
GPU版のモデル環境とは分離し、CPU起動スクリプトではCUDAも無効化します。

起動：

```powershell
.\scripts\start_festival_cpu.ps1
```

両方の環境を初回に導入すれば、その後は起動スクリプトだけでCPU／GPUを選べます。モデル重みは共通です。
まず時間制限なしの「じっくり練習」で、実際のペン入力と認識待ち時間を確認してください。

<a id="model-and-environment"></a>

## モデル取得と既存環境への影響

### モデルはセットアップ時に自動取得する

- 通常の展示ゲームはTexTellerだけを使用。UniMERNet・学習データ・公開評価データセットは不要です。
- 公式Hugging Faceから固定revision `7b96df06b9d81cdb129c3bef68b7250bc3e2b0ea` の必要な9ファイルを取得します。重みだけで約1.2GBあります。
- 保存先はリポジトリ内の `.model-cache/texteller`。CPU／GPUで同じ重みを共有します。
- 取得完了後の認識はローカルPC内で処理し、回答画像を外部認識サービスへ送信しません。
- 再セットアップでは配布元への確認通信が発生します。オフラインの日は起動スクリプトだけを使い、事前に回線なしでリハーサルしてください。
- ゲームの数式・日本語フォントはビルドに同梱。旧モデル比較画面のCDN利用は別条件です。

### 既存のGPU・Python環境を変更する？

| 対象 | セットアップによる変更 |
| --- | --- |
| このリポジトリの `.venv` / `.venv-texteller` / `.venv-texteller-cpu` | 作成・再利用し、その中のライブラリを導入・変更する |
| このリポジトリの `.model-cache` / `game/node_modules` / `game/dist` | モデル・フロント依存・ビルド済み画面を保存する |
| 他プロジェクトのvenv・Anaconda・グローバルPythonのライブラリ | 通常のセットアップでは変更しない |
| NVIDIAドライバー・システムのCUDA Toolkit | インストール・更新しない |
| グローバルpnpm | セットアップスクリプトは変更しない。上記 `npm install -g` を手動実行した場合は変更しうる |

新しくcloneした専用フォルダーで使い、アプリ専用venvを他用途と共有しないでください。
同じフォルダーに既にあるvenvは再セットアップで内容が変わります。フォルダーを移動した場合も、venvをそのまま流用せずセットアップし直します。
pnpmやpipのダウンロードキャッシュはユーザー領域にも保存されます。

<a id="operation"></a>

## 毎日の起動・2画面の設営

新しいPowerShellでリポジトリへ移動し、使用する方だけを起動します。毎回のセットアップは不要です。

```powershell
cd C:\path\to\math-go
Set-ExecutionPolicy -Scope Process Bypass
# CPUを使う場合
.\scripts\start_festival_cpu.ps1
# NVIDIA GPUを使う場合は、上の代わりに次を実行
# .\scripts\start_festival_gpu.ps1
```

起動スクリプトはモデルの準備完了を確認してから `http://127.0.0.1:8000/display` を開きます。
Displayの「液タブ画面を開く」でControllerを出し、ポップアップを許可して液タブへ移動してください。
Windowsの拡張ディスプレイでDisplayをモニター、Controllerを液タブに配置します。

両画面は **同じPC・同じブラウザーのプロファイル・同じOrigin・同じsession** が必要です。
`localhost` と `127.0.0.1`、異なるポートも別Originです。別PC間の2画面同期ではありません。

CPU／GPU両方の起動スクリプトで `-SingleScreen`（1画面版）、`-Port 8001`（ポート変更）、`-NoBrowser` を使えます。
停止は起動したPowerShellでCtrl+C。詳しい当日チェック・ログ・復旧は [運用マニュアル](docs/festival-operation.md) を参照してください。
問題編集APIに認証はないため、不特定ネットワークやインターネットへ公開しないでください。

<a id="update"></a>

## git pullによる更新

サーバーを停止してから、変更の有無を確認して更新します。

```powershell
git status
git diff -- config/game_questions.json
git pull --ff-only
# 使用する方のセットアップを再実行（GPUならgpu版）
.\scripts\setup_festival_cpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cpu
```

セットアップの再実行で依存関係の導入と画面の再ビルドまで行います。その後に両画面を開き直し、1セットをリハーサルしてください。
問題編集画面から追加した問題もローカル変更です。更新前に保存・バックアップし、衝突でpullが止まったら無理に上書きせず開発担当者へ確認してください。
`git reset --hard` で変更を消す手順にはしません。

<a id="validation"></a>

## CPU性能と検証結果

CPU専用torch 2.14.0+cpu、Ryzen 5 5600H（6コア12スレッド）、RAM 16GB、Windows 11で測定。GPU搭載PCですが、CUDA利用不可のCPU環境で検証しています。

| CPUでの測定 | 結果 |
| --- | --- |
| サーバー起動→モデル準備完了（事前チェック除外） | 約10.79秒 |
| 公開手書き画像16枚を各2回（32要求・逐次） | エラー0、中央値1.55秒、P95 2.71秒、最大2.75秒 |
| 合成筆跡で同時2要求・計30回 | エラー0、中央値1.95秒、最大1.97秒（待ち行列含む） |
| モデルプロセスのRAM | 測定時約1.52GiB、ピーク約2.60GiB（PC全体ではない） |

認識待ち中はゲームの時計を止めますが、認識リクエスト自体には30秒の上限があります。
別のPCや長い式で同じ速度を保証しません。また、APIの処理成功と正しく読み取れることは別です。
低性能CPU・RAM 8GB・液タブ実機・長時間稼働は未検証です。

詳細：[CPU検証結果](reports/cpu_performance_validation_2026-10-08.md)、[展示前の大規模テスト](reports/exhibition_release_validation_2026-10-08.md)。
2026-10-08時点の回帰テストはPython 179件・TypeScript 110件が通過しています。GPUでの実認識、clean cloneでの導入・ビルドも検証済みです。

<a id="development"></a>

## 問題編集・開発・テスト

### 問題を追加する

起動中に `http://127.0.0.1:8000/questions/editor` を開くと、問題・正答候補・解説を登録できます。
保存先は `config/game_questions.json`。形式と作成基準は [問題作成ガイド](docs/question-authoring-guide.md) を参照してください。

```powershell
.\.venv\Scripts\python.exe scripts/validate_game_questions.py
```

### 回帰テストと実モデル確認

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements/test.txt
.\.venv\Scripts\python.exe scripts/verify_exhibition.py
# サーバー起動済みの別PowerShellで、CPUの実認識を確認
.\.venv\Scripts\python.exe scripts/smoke_exhibition.py --expected-device cpu --requests 30 --concurrency 2
```

GPUで確認する場合は `--expected-device cuda` を使います。
回帰テストはビルド、問題バンク検証、TypeScript/Pythonテスト、pip checkを実行。実モデル検査は合成入力を使うAPI安定性確認で、認識精度の評価ではありません。
バックエンドの直接依存は `requirements/festival.txt`、フロントエンドは `game/pnpm-lock.yaml` で固定しています。Pythonの推移的依存すべてを固定しているわけではありません。

画面開発はFastAPIを8000番で起動したうえで `scripts/run_game_dev.ps1` を使用します。Viteは5173番で動き、APIをFastAPIへproxyします。
**モデル比較・データ収集・ベンチマークは展示には不要**です。詳しい手順を [モデル評価ガイド](docs/model-evaluation-guide.md) に分けています。

<a id="documents"></a>

## リポジトリ構成と関連文書

```text
game/               Phaser + TypeScriptのゲーム画面
backend/            FastAPI・認識モデル用ワーカー
frontend/           モデル比較・手書き収集・問題編集画面
config/             問題JSON・schema・データパス設定
benchmark/          評価データ準備・認識評価・集計
scripts/            CPU/GPU別セットアップ・起動・検証
docs/               設計・運用・問題作成・開発履歴
reports/            検証結果と制約の記録
```

- [ゲーム・システム仕様](docs/final-exhibition-game-spec.md)
- [アーキテクチャ](docs/architecture.md) / [2画面設計](docs/dual-screen-game-design.md)
- [外部プログラム向け認識API要件](docs/recognition_service_requirements.md)
- [開発の変遷](docs/development-history.md) / [設計判断（ADR）](docs/adr/)
- 公式モデル：[TexTeller](https://github.com/OleehyO/TexTeller)、[UniMERNet](https://github.com/opendatalab/UniMERNet)

## 既知の制約

正誤判定は、登録正答と許容表記の照合です。`x(x+1)` と `x^2+x` のような任意の数学的同値を判定するCASではありません。
Fine-tuning、Online HMER、Unity連携は現在の範囲外です。
モデル重み・公開データセット本体・仮想環境・ビルド済み画面・個人の筆跡・実行ログはGitに入れません。
