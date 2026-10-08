# 数学でGO コーディング引き継ぎ書

- 更新日: 2026-10-08
- 対象: 次にこのリポジトリを担当するコーディングエージェント／開発者
- 現在のブランチ: `main`
- Remote: `https://github.com/kuri227/math-go.git`
- 現在の先頭コミット: `a247505 feat: add Windows pre-release packaging and festival setup`

## この文書の読み方

この文書は、元のチャット履歴を読めない担当者が単独で再開できることを目的としている。

- まず作業する場合: 1、7、8、12、13、20、23、24を読む。
- 現行処理を追う場合: 14〜18を読む。
- 起動・テスト・障害対応: 10、11、22、25を読む。
- データやcommitの安全確認: 5、19〜21、26を読む。
- モデル選定の根拠: 6を読み、数値の正本は参照先reportで再確認する。

引き継ぎ時点の状態:

| 項目 | 状態 | 補足 |
|---|---|---|
| dual-model PoC | 実装・公開HWE評価済み | Test B本評価は未完了 |
| 認識・判定API | 実装済み | ゲーム用v1 APIとPoC互換APIを維持 |
| 現行1画面ゲーム | 実装・回帰テスト済み | 展示用の継続調整中 |
| 問題バンク | JSON 50問、編集画面あり | 数学内容の最終レビューは必要 |
| Windows配布 | Pre-release生成手順あり | 最終展示版Releaseは未作成 |
| モニター／液タブ2画面版 | Phase 1〜3の初期実装済み | 実機長時間試験は未完了 |
| 作業ツリー | 未コミット変更あり | reset／一括削除禁止 |

## 1. 最初に守ること

1. 作業ツリーには、最終展示UI、問題バンク、問題編集画面、テスト、設計書に関する未コミット変更が多数ある。`git reset --hard`、一括checkout、未追跡ファイルの削除を行わない。
2. `git status --short` と差分を読んでから変更する。既存の評価結果、収集データ、モデル環境、Release資産を作り直さない。
3. 個人の筆跡、実名、端末固有パス、秘密情報、モデル重み、公開データセット本体をcommitしない。
4. `data/custom/`、`.venv*`、`.model-cache/`、`third_party/`、`game/dist/`、`release-build/` は原則Git管理外である。
5. 二画面版は初期実装済みである。現行1画面版を壊さず、実機試験と回復処理を段階的に固める。

## 2. プロジェクトの目的

「数学でGO」は、文化祭の来場者が画面に出た数学問題へ手書きで回答し、HMERモデルがLaTeXへ変換して判定するWebゲームである。

このリポジトリには、次の3層が共存している。

- HMER PoCとモデル比較: TexTellerとUniMERNetを公開HWEおよび独自Web入力で比較する。
- 認識サービス: 他のプログラムから画像を渡し、LaTeXと判定結果を受け取れるFastAPI。
- 展示ゲーム: Phaser + TypeScript + Vite、HTML Canvas、KaTeXで作る文化祭向けゲーム。

最終展示では、問題や演出をモニター、手書きと回答操作を液タブへ分ける方針に変わった。詳細は後述する。

## 3. 現在の構成

```text
game/                         Phaser + TypeScript + Viteのゲーム
frontend/                     PoC評価画面と問題登録画面
backend/app/                  FastAPI、問題配信、正規化、判定
backend/model_workers/        モデル別の常駐ワーカー
benchmark/                    公開HWE・独自入力の評価と集計
config/game_questions.json    展示問題の唯一の正本
config/game_questions.schema.json
data/custom/                  独自筆跡データ。Git対象外
results/                      評価結果
reports/                      性能・UX・レスポンシブ検証
docs/                         仕様、ADR、運用資料
scripts/                      セットアップ、起動、Release、検証
```

主要技術:

- Game: Phaser 4.2.1、TypeScript 7、Vite 8
- Handwriting: Phaserと分離したHTML Canvas + Pointer Events
- Math rendering: KaTeX 0.19
- Backend: FastAPI
- Default game recognizer: TexTeller
- Comparison recognizers: TexTeller、UniMERNet
- Package manager: pnpm 11
- Deployment: Vite buildをFastAPIから同一Originで配信

TexTellerとUniMERNetは要求するTransformers版が異なるため、`.venv-texteller` と `.venv-unimernet` を分離する。Backendとテストは `.venv` を使う。

## 4. 実装済みの主な機能

### ゲーム

- 7段階の難易度選択。
- 1: じっくり練習（5問、時間無制限、残機3）。
- 2: 20秒チャレンジ（7問、1問20秒、残機3、時間ボーナス）。
- 3: 30問マラソン（30問、時間無制限、残機5）。
- 問題、手書き、認識、正誤、正答、解説、書き直し、次問、終了結果。
- 1画戻す、全消去、わからない、提出。
- モデル先読み。準備中は開始・提出を理由付きで無効化。
- 認識・判定中のゲーム時計停止。
- 残り時間に応じた問題拡大と警告音。
- 定積分、極限、行列を含む問題は `question_latex` をKaTeXで構造表示。
- 認識文字列がKaTeX構文エラーでも、赤い数式エラーを正誤色と混同させないフォールバック表示。
- デスクトップ、ノートPC、タブレット、スマートフォン縦横を考慮した1画面レスポンシブ設計。

