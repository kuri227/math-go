# 数学でGO 2画面ゲーム構成仕様

更新日: 2026-10-08

## 1. 目的

文化祭の最終展示では、問題を見る画面と、手書きする画面の役割を物理的に分ける。

- モニター: 問題、制限時間、スコア、演出、判定結果、解説を観客とプレイヤーへ見せる。
- 液タブ: 手書きCanvas、1画戻す、全消去、わからない、提出、認識違いの書き直し、次への操作をプレイヤーの手元へ置く。

画面を単純に複製するのではなく、見るための舞台と、触るための操作盤として情報量と責務を分ける。

## 2. 初期前提

- モニターと液タブは、同じWindows PCへ接続した拡張ディスプレイとして扱う。
- 2画面は同じEdgeまたはChromeの別ウィンドウで開き、同じOriginを使用する。
- 認識BackendとTexTellerは同じPCで動かす。
- 2画面間は小さな状態JSONだけを同期する。PNGやstroke列はタブ間へ流さない。
- 1画面版は削除せず、開発時・故障時のフォールバックとして残す。

異なるPCやタブレット端末をLAN越しに使う構成は、初期実装の対象外とする。その場合はBroadcastChannelではなくBackend WebSocketが必要になる。

## 3. 画面の責務

### 3.1 モニター側: Display

表示するもの:

- タイトル、難易度、コース選択
- モデル準備状態とゲーム開始
- 問題文とKaTeX数式
- ROUND、カテゴリ、スコア、連続、残機、残り時間
- 問題拡大、警告、正誤演出
- 認識した回答、正答、解説
- 終了結果と再挑戦
- 液タブの接続状態

表示しないもの:

- 手書きCanvas
- 1画戻す、全消去、提出などの回答操作
- モデル名、推論時間、内部技術の説明

### 3.2 液タブ側: Controller

表示するもの:

- 接続中のゲーム名とROUND
- 大きな手書きCanvas
- 1画戻す、全消去、わからない、回答を提出
- 認識・判定中の待機状態
- 認識違いの書き直し
- 結果確認後の「次の問題へ」
- モニターとの接続状態

表示しないもの:

- 問題本文と模範解答の常時表示
- スコアや詳細な演出
- 認識モデル、レイテンシ、内部状態

液タブは操作面なので、主要操作は44px以上とし、ペン先で誤操作しない間隔を確保する。提出だけを朱色の主要操作にする。

## 4. ゲームの流れ

1. モニター側でタイトル画面を開く。
2. 「液タブ画面を開く」をユーザー操作で実行し、Controllerウィンドウを生成する。
3. Controllerを液タブへ移動し、両画面を全画面にする。
4. モニター側で難易度とコースを選ぶ。
5. DisplayとControllerの両方が準備完了になったら開始する。
6. Displayが問題とタイマーを表示し、ControllerがCanvasを有効化する。
7. 提出時、Controllerは最初に `submission-started` を送り、Displayは時計を止める。
8. ControllerがCanvasをcropしたPNGにして認識APIへ直接送る。
9. 認識結果をDisplayへ送り、Display側のゲーム進行が判定APIを呼ぶ。
10. Displayで正誤・正答・解説を表示し、Controllerで書き直しまたは次への操作を受け付ける。
11. 次問、終了、再挑戦を両画面で同期する。

## 5. 同期方式

初期実装はブラウザー標準の `BroadcastChannel` を使用する。

```text
Display window                         Controller window

GameCoordinator                       HandwritingPad
GameSession                           Pointer Events
Timer / score / question              PNG生成・認識API呼出
      │                                      │
      └──── BroadcastChannel (JSON) ─────────┘
                         │
                         └── FastAPI / TexTeller
```

チャンネル名にはランダムな `sessionId` とプロトコル版を含める。

```text
math-go:v1:<sessionId>
```

最低限のメッセージ:

| 方向 | type | 用途 |
|---|---|---|
| 双方向 | `hello` / `heartbeat` | 接続確認、役割、プロトコル版 |
| Display → Controller | `round-ready` | round、入力可否、状態を通知 |
| Controller → Display | `submission-started` | 時計停止と二重送信防止 |
| Controller → Display | `recognition-completed` | raw/normalized LaTeXとrequest ID |
| Controller → Display | `recognition-failed` | 回復可能なエラーを通知 |
| Controller → Display | `skip-requested` | わからない操作 |
| Controller → Display | `retry-requested` | 同じ問題へ戻る |
| Controller → Display | `advance-requested` | 次問へ進む |
| Display → Controller | `game-state` | writing/recognizing/result/finished |
| Display → Controller | `session-ended` | 終了またはタイトル復帰 |

