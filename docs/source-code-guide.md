# ソースコード案内

この文書は、数学でGOのコードを初めて読む人が「どこから読み、何を変更すればよいか」を探すための案内です。生成物の`game/dist`、依存の`game/node_modules`、`.venv*`、モデルの`.model-cache`は読み始める場所ではありません。

## 最初に読む順番

1. `README.md`でゲームの目的と利用者向け機能を確認する。
2. `docs/architecture.md`でブラウザー、FastAPI、認識worker、保存先の関係を確認する。
3. ゲーム進行を読む場合は `game/src/exhibition/Session.ts` から始める。
4. 画面表示は `game/src/exhibition/view.ts` と `presentation.ts`、全体の接続は `App.ts` を読む。
5. APIは `backend/app/main.py` から、実処理は同じフォルダーの責務別モジュールへ進む。
6. 変更後は近くの`.test.ts`または`tests/test_*.py`を先に確認する。

## ディレクトリの役割

| 場所 | 役割 | 通常変更する場面 |
|---|---|---|
| `game/src/exhibition` | ゲーム状態、画面文言、表示、ブラウザー全体の調停 | ゲームルール・画面・操作変更 |
| `game/src/dual-screen` | モニターと液タブのメッセージ、接続、再送 | 2画面同期の変更 |
| `game/src/ui` | 手書きCanvas、数式表示、音 | 入力・描画・効果音変更 |
| `game/src/api` | ブラウザーからFastAPIを呼ぶ境界 | APIのURL・応答変更 |
| `backend/app` | HTTP API、問題、保存、認識workerの管理 | サーバー機能変更 |
| `backend/model_workers` | TexTeller／任意UniMERNetを別環境で動かすプロセス | モデル入出力変更 |
| `backend/training` | レビュー済みデータと追加学習の安全管理 | 学習手順変更 |
| `config` | 正本の問題バンク、schema、元問題、データパス | 問題・保存先変更 |
| `scripts` | 導入、起動、検証、配布、学習の入口 | 運用手順変更 |
| `benchmark` | 公開HWEとモデル比較 | 評価方法変更 |
| `frontend` | スタッフ向け評価画面と問題編集画面 | 管理・評価機能変更 |
| `tests` | PythonのAPI・保存・worker・運用回帰 | Python側変更と同時 |

## ゲーム側の主要ファイル

| ファイル | 読む内容 |
|---|---|
| `Session.ts` | phase、残り時間、残機、正解数、遷移条件。ゲームルールの正本 |
| `App.ts` | Session、画面、API、2画面通信、Canvasを接続する調停役。新しい計算規則はここへ増やさず、責務別モジュールへ置く |
| `view.ts` | 画面のHTML構造。表示条件や状態計算は置かない |
| `presentation.ts` | Snapshotから表示値を作る純粋な処理 |
| `catalog.ts` | 難易度、検索、選択問題の整理 |
| `activity.ts` | 認識中・確認中などの活動表示と時計状態 |
| `app.css` | 共通、ゲーム、結果、低い画面、縦画面の順に配置したスタイル |
| `HandwritingPad.ts` | ペン入力、undo、crop、筆跡snapshot |
| `messages.ts` | 2画面プロトコルの型と受信値検証 |

`App.ts`はブラウザー全体の組み立てを担うため大きいファイルです。上から「サービスと状態」「2画面同期」「設定画面」「描画」「状態遷移と認識」「受信イベント」「UIイベント」「初期読込」の順に区切っています。

## Python側の主要ファイル

| ファイル | 読む内容 |
|---|---|
| `backend/app/main.py` | URLと責務別関数を結ぶAPI境界 |
| `game_questions.py` | 問題読込、schema、正答判定、レビュー更新 |
| `pairing.py` | 同一PCのDisplay／Controller WebSocket中継 |
| `recognizers/registry.py` | 利用可能モデルと環境の登録。通常ゲームの先読み対象は環境変数でTexTellerだけを指定 |
| `recognizers/worker.py` | workerの起動、期限、要求ID、異常後の破棄 |
| `custom_samples.py` | 同意・確認済み学習候補の保存 |
| `backend/training/registry.py` | 学習候補の人手レビュー、split、使用台帳 |

`main.py`には計算やファイル操作を直接増やさず、API固有の入力検証と応答組み立てだけを置きます。共有処理は責務別モジュールへ移し、そのモジュールを直接テストします。

## 変更目的から探す

| 変更したいこと | 最初に見る場所 | 一緒に確認するもの |
|---|---|---|
| 問題・正答・解説 | `config/game_questions.json` | schema、問題作成ガイド、問題テスト |
| 時間・残機・進行 | `Session.ts` | `Session.test.ts`、`timing.ts` |
| 画面文言・要素 | `view.ts` / `presentation.ts` | `view.test.ts`、Computer Use |
| レスポンシブ表示 | `app.css` | 1280×720、1024×600、縦画面 |
| 2画面通信 | `messages.ts` / `DualScreenChannel.ts` | 両方のテスト、切断・再接続 |
| 認識API | `RecognitionClient.ts` / `main.py` | APIテスト、worker期限 |
| モデル準備 | `registry.py` / `worker.py` | GPU・CPU両方、ready endpoint |
| 学習候補保存 | `custom_samples.py` | 同意、隔離データルート、重複防止 |
| 導入・配布 | `scripts/setup_festival.py` / `package_release.ps1` | clean clone、配布ZIPテスト、第三者ライセンス |

## 読みやすさを保つ規則

- 状態変更は`Session`、表示値は純粋関数、DOM操作は`App`／`view`、通信は`dual-screen`へ分ける。
- 同じ意味の定数・文言・問題データを複数ファイルへ複製しない。
- 長い処理は「何をするか」が名前で分かる関数へ分け、実装の説明ではなく判断理由をコメントする。
- 生成物や依存コードを直接編集しない。正本を変更して再生成する。
- 保存・学習・問題更新のテストでは、実データではなく一時コピーと隔離環境変数を使用する。
- 機能変更と無関係な一括整形を同じコミットへ混ぜない。

## 基本検証

```powershell
.\.venv\Scripts\python.exe -m pytest -q
pnpm --dir game test
pnpm --dir game build
.\.venv\Scripts\python.exe scripts/check_docs.py
git diff --check
```

画面変更は自動テストだけで完了にせず、実際に起動したWeb画面で1画面、Display、Controller、代表的な横・縦サイズを確認します。