### 問題バンク

- `config/game_questions.json` に50問。
- `config/game_questions.schema.json` とBackend検証。
- `GET /api/v1/questions`、判定、解説API。
- `/questions/editor` のローカル問題登録画面。
- `POST /api/v1/admin/questions` で検証後にJSONへ追記。
- Backendは都度JSONを読み、サーバー再起動なしで追加を反映。
- 問題追加方法は `docs/question-authoring-guide.md`。

### PoC・評価

- 同一crop済みPNGをTexTellerとUniMERNetへ渡す比較画面 `/evaluation`。
- PNG、stroke JSON、Ground Truth、匿名メタデータの収集。
- UniMER-Test HWE 6,332件の両モデル評価。
- 公開評価、独自評価、環境情報、失敗例、集計レポート生成。

### 配布

- `scripts/package_release.ps1` でWindows用Pre-release ZIPを生成。
- `scripts/setup_festival.ps1` と `scripts/start_festival.ps1` で展示PCを準備・起動。
- GitやNode.jsを展示PCに要求しないRelease運用も可能。

## 5. 問題データの方針

問題の正本は `config/game_questions.json` とする。cloneまたはReleaseを各PCへ置いて単独運用する現在の要件では、DBを使わない方が適切である。

理由:

- clone後にDB作成、接続情報、マイグレーションが不要。
- 問題変更をGit差分でレビュー・共有・復元できる。
- 問題登録画面と直接JSON編集の両方が使える。
- 展示PCへ同一問題セットを配布しやすい。

制約:

- 複数PCからの同時編集や自動同期には向かない。
- Releaseが読み取り専用の場所にあると登録画面から追記できない。
- 各PCで別々に作った問題はGitで統合する必要がある。

複数編集、承認フロー、大規模検索が必要になった時だけ問題DBを再検討する。ランキングやプレイ履歴だけ必要なら、問題JSONを維持したまま実行データ用SQLiteを追加する。ADRは `docs/adr/0002-file-based-question-bank.md`。

## 6. モデル評価の現状

公開UniMER-Test HWE 6,332件の結果:

| モデル | 正規化一致 | 失敗 | P50 | P95 | 初期化 | Peak VRAM |
|---|---:|---:|---:|---:|---:|---:|
| TexTeller | 90.92% | 0.00% | 552.1 ms | 1204.8 ms | 31610.5 ms | 1264.4 MiB |
| UniMERNet | 59.60% | 0.00% | 1083.4 ms | 2550.1 ms | 43338.9 ms | 483.6 MiB |

現PC・公開HWEではTexTellerが精度と速度で優位であり、ゲーム既定モデルもTexTellerである。UniMERNetはPeak VRAMが小さい。

ただし、最終採用判断はまだ確定扱いにしない。独自Web入力の最終Test Bは50〜100件以上、複数筆者、複数入力機器が未完了である。既存の9件・1筆者のUX標本ではTexTellerの認識APIがP50 208.9 ms、P95 362.3 ms、ブラウザーE2Eが385.9 ms、7/9正規化一致だった。モデル初期化は8.15秒だったため、ページロード時の先読みを維持する。

根拠:

- `reports/model_comparison.md`
- `reports/game_ux_validation.md`
- `results/baselines/2026-10-01-public-hwe/`

## 7. 次期方針: モニターと液タブの2画面化

### 役割

Displayウィンドウ（モニター）:

- タイトル、難易度、コース、モデル準備。
- 問題、ROUND、スコア、連続、残機、残り時間。
- 問題拡大、警告、正誤演出、認識回答、正答、解説、最終結果。
- Controller接続状態。
- Canvasや回答操作は置かない。

Controllerウィンドウ（液タブ）:

- 大きな手書きCanvas。
- 1画戻す、全消去、わからない、提出。
- 認識中、書き直し、次の問題。
- Display接続状態。
- 問題本文、詳細HUD、技術情報は常時表示しない。

### 初期同期方式

- 同じWindows PCへモニターと液タブを拡張ディスプレイとして接続する。
- 同一EdgeまたはChrome、同一Originの別ウィンドウを使う。
- 論理的には別タブだが、物理ディスプレイへ分けるため実運用は別ウィンドウにする。
- 小さな状態JSONは `BroadcastChannel` で同期する。
- PNGはControllerからFastAPIへ直接送る。base64画像やstroke列を画面間へ流さない。
- Displayの `GameCoordinator` がゲーム状態の唯一の正本。
- ControllerはCanvas、stroke、undo履歴、PNG生成だけを所有する。
- 現行1画面版はフォールバックとして残す。

