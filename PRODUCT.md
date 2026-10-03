<!-- impeccable:product-schema 1 -->

# 数学でGO Product Context

## Product definition

数学でGOは、文化祭などの短時間プレイを想定した、手書き数式を認識するWebゲームである。プレイヤーは開始前にコースを選び、画面に出る数学問題を見て、マウス・ペン・タッチで回答を書き、認識されたLaTeXと正答判定を確認する。現段階では時間制限なしの5問練習と、1問30秒の7問チャレンジで、「選ぶ → 問題を見る → 書く → 提出する → 判定を見る → 次へ進む → 結果を見る」のゲームループと応答速度を検証する。

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

## Prototype scope

- 7件のサンプル問題を順番に表示する。
- 1画戻す、全消去、提出、スキップ、次の問題を提供する。
- TexTellerのモデル準備完了前は提出できず、理由を表示する。
- 認識したLaTeX、レンダリング結果、画像化・推論・全体時間、画像サイズを表示する。
- 正規化LaTeXと問題別の許容表記で正誤判定する。
- スコア、連続正解、残機、終了結果、再挑戦を提供する。
- 認識違いは失点確定前に書き直せる。
- ランキング、音、一般的な数学的同値判定は次段階とする。
- タイトル画面で5問練習／7問チャレンジを選択できる。
- チャレンジでは1問30秒と残り時間ボーナスを提供し、認識・判定中は時計を止める。
- Phaser本体はゲーム開始時に遅延読込し、TexTellerはタイトル表示時から先読みする。
- プレイ前後のUXは次の要件定義で更新できるよう、コース設定・ゲーム本体・結果面を分離する。

## Evidence

- モデル比較: `reports/model_comparison.md`
- 公開評価結果: `results/baselines/2026-10-01-public-hwe/`
- 前処理A/B: `results/preprocessing_ab.csv`
- 構成判断: `docs/adr/0001-game-frontend-stack.md`
- ゲーム体験仕様: `docs/kanji-go-inspired-game-spec.md`
- UX実測: `reports/game_ux_validation.md`
