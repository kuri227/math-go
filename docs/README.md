# 文書案内

アプリの概要は [プロジェクトREADME](../README.md)、別PCへの導入は [はじめての導入ガイド](installation.md) から始めてください。現行仕様と、過去の設計・測定記録を分けています。

## プロジェクトを理解・議論する

- [次のコーディングエージェントへの引き継ぎ](../HANDOFF.md)：着手順、確定事項、未決定、作業ツリー、検証コマンドとデータ保全。
- [製品・要件・技術選定・ロードマップ](product-and-roadmap.md)：なぜ作るか、要件の状態、現行フロー、技術の意図と代償、残る課題の入口。
- [2画面コントローラーUXと検証境界](dual-screen-controller-ux.md)：操作移管、開始待機、回答筆跡共有、液タブ限定メモ、実装・レビューの受入条件。自動検査とComputer Useによる両画面比較を実施済み。物理ペン、同期遅延、長時間運転は本番機での確認が必要。
- [2026-10-23 2画面実装・検証記録](../reports/dual_screen_implementation_2026-10-23.md)：通信版v4の実装内容、実行した検査、U01〜U12の証拠境界と未検証項目。
- [ADR 0004](adr/0004-current-stack-and-controller-direction.md)：旧Phaser / BroadcastChannelの判断と現行構成の更新関係。

文書の順番は「アプリ概要 → 導入 → 当日運用 → 現行仕様 → 開発・アーキテクチャ → 検証記録」です。導入だけなら、はじめての導入ガイドを上から順に進めれば完了します。

## 現行の手順・仕様

| 目的 | 文書 |
|---|---|
| アプリの概要・機能・文書入口 | [README](../README.md) |
| PC要件・clone・CPU/GPU別セットアップ | [はじめての導入ガイド](installation.md) |
| 日々の起動・2画面の設営・トラブル対応 | [展示運用](festival-operation.md) |
| 本番／テストのルール・保存・問題レビュー | [2モード仕様](two-mode-exhibition.md) |
| 学習データの選び方・CPU/GPU追加学習・履歴保全 | [TexTeller再学習](texteller-training.md) |
| 問題登録・正答候補・データ形式 | [問題作成ガイド](question-authoring-guide.md) |
| 開発起動・回帰テスト・変更時の確認範囲 | [開発者向けガイド](development.md) |
| コードの責務・通信・API・データ | [アーキテクチャ](architecture.md) |
| モデル比較・公開HWE評価 | [モデル評価ガイド](model-evaluation-guide.md) |
| 外部プログラムからの認識API | [認識API要件](recognition_service_requirements.md) |
| 最新の修正・時計停止表示・CPU設定比較 | [2026-10-22の検証](../reports/remaining_fixes_2026-10-22.md) |
| 全体監査・最初の17件と当時の証拠 | [2026-10-21の検証](../reports/refactor_playtest_2026-10-21.md) |

同じ内容に食い違いがある場合、ゲームの動作は2モード仕様、追加学習の扱いは再学習マニュアルを正とします。
別PC間の同期・任意の数学的同値判定・モデルの自動採用は現行機能ではありません。

## 開発の経緯・参考資料

- [開発履歴](development-history.md) と [ADR](adr/)：なぜ構成を変えたかを追う入口。
- [整理前の製品コンテキスト](history/product-context-before-2026-10-21.md)、[整理前のデザイン](history/design-before-2026-10-21.md)、[整理前の構成](history/architecture-before-2026-10-21.md)：原文を保全した履歴。
- [旧展示仕様](final-exhibition-game-spec.md)、[旧ゲーム方針](kanji-go-inspired-game-spec.md)、[旧2画面設計](dual-screen-game-design.md)、[旧コースガイド](course-guide-design.md)：現行実装の指示書ではなく設計過程。
- [過去の検証](../reports/)：実施日・対象版・PCを確認して参照する。以前の件数・速度を現在の保証にしない。

## 安全な検証

問題登録や保存を試す場合は、元の問題ファイルと収集原本を使わず、コピーした問題バンクを `HMER_QUESTION_BANK`、隔離データルートを `HMER_DATA_ROOT` で指定します。
学習台帳は別扱いです。`data/training` を削除・初期化して再実験することはせず、小型モデルの合成スモークテストを使ってください。

文書のローカルリンクは `python scripts/check_docs.py` で確認できます（現行文書のみ。歴史資料の記述は自動修正しません）。
