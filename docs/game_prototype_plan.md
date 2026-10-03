# 数学でGO 最小ゲームプロトタイプ計画

> 状態：この初期計画は実装済み。現在は正答判定、スコア、残機、コース選択、30秒タイマーまで拡張している。現行仕様は `docs/kanji-go-inspired-game-spec.md`、実測は `reports/game_ux_validation.md` を参照する。本書は技術選定時の判断記録として保持する。

## 目的

現在の手書き数式認識PoCを、実際のWebゲーム画面から呼び出したときの操作感と応答速度を確認する。これは当初の最小スコープであり、後続実装では正誤判定、得点、残機、制限時間へ拡張した。

## 最小機能

1. 画面上部に問題文を1問表示する。
2. Canvasへマウス、ペン、タッチで回答を書く。
3. 「1画戻す」「書き直す」を使用できる。
4. 「回答を提出」を押すと、回答部分だけをcropしたPNGを認識APIへ送る。
5. 認識中の状態を明示する。
6. 認識したLaTeX文字列、レンダリング結果、処理時間を表示する。
7. 「次の問題」でCanvasと結果を消して次へ進む。

正解・不正解は表示しない。認識結果をユーザーが確認できるところまでを今回の完成条件とする。

## 画面構成

```text
数学でGO                         モデル準備完了

問題 1 / 3
次の式を微分しなさい
          f(x) = x² + 3x

┌─────────────────────────────┐
│        ここに回答を書く       │
└─────────────────────────────┘

[1画戻す] [書き直す]               [回答を提出]

認識結果
LaTeX: 2x+3
Rendered: 2x + 3
入力準備 3ms / 推論 180ms / 全体 205ms

                                      [次の問題]
```

問題は最初は3問程度をフロント側の固定データとして持つ。問題APIや管理画面は次段階とする。

## フロントエンド候補

### A. Vanilla HTML / CSS / JavaScript + FastAPI

現在の構成をそのまま発展させる。

メリット：

- Canvas、Pointer Events、モデルロード、認識API呼び出しを再利用できる。
- Node.js・npm・ビルド工程を追加せず、`run_server.ps1`だけで起動できる。
- ブラウザへ送るJavaScriptが最小で、プロトタイプ完成が最も速い。
- フレームワークのruntimeを追加しない。

デメリット：

- 画面やゲーム状態が増えると、DOM操作と状態管理が散らばりやすい。
- TypeScriptによる型チェックがない。
- 将来、問題選択、スコア、演出、設定画面を大量に追加する場合は整理が必要になる。

この最小プロトタイプへの推奨案。

### B. Vue 3 + Vite

メリット：

- HTMLに近いtemplateで、問題、Canvas、認識結果をコンポーネントへ分割しやすい。
- 状態と画面表示の関係がVanillaより追いやすい。
- Vue公式はViteベースの `create-vue` を標準セットアップとしている。
- React未経験者にも比較的読みやすい。

デメリット：

- Node.js、npm、Viteのビルド工程が増える。
- 現在のフロントをある程度書き直す必要がある。
- 今回の1画面だけではフレームワーク導入効果が小さい。

### C. React + Vite

メリット：

- UI部品、テスト、状態管理などの選択肢が多い。
- 数学でGO本体がReactなら同じ技術へ統一できる。
- 問題画面、結果画面、ゲーム進行が大規模化したときに分割しやすい。

デメリット：

- 3案の中で今回の既存コードからの変更量が最も大きい。
- 小さなCanvas画面だけには構成が重い。
- Node.js、npm、Vite、Reactの知識が必要になる。

React公式も既存プロジェクトへの段階導入を案内しており、独自構成ではVite等のbuild toolが必要になる。

### D. Phaser + TypeScript + Vite

ゲーム本体をPhaser Sceneとして構築し、手書き欄だけをネイティブHTML Canvasとして重ねる。

メリット：