メッセージには `sessionId`、`protocolVersion`、単調増加する `sequence` を付け、古い状態の上書きを防ぐ。

## 6. 状態の正本

ゲーム進行の正本はDisplay側の `GameCoordinator` とする。

- 問題選択、GameSession、得点、残機、正誤確定、タイマーはDisplayが所有する。
- Canvas、stroke、undo履歴、PNG生成はControllerだけが所有する。
- Controllerは正誤を独自判断せず、認識結果と操作要求を送る。
- Displayは同じ操作を重複処理しないよう、状態とsequenceを検査する。

ブラウザー更新からの完全復元は最初の2画面版では行わない。片方が切断した場合は時計を止め、「接続が切れました。画面を再接続してください」と両画面へ表示する。復元機構を実装するまでは、再接続できない場合にタイトルへ安全に戻す。

## 7. 性能方針

- PNGはControllerからFastAPIへ直接送信し、BroadcastChannelでbase64化しない。
- Displayへ送るのはLaTeX、request ID、状態、時刻など小さなJSONだけにする。
- TexTellerはタイトル表示時から1回だけ先読みする。
- PhaserはDisplayだけで読み込み、Controllerの描画負荷をCanvas入力へ集中させる。
- タイマーは加算減算ではなく終了予定時刻から表示値を計算し、メッセージ遅延でずれないようにする。
- 2画面化後も、提出開始からDisplayの判定演出までのP95を2秒以内に保つ。

## 8. エラーと回復

- Controller未接続: 開始ボタンを無効にし、液タブ画面を開く操作を示す。
- Display切断: Controllerの提出を無効にし、入力済みstrokeはその場で保持する。
- Controller切断: Displayの時計を停止し、再接続待ちにする。
- 認識失敗: Canvasを消さず、Controllerで再送または書き直しを選べる。
- プロトコル版不一致: ゲームを開始せず、両画面の再読込を促す。
- 複数Controller接続: 最初に確立した1台だけを有効にし、追加接続は明示的に拒否する。

## 9. 実装の進め方

### Phase 1: 責務の抽出

- `main.ts` からゲーム進行を `GameCoordinator` へ抽出する。
- DOM操作をDisplay用PresenterとController用Presenterへ分ける。
- この段階では現行1画面の見た目と挙動を変えず、既存テストを通す。

### Phase 2: 同期基盤

- 型付きメッセージと `DualScreenChannel` を実装する。
- in-memory transportで順序、重複、切断を単体テストする。
- `BroadcastChannel` transportを追加する。

### Phase 3: 2画面UI

- DisplayとControllerのrouteまたはVite entryを追加する。
- ControllerへHandwritingPadと回答操作を移す。
- Displayから回答操作を除き、問題・演出・結果を拡大する。
- 現行1画面routeをフォールバックとして残す。

### Phase 4: 実機検証

- モニターと液タブで、ペン入力、全画面、フォーカス移動、切断復旧を試す。
- 30分以上の連続プレイと50回以上の提出を測る。
- 提出E2EのP50/P95、接続切断、二重送信、タイマーずれを記録する。

## 10. 受入条件

1. 問題とCanvasが別ウィンドウへ表示される。
2. Displayには回答操作がなく、Controllerには問題本文が常時表示されない。
3. Controllerの提出でDisplayの時計が即時停止する。
4. 認識結果、正誤、得点、残機、次問が両画面で矛盾しない。
5. 同じ回答が二重に確定されない。
6. 片方の切断時にゲームが進み続けず、復旧方法が表示される。
7. PNGはタブ間転送されず、現行のcrop済みBlob送信を維持する。
8. 1画面版が引き続き動作する。
9. 1280×720以上のモニターと、想定液タブ解像度でスクロールなしに主要要素が収まる。
10. 物理液タブでペン入力、undo、clear、submit、retry、advanceが動作する。

## 11. 実装前に確認する項目

- 液タブの機種、解像度、OS上での拡大率
- モニターの解像度と配置方向
- 同じPCの拡張ディスプレイで確定か、LAN上の別端末も対象か
- 難易度・コース選択をスタッフがモニターで行うか、液タブにも開始操作が必要か
- 結果確認後の「次へ」をプレイヤーが液タブで押すか、時間で自動進行するか
- ブラウザーをEdgeへ固定できるか

未確定でも、初期実装は「同一PC・同一Edge・Displayが進行の正本・Controllerが入力担当・次へはController操作」で開始できる。
