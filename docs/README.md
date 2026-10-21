# 文書案内

初めて使う場合は [プロジェクトREADME](../README.md) から始めてください。現行仕様と、過去の設計・測定記録を分けています。

## 現行の手順・仕様

| 目的 | 文書 |
|---|---|
| PC要件・clone・CPU/GPU別セットアップ | [README](../README.md) |
| 日々の起動・2画面の設営・トラブル対応 | [展示運用](festival-operation.md) |
| 本番／テストのルール・保存・問題レビュー | [2モード仕様](two-mode-exhibition.md) |
| 学習データの選び方・CPU/GPU追加学習・履歴保全 | [TexTeller再学習](texteller-training.md) |
| 問題登録・正答候補・データ形式 | [問題作成ガイド](question-authoring-guide.md) |
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