別PCやLAN上のタブレットをControllerにする要件へ変わった場合、BroadcastChannelは使えない。その時点でFastAPI WebSocketとセッション管理へ切り替える。

正本仕様:

- `docs/dual-screen-game-design.md`
- `docs/adr/0003-dual-screen-game-ui.md`
- `DESIGN.md` の `Dual-screen target`

## 8. 次の実装順

一度に画面を分割せず、次の順で進める。

### Phase 0: 現状の保全

- `git status --short`、差分、テスト結果を確認する。
- 現行1画面版をブラウザーでsmoke testする。
- 現在の未コミット変更を内容単位でレビューし、ユーザーの了承を得て段階的にcommitする。

### Phase 1: ゲーム進行を抽出（初期実装済み）

- `game/src/main.ts` のゲーム進行を、DOMに依存しない `GameCoordinator` へ抽出する。
- `GameSession`、問題選択、タイマー、得点、残機、判定確定の所有者を1つにする。
- DOM更新をPresenterへ分ける。
- 見た目と挙動は変えず、既存テストを維持する。

### Phase 2: 型付き同期基盤（実装済み）

- `DualScreenMessage` のdiscriminated unionを定義する。
- `sessionId`、`protocolVersion`、単調増加 `sequence` を全メッセージに持たせる。
- transport interfaceとin-memory実装を先に作り、順序、重複、切断を単体テストする。
- その後 `BroadcastChannel` 実装を加える。

### Phase 3: DisplayとController（初期実装済み）

- Display route／Vite entryとController route／Vite entryを追加する。
- Controllerへ既存HandwritingPadと回答操作を移す。
- DisplayからCanvasと回答操作を除き、問題・演出・結果を拡大する。
- Controllerが提出した瞬間に `submission-started` を送り、Displayの時計を止める。
- 認識失敗時はCanvasを消さず、再送または書き直しを選べるようにする。
- 片方の切断時は時計と提出を停止し、回復方法を両画面へ示す。

### Phase 4: 実機試験

- 実際の液タブとモニターで解像度、OS倍率、全画面、フォーカス、ペン入力を確認する。
- 50回以上の提出、30分以上の連続プレイを行う。
- 二重提出、切断、再接続、タイマーずれ、認識失敗を意図的に試す。
- 提出からDisplay演出までP50 1秒以下、P95 2秒以下を維持する。

## 9. 未確定事項

次の実装前に、実機情報が得られれば仕様へ反映する。得られなくても、現在の既定値でPhase 1と2は開始できる。

- 液タブの機種、解像度、Windows表示倍率。
- モニターの解像度と配置方向。
- 同一PCの拡張ディスプレイで確定か、別端末も対象か。
- コース選択をスタッフがモニターで行うか、液タブにも開始操作を置くか。
- 結果後の次問を液タブで押すか、一定時間で自動進行するか。
- Edgeへ固定できるか。

現在の既定は、同一PC・同一Edge・Displayが進行の正本・Controllerが入力担当・次問はController操作である。

## 10. 起動・開発コマンド

リポジトリルートのPowerShellから実行する。

```powershell
# ゲームをbuild
.\scripts\build_game.ps1

# production相当。http://127.0.0.1:8000
.\scripts\run_server.ps1

# FastAPI 8000 + Vite 5173の開発構成
.\scripts\run_game_dev.ps1

# 展示構成
.\scripts\start_festival.ps1

# 問題JSON検証
.\.venv\Scripts\python.exe scripts\validate_game_questions.py
```

主なURL:

- `/`: 現行ゲーム。
- `/display`: モニター用Display。ここからControllerを開く。
- `/controller?session=<Displayと同じID>`: 液タブ用Controller。
- `/evaluation`: 両モデル比較とデータ収集。
- `/questions/editor`: 問題登録。
- `/docs`: FastAPI API仕様。

ポート8000が使用中なら、既存サーバーを確認して二重起動しない。現在この引き継ぎ書の作成時点で、サーバーが稼働中であることは保証しない。

