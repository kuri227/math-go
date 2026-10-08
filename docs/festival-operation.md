# 高専祭 展示PCの設営・運用マニュアル

## 目的別入口

- 改修しない配布先: READMEの「配布先PCに必要な環境」→CPU/GPU別の手順へ。
- GPUあり: `setup_festival_gpu.ps1`（初回）→`start_festival_gpu.ps1`（毎回）。
- GPUなし・GPUを使わない: `setup_festival_cpu.ps1`（初回）→`start_festival_cpu.ps1`（毎回）。
- 問題がある: 下の「トラブル対処」へ。

ZIPを使う展示PCにはGit・Node・pnpmは不要ですが、64bit Python本体・ブラウザーは必要です。
初回は依存関係と約1.2GBのモデル重みをインターネットから取得します。会場前に済ませてください。
CPU版のモデル環境は `.venv-texteller-cpu`、GPU版は `.venv-texteller`。両方を導入しても重みの保存先は共通です。

## 対応範囲

Windows 11 x64 / Python 3.10 / Node 22.17.1 / pnpm 11.25.0 / NVIDIA RTX 3050 Laptop 4GB / RAM 16GBで検証。
64bit Python 3.10–3.12を受け付けます。CPU版はRyzen 5 5600Hで実測済み（GPU無効・CPU専用wheel）。Linux x64向け手順は未実機検証です。
空き20GB以上を目安に確保してください。モデルだけで約1.2GB、他にPyTorch・仮想環境・ダウンロードキャッシュが必要です。
評価用UniMERNetやデータセットを入れる場合はさらに容量が必要です。

## 初回設営

1. READMEのclone・セットアップコマンドを実行する。モデルの取得は初回のみネット接続が必要。
2. `check_environment.ps1 -RequireReady -Device cuda` のFAILがないことを確認する。
3. `start_festival.ps1 -Device cuda` で起動する。準備完了まで待ち、Displayを開く。
4. 液タブ・モニターをWindowsの「拡張」で接続。Displayはモニター、Controllerは液タブへ移す。
5. 同じブラウザー・プロファイルで開く。`localhost` と `127.0.0.1`、ポート番号の違いも別Originとなる。URLのsessionをそろえる。
6. 初めは時間制限なしの練習を選ぶ。モード説明を読んで開始し、ペン入力→戻す→全消去→提出→正誤表示→次問→結果画面を確認する。
7. 20秒チャレンジは時間切れと残機終了、練習は最終5問まで完走して終了理由の表示を確認する。
8. 両画面で全画面・ウィンドウ縮小を試し、問題と提出/戻すボタンが見えることを確認する。

液タブの筆圧・ドライバー・OS拡大率による動作は実機リハーサルが必要です。自動テストでは代替できません。
ゲームには正解数・連続正解・正解率を表示し、加点スコアは使いません。
判定は登録済みの正答と許容表記の照合です。数学的な任意の同値式を判定するCASではありません。

## 当日のチェックリスト

- 電源接続、スリープ・通知・OS更新による中断を避ける設定を担当者が確認する。
- PC再起動後、上記起動コマンドを再実行する。PowerShellを閉じるとサーバーも停止する。
- `http://127.0.0.1:8000/api/v1/health/ready?model=texteller` が `ready` であることを確認する。`/health` はモデル準備を保証しない。
- 両画面の接続表示を確認。時間制限なしの1問を実際のペンで提出する。
- オフライン運用なら、前日に回線を切って同じ手順を試す（ゲームの数式・フォントはビルドへ同梱）。
- 1セット終了後、もう一度遊ぶ操作で次の参加者へ渡す。

## 起動オプション

```powershell
.\scripts\start_festival.ps1 -SingleScreen -Device cuda
.\scripts\start_festival.ps1 -Port 8001 -NoBrowser -Device cuda
# NVIDIA GPUなし: セットアップもCPU版にする
.\scripts\setup_festival.ps1 -Device cpu
.\scripts\start_festival.ps1 -Device cpu
```

