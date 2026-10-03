# ADR 0001: ゲームフロントエンド構成

- 状態: 採用
- 日付: 2026-10-03

## 背景

数学でGOでは、手書き数式をWeb Canvasで入力し、FastAPI経由でHMERモデルへ送り、認識LaTeXをゲームへ返す。最初は問題表示、手書き、提出、認識結果表示だけを実装する。一方、完成版では連続出題、制限時間、得点、正誤演出、音、画面遷移が追加される可能性が高い。

最短のPoCだけなら既存のVanilla JavaScriptが最小だが、本番へ移るとゲーム進行部分を作り直す可能性がある。

## 提案

フロントエンドを `Phaser + TypeScript + Vite` で構築する。バックエンドのFastAPIとモデルworkerは維持する。

手書き入力はPhaserのWebGL描画へ統合せず、Phaser Canvasと同じroot内へ重ねたネイティブ `HTMLCanvasElement` とする。

```text
Phaser: 問題進行、Scene、タイマー、演出、音
HTML:   手書きCanvas、ボタン、LaTeX結果、状態メッセージ
FastAPI: モデル準備、画像検証、TexTeller推論
```

## 理由

1. Phaserはゲーム進行に必要なScene、input、time、tween、soundを持つ。
2. TypeScriptで問題、状態、APIレスポンスの境界を固定できる。
3. Viteにより開発用HMRとproduction buildを同じ構成で扱える。
4. Phaser公式にTypeScript + Viteテンプレートがある。
5. ネイティブCanvasを分離することで、既存のPointer Events、crop、`toBlob()`、stroke JSONを再利用できる。
6. WebGL canvas全体のsnapshotや、手書きのたびのCanvasTexture再転送を避けられる。

## 採用しない構成と理由

### Vanilla JavaScriptのみ

最短だが、Scene、ゲーム状態、演出が増えた時点で独自のゲーム基盤を実装することになる。本番へ育てる前提では将来の書き直しリスクが高い。

### ReactまたはVueをゲーム本体にする

問題設定、管理画面、一般的なフォームには適するが、ゲームループ、タイマー、Tween、音などは別途設計が必要になる。今回の中心が業務UIではなくゲーム体験であるため、Phaserを中心にする。

### 手書きもPhaser Canvasに描く

WebGL rendererからの画像抽出が複雑になり、CanvasTextureを頻繁に更新するとGPU再転送が発生する。入力画像をモデルへ送る機能には、独立HTML Canvasの方が単純で計測しやすい。

## 影響

メリット：

- 最小版から完成版へSceneとサービスを追加して拡張できる。
- 認識APIとゲーム処理を独立してテストできる。
- 手書き画像生成の性能をPhaser描画から切り離せる。

コスト：

- Vanilla版より初期セットアップとbundleが大きい。
- PhaserとTypeScriptの学習・保守が必要になる。
- DOM overlayとPhaser Canvasの座標・resizeを同期する必要がある。

## 初期制約

- Phaserの物理エンジンは使用しない。
- 初期版はBootSceneとPlaySceneだけにする。
- 通常認識はTexTellerのみとし、UniMERNet比較は検証画面へ分離する。
- 提出中は二重送信を禁止する。
- 画像二値化は既定にしない。
- Phaser、TypeScript、Viteの版はlockfileで固定する。

## 再検討条件

- 完成版にもタイマー、演出、音、Scene遷移が不要と確定した場合
- 数学でGO本体に既存のReact/Vue基盤があり、統合コストがPhaser導入コストを上回る場合
- 対象端末でPhaserの描画負荷が手書き入力の追従性を悪化させた場合
