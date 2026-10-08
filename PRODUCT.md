<!-- impeccable:product-schema 1 -->

# 数学でGO Product Context

## Product definition

数学でGOは、文化祭などの短時間プレイを想定した、手書き数式を認識するWebゲームである。プレイヤーは開始前に7段階の難易度とコースを選び、画面に出る数学問題を見て、マウス・ペン・タッチで回答を書き、認識されたLaTeX、正誤、解説を確認する。時間制限なしの5問練習、1問20秒の7問チャレンジ、時間制限なしの30問マラソンを提供する。

## Users and environment

- 主な利用者は文化祭来場者や生徒。説明を読まずに短時間で操作できる必要がある。
- 入力端末はPC、タブレット、タッチ端末を想定する。
- 初期運用はモデルを搭載した同一PCまたは同一LAN上で行う。
- 開発者は公開HWEと独自Web入力の比較画面も継続して利用する。

## Confirmed architecture

- ゲームフロント: Phaser + TypeScript + Vite
- 手書き入力: Phaserとは分離したネイティブHTML CanvasとPointer Events
- 数式表示: KaTeX
- 認識API: FastAPI
- 通常ゲーム認識: TexTeller
- 比較・検証画面: TexTellerとUniMERNet
- 依存管理: pnpm lockfile
- production: Vite buildをFastAPIと同一Originで静的配信

## Product principles

1. 提出後の待ち時間を最優先で短くし、ロード・認識・失敗の状態を隠さない。
2. 問題進行と認識処理を分離し、モデルや問題配信方法を後から交換できるようにする。
3. 生のLaTeXと保守的に正規化したLaTeXの両方を保持する。
4. 手書き画像は余白をcropし、Blobのまま送る。二値化は評価で有効性が確認できるまで既定にしない。
5. 既存の比較結果と収集データを壊さない。
6. マウス、ペン、タッチ、キーボード操作と小画面を最初から考慮する。

## Current exhibition build scope

- ローカルJSONから50件の展示用サンプル問題を読み込む。
- 7段階の難易度をページ切替で選択し、選択段階を上限に復習問題も出題する。
- 1画戻す、全消去、提出、わからない、次の問題を提供する。
- ゲームの準備完了前は開始・提出できず、プレイヤー向けの言葉で理由を表示する。
- 判定後は、書いた画像、読み取った数式、正答、解説を一画面で比較できるようにする。
- 正規化LaTeXと問題別の許容表記で正誤判定する。
- 正解数、連続正解、残機、終了結果、再挑戦を提供する。点数換算は行わず、終了結果には正解数／回答した問題数と正解率を表示する。
- 認識違いは失点確定前に書き直せる。
- 時間切れ・中断・判定後に正答と解説を表示し、プレイヤー操作で次へ進む。
- 残り時間に応じた問題拡大と、切替可能な終了直前の警告音を提供する。
- ランキング、BGM、一般的な数学的同値判定は次段階とする。
- タイトル画面で5問練習／7問チャレンジ／30問マラソンを選択できる。
- タイトル画面は独立ヘッダーを持たず、主要な選択と開始操作を最初のviewportへ収める。
- `/questions/editor` の専用管理画面から問題を検証・登録し、次のゲーム開始時から反映できる。
- チャレンジでは1問20秒と残り時間に応じた問題拡大を提供し、認識・判定中は時計を止める。時間制限なしのモードでは通常サイズを維持する。15秒への短縮は次回プレイテストの比較候補とする。
- Phaser本体はゲーム開始時に遅延読込し、TexTellerはタイトル表示時から先読みする。
- 難易度設定、コース設定、ゲーム本体、結果面を分離し、問題と運用要件の追加に耐えられる構造を保つ。
- 幅900px以上と横向き端末では問題と手書き欄を左右へ並べ、縦長端末では高さに追従した上下配置にして、両方を最初のviewport内へ収める。

## Next exhibition direction

- 終了画面は、全問完了と残機0による途中終了を区別し、終了理由と回答済み問題数を表示する。最終問題で残機が0になった場合は全問完了を優先する。
- 保守は今後の機能変更時に関連コードを都度整理する。性能改善は計測または処理量の根拠を示し、拡張性のため共通の状態判定・文言を重複させず、テストとビルドで回帰を確認する。自動の定期実行は行わない。

- 最終展示は、モニター用Displayと液タブ用Controllerの2画面構成へ移行する。
- Displayは問題、HUD、タイマー、演出、判定結果、解説を表示する。
- Controllerは手書きCanvas、undo、clear、skip、submit、retry、advanceを表示する。
- 初期実装は同一PC・同一ブラウザー・同一Originで、BroadcastChannelを使う。
- 現行1画面版はフォールバックとして維持し、認識APIとCanvas処理は作り直さない。
- 詳細は `docs/dual-screen-game-design.md` と `docs/adr/0003-dual-screen-game-ui.md` を正とする。

## Evidence

- モデル比較: `reports/model_comparison.md`
- 公開評価結果: `results/baselines/2026-10-01-public-hwe/`
- 前処理A/B: `results/preprocessing_ab.csv`
- 構成判断: `docs/adr/0001-game-frontend-stack.md`
- ゲーム体験仕様: `docs/kanji-go-inspired-game-spec.md`
- 最終展示仕様: `docs/final-exhibition-game-spec.md`
- UX実測: `reports/game_ux_validation.md`