CPU/GPUの必要な環境を初回にセットアップした後は、それぞれの起動スクリプトだけで切り替えられます。
CPU性能と検証条件は `reports/cpu_performance_validation_2026-10-08.md` を参照してください。
`-Lan` は信頼できる閉じたLANに限ること。問題編集APIに認証はなく、不特定ネットワークへ公開しないでください。
LAN公開してもDisplayとControllerの別PC間同期はできません。

## トラブル対処

| 状況 | 確認・対処 |
| --- | --- |
| Python / pnpmが見つからない | PATHとバージョンを確認。Pythonは `-Python` にフルパスを指定。pnpm 11.25.0を導入する |
| セットアップ失敗 | 最初に失敗したコマンドを確認し、通信・空き容量・ドライバーを直して再実行。成功したように続行はしない |
| CUDA unavailable / 起動失敗 | NVIDIAドライバーとtorch wheelの互換性を確認。無理な自動フォールバックはせず、CPU版を明示的に選ぶ |
| ポート使用中 | 自分が起動したサーバーをCtrl+Cで停止するか `-Port 8001` を使う。無関係なプロセスは終了しない |
| 接続済みの別の液タブと表示 | 古いControllerを閉じる。数秒待って再接続。同じsessionの入力端末は1つのみ |
| Controllerが開かない | ポップアップ許可と同じブラウザーを確認。Displayが示すController URLを同じプロファイルで開く |
| 提出時に503 / CUDAエラー | 次の要求でワーカー再生成を試す実装。続く場合は起動したPowerShellを停止・再起動しログを保存 |
| 正しいはずの式が不正解 | 認識された式と登録正答を確認。手書きの認識失敗と、許容表記不足を分けて調べる |
| 途中で終了した | 残機切れか全問完了かを結果画面で確認。時間切れも残機を消費する |
| 画面が古い | サーバー停止→再build→再起動→両画面再読み込み。片方だけ古いタブを残さない |

ログ: `.runtime/server.stdout.log` / `.runtime/server.stderr.log` / `results/logs/texteller.log`。
ログ・参加者の筆跡・モデル・仮想環境はGitに入れないでください。
展示終了時は起動したPowerShellでCtrl+C。モデル環境や重みを他PCへ丸ごとコピーせず、新PCではセットアップを実行します。

## 更新・問題の編集

問題編集画面は `/questions/editor`（実際のルートはREADMEの問題編集項目も参照）です。
`config/game_questions.json` の変更をバックアップしてから更新します。
更新前に `git status` / `git diff -- config/game_questions.json` を確認し、ローカル変更を無理に消さないでください。
サーバー停止後、変更を保存したうえで `git pull --ff-only` → セットアップ再実行 → 回帰テスト → 当日手順リハーサル。
更新衝突でpullが止まった場合、`reset --hard` せず担当開発者に確認してください。

## Linux x64（手順提供・実機未検証）

Git / 64bit Python 3.10–3.12（venvモジュール含む）/ Node.js 22.12以上 / pnpm 11.25.0を事前に用意します。
CUDA版には対応NVIDIAドライバーが必要です。

```bash
git clone https://github.com/kuri227/math-go.git
cd math-go
npm install -g pnpm@11.25.0
python3 scripts/setup_festival.py --runtime-only --device cuda
.venv/bin/python scripts/preflight.py --require-ready --device cuda --port 8000
HMER_EAGER_MODELS=texteller TEXTELLER_DEVICE=cuda .venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

準備完了後に同じブラウザーで `http://127.0.0.1:8000/display` を開きます。停止はCtrl+C。
CPU版はセットアップの `--device cpu` と起動の `TEXTELLER_DEVICE=cpu` の両方を指定します。
WindowsのPowerShell起動スクリプトはLinuxでは使いません。

## ZIPを使う場合

ソースcloneの代わりにビルド済みZIPを展開して `setup_festival.ps1` → `start_festival.ps1` を実行できます。
Node/pnpmは再buildしない限り不要ですが、Python・モデル取得・互換ドライバーは必要です。
ZIPにはモデル・個人筆跡・venvを含めません。ZIP内はフロントエンドのソースを含まないため、改修にはGit cloneを使ってください。