## 11. テスト

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
pnpm --dir game test
pnpm --dir game build
.\.venv\Scripts\python.exe scripts\validate_game_questions.py
node --check frontend/question-editor.js
```

直近の確認結果:

- Python: 32 passed。Starlette/httpx由来のdeprecation warningが2件。
- TypeScript: 22 passed（GameCoordinatorと同期channelを含む）。
- Vite production build: 成功。
- 問題JSON: 50問、検証成功。
- 問題編集API: 一覧50件、画面200、正しい追加、無効入力422を一時環境で確認。
- タイトル画面: 1920×1080、1280×720、1024×768、768×1024、390×844、844×390、320×568でスクロールなしを確認。

Windowsの制限環境ではTestClientのsocket作成が拒否されることがある。その場合はテスト自体の失敗と決めつけず、通常のPowerShellまたは許可された実行環境で再実行する。

## 12. 既知の不足とリスク

- 二画面版は初期実装済み。物理液タブ／モニターでの30分連続稼働、50回提出、表示倍率・全画面・USB再接続の確認は未完了。
- Test Bは9件・1筆者の予備データのみ。50〜100件以上、複数人、ペン・タッチで再評価が必要。
- 一般的な数学的同値判定は未実装。現在は保守的正規化と問題別正答候補。
- 高難度の問題数、内容、正答候補は数学的レビューが必要。
- 4GB VRAMでは両モデル同時常駐を避ける。ゲームはTexTellerだけを先読みする。
- Vite buildは成功するが、Phaserを含む `createGame` chunkが500 kB警告の対象である。現状はゲーム開始時のdynamic importで初期表示から分離している。二画面版ではPhaserをDisplayだけへ読み込み、Controllerへ含めない。
- BroadcastChannel方式は別PC、異なるブラウザー製品、複数Controllerへ拡張できない。
- JSON追記は複数プロセス同時書込み向けではない。
- 会場での30分以上の連続稼働、フォーカス移動、スリープ復帰、USB再接続は未検証。

## 13. 次の担当者が最初に行う推奨作業

1. 本書、`PRODUCT.md`、`DESIGN.md`、`docs/dual-screen-game-design.md` を読む。
2. `git status --short` と全差分を確認し、既存変更を分類する。
3. 上記テストを実行してベースラインを固定する。
4. `/display` からControllerを開き、実機のモニター／液タブへ各ウィンドウを移動する。
5. 50回提出、30分連続稼働、Controller再読込、Display再読込、USB再接続を実機で試す。
6. 実測P50／P95、解像度、Windows表示倍率、残った不具合を本書へ記録する。

完了条件は、既存1画面版が動作したまま、DisplayとControllerが別ウィンドウで接続され、提出、認識、判定、正答表示、書き直し、次問、切断処理が一貫して動き、実機P95が2秒以内であることとする。

## 14. 現行1画面版の実行フロー

会話履歴を参照しなくても追跡できるよう、現在のコード上の処理順を記す。

### 14.1 ページ表示からゲーム開始まで

1. `game/src/main.ts` がDOMを取得し、`RecognitionClient`、`HandwritingPad`、`UrgencySound` を生成する。
2. 問題一覧は `GET /api/v1/questions` から取得する。失敗時に備え、Frontendには最小のfallback問題もある。
3. 同時に `POST /api/v1/models/texteller/preload` を呼び、TexTeller workerの非同期ロードを開始する。
4. 500ms間隔で `GET /api/v1/health/ready?model=texteller` を確認する。最大待機は180秒。
5. 問題とモデルの両方が準備できるまで開始ボタンを無効にし、プレイヤー向けの理由を表示する。
6. 難易度とコースを選び、開始する。このタイミングでPhaser本体をdynamic importする。
7. 選択難易度以下の問題を難しい順に選び、必要件数を超える長いコースでは同じ候補を循環する。

### 14.2 手書きから判定まで

1. Pointer Eventsでmouse、pen、touchを同じ経路から受ける。
2. 各点に `x`、`y`、`pressure`、`time`、`pointerType` を保持する。
3. Canvas表示は白背景、濃紺線、線幅5、round cap／join。
4. 提出時にstroke全体のbounding boxを求め、上下左右へ24 CSS pxのpaddingを加える。
5. crop先Canvasへ白背景と黒系の線を描き、PNG Blobを生成する。二値化はしていない。
6. `POST /api/v1/recognitions` へ、PNG、`model=texteller`、UUID request IDをmultipart送信する。
7. Backendは10 MiB制限、画像破損、PNG/JPEG/WebP形式を検査し、一時ファイルへ保存する。
8. モデル単位のasync lockで推論を直列化し、workerからLaTeXと計測値を受け取る。
9. Backendが生LaTeXと保守的な正規化LaTeXを返す。
10. Frontendは認識LaTeXを `POST /api/v1/judgements` へ送り、問題別正答候補と照合する。
11. 正誤、認識回答、代表正答、解説を結果画面へ表示する。
12. HMERの読み違いなら、確定前に「書き直す」で同じ問題へ戻れる。
13. プレイヤーが「次へ」を押した時だけ得点・残機・進行を確定する。

### 14.3 時間切れ／わからない

- 認識APIは呼ばない。
- `GET /api/v1/solutions/{question_id}` で代表正答と解説を取得する。
- 結果を確認してからプレイヤーが次へ進む。
- 時間切れ、認識中、結果確認中に問題時計を進めない。

## 15. ゲーム状態、得点、時間の詳細

### 15.1 状態

`game/src/domain/types.ts` の `GameState`:

| 状態 | 意味 |
|---|---|
| `loading` | 問題・モデル・Phaserの準備、またはコース開始直前 |
| `writing` | Canvas入力、undo、clear、skip、submitが可能 |
| `recognizing` | PNG生成、認識、判定中。入力と時計を停止 |
| `result` | 認識回答、正答、解説を確認中 |
| `finished` | 全問終了または残機0 |
| `error` | 回復手順を表示する異常状態 |

現状は `main.ts` の複数のmodule-level変数と `GameSession` が状態を分担している。二画面化前のPhase 1では、この分散を `GameCoordinator` へ集約する。特にtimer handle、`pendingSample`、`pendingForced`、bonus、flow tokenをPresenterへ持たせない。

### 15.2 得点

正解時の基本式は次のとおり。

```text
100点
+ min(正解前の連続数, 5) × 20点
+ コース固有の時間ボーナス
```

- チャレンジの時間ボーナスは、残り1秒あたり2点。
- 練習とマラソンには時間ボーナスがない。
- 誤答、時間切れ、わからないは残機を1減らし、連続数を0へ戻す。
- 残機0または最後の問題を確定すると終了する。

### 15.3 タイマーと拡大

- チャレンジは現在1問20秒。15秒案は未採用で、次回プレイテスト候補。
- 残り8秒以下が警告音の対象。
- 問題拡大は経過率の1.35乗を使い、基本最大1.6倍。
- 積分、分数、行列など背の高い式はScene側で安全上限を下げる。
- timerは終了予定時刻から残り時間を算出し、intervalの累積誤差を避ける。

二画面版ではDisplayだけがtimerを所有し、Controllerの `submission-started` 受信時点で即座に停止する。認識API完了後まで時計を動かしてはいけない。

## 16. 現行API契約

### 16.1 ゲーム向けAPI

#### `GET /api/v1/health/live`

プロセスがHTTP応答できるかだけを返す。

```json
{ "status": "ok" }
```

#### `GET /api/v1/health/ready?model=texteller`

モデル準備状態を返す。`status` は `ready`、`loading`、`unavailable`。

#### `POST /api/v1/models/{model}/preload`

指定モデルの非同期ロードを開始する。ゲームは `texteller` だけを指定する。

#### `GET /api/v1/questions`

正答を含まない公開問題を返す。

```json
{
  "id": "solve-linear",
  "instruction": "方程式を解きなさい",
  "display": "2x + 6 = 0",
  "display_latex": "2x+6=0",
  "category": "方程式",
  "difficulty": 3,
  "difficulty_label": "中学校"
}
```

#### `POST /api/v1/recognitions`

multipart fields:

- `image`: crop済みPNG。必須。
- `model`: 既定 `texteller`。
- `request_id`: 任意。FrontendはUUIDを送る。

主なresponse:

```json
{
  "request_id": "uuid",
  "model": "texteller",
  "model_variant": "3.0",
  "device": "cuda",
  "raw_latex": "y = x ^ { 2 }",
  "normalized_latex": "y=x^2",
  "timing": {
    "preprocessing_ms": 1.2,
    "queue_ms": 0.1,
    "inference_ms": 250.0,
    "total_ms": 258.0
  },
  "image": { "width": 220, "height": 96, "bytes": 4300 },
  "initialization_ms": 8150.0,
  "peak_vram_mb": 1264.4
}
```

認識worker異常はHTTP 503。不正画像は400、未対応形式は415、大きすぎる画像は413。

#### `POST /api/v1/judgements`

request:

```json
{
  "question_id": "solve-linear",
  "recognized_latex": "x=-3"
}
```

responseには `correct`、生認識、正規化後認識、代表正答、解説、`judge_method`、表示用messageが含まれる。未知IDは404。

#### `GET /api/v1/solutions/{question_id}`

時間切れ・わからない時だけ利用し、代表正答と解説を返す。未知IDは404。

#### `POST /api/v1/admin/questions`

問題編集画面用。ID、問題、LaTeX、指示、正答配列、解説、難易度、カテゴリをJSONで送る。成功201、ID重複409、内容不正400またはPydanticの422。

### 16.2 PoC互換API

- `GET /health`
- `GET /models`
- `POST /models/preload`
- `POST /recognize`
- `POST /recognize/compare`
- `POST /samples`

これらは評価画面と過去の検証資産が使う。二画面化のために削除しない。`/recognize/compare` は1つの一時画像パスを両モデルへ順番に渡し、公平な入力条件を保つ。

## 17. LaTeX正規化と正答判定

正答判定は数学的同値判定ではない。次の表示上の差だけを保守的に吸収する。

- 外側の `\[...\]`、`\(...\)`、`$$...$$`、`$...$` を1組除去。
- `\left`、`\right` を除去。
- `\dfrac`、`\tfrac` を `\frac` へ統一。
- 数式用spacing commandと通常空白を除去。
- `x^{2}` と `x^2` のような単一文字script groupを統一。
- 式全体を包むだけの外側波括弧を除去。
- `\cos x` のcontrol-word終端空白は意味があるため保持し、`\cosx` へ壊さない。

`x(x+1)` と `x^2+x`、`1/2` と `\frac{1}{2}`、約分前後などは、自動では同一にしない。許容する場合は問題JSONの `answer` 配列へ明示的に両方登録する。SymPy等を追加する場合も、HMER文字認識精度と数学的同値性を同じ指標へ混ぜない。

## 18. 重要ファイルの責務

### Frontend game

| ファイル | 現在の責務 | 次期変更時の注意 |
|---|---|---|
| `game/src/main.ts` | DOM配線、モデル準備、問題選択、timer、提出、判定、画面切替 | 最大の分割対象。直接2画面分岐を足し続けない |
| `game/src/domain/GameSession.ts` | 問題index、得点、残機、streak、確定済み結果 | DOMや通信を入れない |
| `game/src/domain/courses.ts` | 3コースの問題数、時間、残機、bonus | UI文言とルールを同じ定義から使う |
| `game/src/domain/difficulties.ts` | 7段階のラベルと説明 | ID 1〜7を問題JSONと一致させる |
| `game/src/domain/questionSelection.ts` | 難易度以下の選択と循環 | 現状は難しい順で、randomではない |
| `game/src/domain/timing.ts` | 20秒、警告開始、問題拡大式 | 実測なしに値だけ変えない |
| `game/src/api/RecognitionClient.ts` | preload、ready polling、認識、問題、判定、解説 | Controller側で再利用する |
| `game/src/ui/HandwritingPad.ts` | Pointer Events、stroke、undo、crop PNG | Controller側へ移し、Phaserへ依存させない |
| `game/src/ui/renderMath.ts` | KaTeX表示と安全なfallback | KaTeXの赤いerror表示を正誤色に使わない |
| `game/src/ui/UrgencySound.ts` | 警告音 | Display側のtimerと同じ所有者へ置く |
| `game/src/game/PlayScene.ts` | 問題舞台、HUD、拡大、演出 | 二画面版ではDisplay専用 |
| `game/index.html` | 現行1画面のDOM構造 | fallbackとして残す |

### Backend

| ファイル | 責務 |
|---|---|
| `backend/app/main.py` | route、アップロード検証、一時ファイル、推論lock、API timing |
| `backend/app/schemas.py` | Pydantic request／response契約 |
| `backend/app/game_questions.py` | JSON読込、検証、追記、公開問題、判定、解説 |
| `backend/app/latex.py` | ゲームと評価で共有する保守的LaTeX正規化 |
| `backend/app/custom_samples.py` | 独自Web入力の保存とmanifest追記 |
| `backend/app/recognizers/registry.py` | モデル名から独立workerを解決、先読み |
| `backend/app/recognizers/worker.py` | JSON Linesでworker processと通信 |
| `backend/model_workers/*` | 各モデル固有import、ロード、推論 |

### 設計と証拠

| ファイル | 用途 |
|---|---|
| `PRODUCT.md` | 製品原則と現在／次期scope |
| `DESIGN.md` | 視覚設計とDisplay／Controllerの役割 |
| `docs/final-exhibition-game-spec.md` | 最終展示の要求と採用判断 |
| `docs/dual-screen-game-design.md` | 二画面同期の正本仕様 |
| `docs/question-authoring-guide.md` | 問題追加方法 |
| `reports/model_comparison.md` | 公開HWEとモデル比較の根拠 |
| `reports/game_ux_validation.md` | 提出UXの実測 |
| `reports/responsive_layout_validation.md` | 現行1画面のviewport検証 |

## 19. データと生成物の扱い

### Gitへ含める

- ソースコード、テスト、設計書、JSON Schema。
- レビュー済みの展示問題JSON。
- 個人筆跡を含まない集計レポートと再現手順。
- `.gitkeep` 等の空ディレクトリ保持ファイル。

### Gitへ含めない

- `.venv*`、model cache、モデル重み、cloneした公式モデルコード。
- UniMER-Test本体とdownload ZIP。
- `data/custom/` のPNG、stroke、writer metadata。
- 実行log、一時ファイル、build成果物、Release ZIP。
- 端末固有パス、実名、学校内だけの秘密情報、token、credential。

### 問題JSONの書込み安全性

Backend内ではprocess内lockを使い、一時ファイルへJSONを書いてから置換する。単一サーバープロセスでの登録を想定する。複数uvicorn workerや複数PCから同じ共有ファイルへ同時追記する設計ではない。

## 20. 現在の未コミット作業の内訳

引き継ぎ時点の作業ツリーはcleanではない。大別すると次の変更が同居している。

### 既存ファイルの変更

- 製品・設計: `.impeccable/design.json`、`PRODUCT.md`、`DESIGN.md`、`README.md`。
- Backend: 問題JSON化、管理API、LaTeX正規化、schema、test。
- Game: title／course UI、難易度、30問マラソン、問題構造表示、結果表示、responsive、音、timer。
- Docs／reports: 展示仕様、漢字でGO観察、UX検証、architecture。

### 新規ファイル

- `config/game_questions.json`、Schema。
- 問題追加ガイド、file-based ADR、dual-screen仕様とADR、本引き継ぎ書。
- 問題登録画面3ファイル。
- course、difficulty、selection、timing、UI helperとtest。
- responsive validator、問題validator、Backend test。

これらは互いに関連しており、未追跡ファイルを除いた状態で既存変更だけcommitすると動かなくなる可能性がある。commitする場合は、少なくとも次の単位へ内容を整理し、各段階でテストする。

1. 問題JSON、loader、API、schema、Backend test、authoring guide。
2. ゲームdomain分割、コース／難易度／timer test。
3. ゲームUI、responsive、KaTeX表示、UX report。
4. 二画面仕様、ADR、architecture、引き継ぎ書。

commit前に `git diff --check`、秘密情報scan、全テストを再実行する。ユーザーが明示的に求めない限り、履歴を書き換えない。

## 21. 既存コミットの段階

過去の履歴は、PoCから展示配布まで段階的に残してある。

```text
82a714e feat: build dual-model HMER proof of concept
89f8e53 test: add reproducible model evaluation and baselines
99eefbb feat: expose versioned recognition and judgement API
98daf83 feat: implement Phaser handwriting math game
ce20eba docs: capture culture festival game UX and validation
a247505 feat: add Windows pre-release packaging and festival setup
```

次のcommitを作る場合も、「問題バンク」「ゲームUI」「二画面設計」のように復元可能な意味単位を維持する。

## 22. モデルプロセスと環境変数

主要環境変数:

| 変数 | 役割 |
|---|---|
| `TEXTELLER_DEVICE` | `auto`、`cuda`、`cpu` |
| `TEXTELLER_VARIANT` | 既定 `3.0` |
| `TEXTELLER_MODEL_DIR` | ローカルmodel cacheの上書き |
| `TEXTELLER_USE_ONNX` | `1`ならONNX経路。既定0 |
| `UNIMERNET_DEVICE` | `auto`、`cuda`、`cpu` |
| `UNIMERNET_VARIANT` | 既定 `tiny` |
| `UNIMERNET_REPO` | 公式repoのローカルpath |
| `HMER_EAGER_MODELS` | server startup時に先読みするモデル名のcomma区切り |
| `HMER_DATA_ROOT` | dataset／resultsの基準root上書き |

4GB VRAM環境では、ゲーム運用中に両モデルを同時常駐させない。`start_festival.ps1` は `HMER_EAGER_MODELS=texteller` を設定する。比較画面は必要時に順番に準備する。

workerは標準出力をJSON Lines protocolとして使う。モデルlibraryの通常logと区別するためprotocol prefixを持つ。workerを直接Web routeへimportし、同じPython環境に両モデル依存を混在させてはいけない。

## 23. 二画面実装の配置

2画面固有処理は次の配置へ分離した。現行1画面の `main.ts` へwindow判定を追加しない。

```text
game/src/application/GameCoordinator.ts
game/src/application/GameCoordinator.test.ts
game/src/dual-screen/messages.ts
game/src/dual-screen/Transport.ts
game/src/dual-screen/InMemoryTransport.ts
game/src/dual-screen/BroadcastChannelTransport.ts
game/src/dual-screen/DualScreenChannel.ts
game/src/entries/display.ts
game/src/entries/controller.ts
game/src/dual-screen.css
game/display.html
game/controller.html
```

### Coordinatorが受け取る入力

- course／difficulty選択。
- start、submit started、recognition completed、recognition failed。
- skip、retry、advance、return to title。
- timer tick／timeout。
- Controller接続／切断。

### Coordinatorが発行する出力

- 現在のphase、question、progress、HUD、timer。
- Canvas入力可否。
- result、correctness、recognized LaTeX、expected LaTeX、explanation。
- retry／advance可否。
- errorとrecovery action。

Presenterはこの出力を描画するだけにし、scoreやlivesを独自計算しない。Transportもゲームルールを知らない。

### 同期で必須の防御

- `sessionId` が違うmessageを無視する。
- `protocolVersion` 不一致なら開始を拒否する。
- `sequence` が最後に処理した値以下なら重複／古いmessageとして無視する。
- submitは `requestId` でも重複排除する。
- `writing` 以外のsubmitを拒否する。
- `result` 以外のadvance／retryを拒否する。
- heartbeat timeoutでtimerを止める。
- window再読込後に古いresultを新しいroundへ適用しない。

### 実装済み同期testと次の追加候補

1. [x] hello後に両roleがreadyになる。
2. [x] 古いsequenceを無視する。
3. [x] 同じrequest IDの二重submitを拒否する。
4. [x] submit開始でtimerが認識完了前に停止する。
5. [x] heartbeat timeoutを切断として通知する。
6. [ ] Controller切断中のDisplay timer停止をFake Timerで直接検証する。
7. [ ] 認識失敗後のstroke保持をCanvas統合testで検証する。
8. [ ] session終了後の遅延messageを統合testで検証する。

## 24. 二画面版の画面別受入チェック

### Display／モニター

- [ ] 1280×720以上で問題、HUD、タイマーがスクロールなしに見える。
- [ ] 数式は定積分の上下限、極限の添字、行列構造をKaTeXで表示する。
- [x] Canvas、undo、clear、submitを表示しない。
- [x] Controller未接続時に開始できず、理由が分かる。
- [x] 提出を受けた瞬間に時計が止まる。
- [x] 正誤を色だけでなく文言・演出でも伝える。
- [x] 認識回答、正答、解説をDisplayへ表示する。
- [x] 終了時にscore、正解数、残機、再挑戦を表示する。

### Controller／液タブ

- [ ] 想定解像度と表示倍率でCanvasを最大化し、縦横スクロールを発生させない。
- [ ] ペン接近時もカーソル位置が見える。
- [x] touch、mouse、penが同じPointer Events経路を使う。
- [x] undo、clear、skip、submitのhit targetが44px以上。
- [x] submitだけを主要な朱色操作として強調する。
- [x] 認識中に二重提出できない。
- [x] 認識失敗・認識中切断時にstrokeを消さず再送できる。
- [x] 結果確認後にretryまたはadvanceを選べる。
- [x] Display切断中に提出できず、回復案内が見える。

### End-to-End

- [ ] 同一PNGが1回だけ認識される。
- [x] request IDを両画面のメッセージで追跡できる。
- [x] 認識と判定の結果をDisplayのCoordinatorで一元管理する。
- [ ] 50回提出して状態ずれ、二重得点、二重減点がない。
- [ ] 30分連続でworker、Canvas、object URL、event listenerのリーク兆候がない。
- [ ] P50 1秒以下、P95 2秒以下。
- [x] 現行1画面fallbackも同じAPIでbuild・回帰テストできる。

## 25. よくある障害の切り分け

### `Errno 10048`／port 8000をbindできない

既にサーバーが動いている。新しいserverを重ねて起動しない。既存processと `http://127.0.0.1:8000/api/v1/health/live` を確認し、不要なprocessだけを特定して停止する。

### `ERR_CONNECTION_REFUSED`

Frontendが開いていてもFastAPIが停止している、またはVite proxy先が起動していない。server process、port、livenessを確認する。

### module scriptが`text/plain`

古い／不完全なVite build、または静的配信routeの競合を疑う。`pnpm --dir game build` 後にserverを再起動し、生成HTMLが参照するasset pathとresponse Content-Typeを確認する。

### モデル準備中から進まない

`/api/v1/health/ready?model=texteller` の `status` と `detail`、worker stderr、環境のmodel cacheとdevice指定を確認する。最初のロードは数秒〜数十秒かかる。UIだけを強制的にreadyへしてはいけない。

### 正答なのに認識表示が赤い／逆に見える

KaTeX parse failureの赤と正誤色を混同していないか、`raw_latex` と `normalized_latex`、judgement responseを別々に確認する。正誤はFrontendの色ではなくBackendの `correct` を正とする。

### 問題追加後に見えない

`config/game_questions.json` に実際に追記されたか、ID重複がないか、`GET /api/v1/questions` の件数を確認する。ゲーム開始時に一覧を取り直す。読み取り専用フォルダでは管理APIから保存できない。

## 26. リリース前の安全チェック

1. `git status --short` で対象を確認する。
2. 端末固有path、実名、mail address、token、keyらしい文字列を検索する。
3. `data/custom/` の筆跡がstagingされていないことを確認する。
4. model重み、dataset、venv、log、Release ZIPがstagingされていないことを確認する。
5. 問題JSON内の固有名詞と解説を人手確認する。
6. Python、TypeScript、build、問題validatorを実行する。
7. `git diff --check` を実行する。
8. build済みの配布物は `scripts/test_release.ps1` で検査する。
9. ReleaseにはSHA-256を付け、Pre-releaseであることを明記する。

## 27. 次回引き継ぎ時に更新する項目

次の担当者は作業終了時に本書を上書きするか、新しい日付の引き継ぎ書を作り、最低限次を記録する。

- commit SHA、branch、未コミット変更。
- 実装したphaseと、未実装のphase。
- API／protocol version変更。
- Display／ControllerのURLと起動方法。
- 使用した液タブとモニターの機種、解像度、表示倍率。
- Python／TypeScript test件数と失敗・warning。
- P50、P95、最大値、モデル初期化時間。
- 連続稼働時間、提出回数、切断試験結果。
- 新しい既知問題、暫定回避策、ユーザー判断が必要な点。
- 個人データや秘密情報がcommit対象にないことの確認結果。