- Scene、入力、タイマー、Tween、音、カメラ、ゲームループが最初から用意されている。
- 制限時間、連続出題、問題の移動、正誤演出、BGM・効果音などへ同じ構成のまま拡張できる。
- TypeScriptにより、問題データ、ゲーム状態、認識APIレスポンスを型で管理できる。
- Phaser公式にTypeScript + Viteテンプレートとproduction build手順がある。
- プロトタイプを捨てずに、Sceneとサービスを追加して本番へ育てやすい。

デメリット：

- 今回の最小1画面だけを見るとVanillaより構成とbundleが大きい。
- DOM中心のフォームやアクセシビリティは、通常のHTMLより設計に注意が必要になる。
- Phaser Canvas内へ手書き入力を実装すると、画像抽出やWebGL texture更新が複雑になる。
- Phaser、TypeScript、Viteの学習・保守が必要になる。

本番が「漢字でGO」のような時間・演出・連続出題を持つゲームになる前提では推奨案。

## 選定基準

フレームワーク差による数ミリ秒より、モデル推論の約0.2～1.2秒が支配的である。速度だけを理由にReact・Vue・Phaserを避ける必要はない。

- 数学でGO本体に既存フレームワークがある：同じものを選ぶ。
- まず体験検証を最短で行う：Vanillaを選ぶ。
- 直後から複数画面・ゲーム状態を増やす：VueまたはReactを選ぶ。
- タイマー、連続出題、動き、音を含むゲームへ育てる：Phaser + TypeScript + Viteを選ぶ。

本番へ更新し続ける条件を優先する場合は、Dを推奨する。ただし、手書き入力CanvasはPhaserの描画Canvasへ統合せず、同じ画面上に重ねる独立HTML Canvasとする。

## Phaser採用時の構成

```text
Vite / TypeScript
├── Phaser
│   ├── BootScene       起動、アセット準備、モデル準備状況
│   ├── PlayScene       問題表示、進行、タイマー、演出
│   └── ResultScene     将来の正誤・スコア演出
│
├── HTML UI overlay
│   ├── HandwritingPad  Pointer Events、undo、clear、crop、PNG
│   ├── RecognitionView LaTeX、Rendered、処理時間
│   └── SubmitControls  提出、再試行、次の問題
│
├── application
│   ├── RecognitionClient  FastAPIとの通信
│   ├── QuestionRepository 問題取得。最初は固定データ
│   └── GameSession        問題番号、状態、将来の得点
│
└── FastAPI
    ├── モデル事前ロード
    ├── TexTeller認識
    └── 計測値付きレスポンス
```

Phaser Canvasは問題、背景、時間表示、演出、音を担当する。HTML overlayは手書きCanvas、操作ボタン、LaTeX結果などブラウザ標準機能が強い部分を担当する。両者はTypeScriptのイベントと型付きデータで接続する。

Phaser公式のDOM Element機能でもHTMLをCanvas上へ重ねられるが、カメラやdisplay listとの混在に制約がある。初期実装ではPhaserのDOM Elementへ密結合せず、game root内の兄弟レイヤーとしてHTML overlayを配置する。

### 本番へ育てるために最初から分離するもの

- `Question`: 問題ID、問題文、表示用LaTeX。正解は後から追加できる。
- `RecognitionClient`: 認識API URL、timeout、モデル選択、response型。
- `HandwritingPad`: Phaserに依存しないCanvas入力コンポーネント。
- `GameSession`: `loading`、`ready`、`writing`、`recognizing`、`result`、`error` の状態遷移。
- `PerformanceSample`: encode、画像bytes、HTTP全体、inferenceの計測値。

この分離により、問題を固定配列からAPI・JSONへ変更しても、手書き認識部分を作り直さずに済む。

### 開発とproduction

- 開発時はVite dev serverからFastAPIへ `/api` をproxyする。
- productionでは `vite build` の成果物を静的配信し、FastAPI認識APIと同一Originにする。
- Phaser、Vite、TypeScriptの版を `pnpm-lock.yaml` で固定する。
- CIでTypeScript型検査、unit test、production buildを実行する。
- 既存のモデル仮想環境とフロントのNode依存を混在させない。
- このPCではnpmコマンドが壊れているが、Corepackとpnpm 11.25.0は動作するためpnpmを使用できる。

