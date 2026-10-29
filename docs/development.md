# 開発者向けガイド

この文書は、数学でGOのコード・問題・テストを変更する人向けです。展示PCへ導入するだけの場合は [はじめての導入ガイド](installation.md) を使用してください。

## 構成

| パス | 内容 |
| --- | --- |
| `game/` | TypeScript、DOM、Canvas、KaTeXによるゲーム画面 |
| `backend/` | FastAPI、問題、採点、保存、モデルワーカー管理 |
| `config/game_questions.json` | 516問の問題バンク |
| `scripts/` | セットアップ、起動、検証、学習用スクリプト |
| `requirements/` | Python依存関係 |
| `docs/` | 現行仕様、運用、設計判断 |
| `reports/` | 日付と環境を固定した検証記録 |

通常ゲームの認識はTexTellerのみです。UniMERNetは比較・評価を明示的に行う場合だけ使用します。

## 開発画面を起動する

先にFastAPIを8000番で起動し、別のPowerShellで次を実行します。

```powershell
.\scripts\run_game_dev.ps1
```

Viteは5173番で起動し、API要求を8000番へ転送します。本番確認は必ず`game/dist`をビルドし、8000番のFastAPIから配信した画面で行ってください。

## 問題を追加・確認する

サーバー起動中に次を開きます。

```text
http://127.0.0.1:8000/questions/editor
```

保存先は`config/game_questions.json`です。形式、正答候補、解説の基準は [問題作成ガイド](question-authoring-guide.md) に従ってください。

```powershell
.\.venv\Scripts\python.exe scripts\validate_game_questions.py
```

## 回帰テスト

```powershell
.\.venv\Scripts\python.exe -m pytest -q -o addopts=''
pnpm --dir game test --reporter=dot
pnpm --dir game build
.\.venv\Scripts\python.exe scripts\check_docs.py
git diff --check
```

実モデルを含む起動確認は、CPUまたはGPUサーバーを別のPowerShellで起動してから行います。

```powershell
.\.venv\Scripts\python.exe scripts\verify_exhibition.py
.\.venv\Scripts\python.exe scripts\smoke_exhibition.py --expected-device cpu --requests 30 --concurrency 2
```

GPUでは`--expected-device cuda`を指定します。APIの安定性確認と認識精度の評価は別です。公開データによる比較は [モデル評価ガイド](model-evaluation-guide.md) を参照してください。

## データを変更する検査

問題登録や学習候補保存を試す場合は、原本を直接使いません。

- 問題バンクのコピーを`HMER_QUESTION_BANK`で指定する
- 隔離したデータフォルダーを`HMER_DATA_ROOT`で指定する
- `data/training`の台帳を削除・初期化しない
- 同じ手書き画像を複数回学習へ投入しない

## 変更時の確認範囲

- ゲーム進行を変えた場合：1画面と2画面、通常ゲームと問題テスト
- Canvasを変えた場合：マウス、ペン、タッチ、undo、全消去、resize
- 通信を変えた場合：切断、再接続、二重提出、古い問題の拒否
- レイアウトを変えた場合：1280×720、1024×600、320×568、実際の展示モニター
- 保存を変えた場合：同意、確認済み転記、メモ非保存、重複利用防止

最新の責務分割は [アーキテクチャ](architecture.md)、ゲーム状態の正本は [2モード仕様](two-mode-exhibition.md)、作業ツリーの検証状況は [HANDOFF](../HANDOFF.md) を参照してください。