## 低遅延化の優先順位

### 1. ゲームでは1モデルだけを呼ぶ

両モデル比較は評価画面へ残し、ゲーム画面ではTexTellerだけを呼ぶ。公開HWEではTexTellerのP50が552ms、UniMERNet tinyは1,083msであり、両方を逐次実行すると単純に待ち時間が増える。

### 2. 選択モデルだけをページ表示時にロードする

TexTellerを既定モデルとしてバックグラウンドロードする。問題とCanvasはすぐ表示し、提出ボタンだけを準備完了まで無効にする。比較用UniMERNetはゲーム画面ではロードしない。

### 3. cropしてからBlobで送る

現在のbounding box cropと `canvas.toBlob()` を維持する。Base64へ変換せず、`multipart/form-data`でBlobを送る。

### 4. 待ち時間を分解して計測する

毎回次を記録・表示する。

- crop・画像化時間
- 画像バイト数
- HTTP往復を含む全体時間
- APIが返すモデル推論時間
- 全体時間から推論時間を引いた周辺処理時間

現在の公開HWEベンチマークでは、モデル内部以外のオーバーヘッドはTexTellerで平均2.27ms、P95 5.09msだった。まず推論時間を主対象として改善する。

### 5. 二値化は実験扱いにする

独自Web入力9件、threshold 128、TexTellerで予備試験した。

| 指標 | 元PNG | 1-bit PNG |
|---|---:|---:|
| 平均サイズ | 9,071 bytes | 1,354 bytes |
| 推論P50 | 177.8ms | 174.5ms |
| 推論P95 | 253.4ms | 257.6ms |
| Ground Truth一致 | 7 / 9 | 7 / 9 |

- サイズは約85%減少した。
- 二値化とPNG生成には平均3.56msかかった。
- 9件すべてで元画像と二値画像の正規化後出力は同じだった。
- 推論速度の改善は確認できなかった。

CanvasのPNG生成はブラウザ標準ではRGBAベースであり、真の1-bit PNGにするには追加処理が必要になる。localhostで平均9KB程度を送る構成では転送時間への効果が小さい。アンチエイリアスを消すことで細い線や小さい記号の精度を落とす可能性もあるため、50件以上で精度を確認するまでは既定にしない。

### 6. 将来検討

- 連続出題中はモデルworkerを終了しない。
- 次の問題データを認識中に先読みする。
- 同時推論数はGPUメモリとP95を負荷試験して決める。
- 進行中表示は即時に出し、二重提出を防ぐ。
- 5秒を超える場合はtimeoutと再試行導線を出す。

## 最初の受入条件

- ページを開くと問題と入力欄がすぐ見える。
- マウス、ペン、タッチで書ける。
- TexTeller準備前は提出できず、理由が表示される。
- 1回の提出でTexTellerだけを呼び出す。
- LaTeX文字列とレンダリング結果が表示される。
- crop、画像化、推論、全体時間と画像サイズが確認できる。
- 書き直しと次の問題が動作する。
- APIエラー時に再提出できる。
- デスクトップとスマートフォン幅で操作できる。

## 参照

- Vite Getting Started: https://vite.dev/guide/
- Phaser Project Templates: https://docs.phaser.io/phaser/getting-started/project-templates
- Phaser Scenes: https://docs.phaser.io/phaser/concepts/scenes
- Phaser DOM Element: https://docs.phaser.io/phaser/concepts/gameobjects/dom-element
- Phaser Canvas Texture: https://docs.phaser.io/api-documentation/class/textures-canvastexture
- React Installation / Existing Project: https://react.dev/learn/installation
- Vue Quick Start: https://vuejs.org/guide/quick-start.html
- Canvas `toBlob()`: https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/toBlob
- Canvas pixel manipulation: https://developer.mozilla.org/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
