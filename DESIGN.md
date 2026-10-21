---
name: 数学でGO
description: 数式と手書きの一筆を主役にする、短時間プレイ向けのゲームUI
colors:
  stage-navy: "#101b3d"
  ink-navy: "#10182d"
  answer-paper: "#fffdf7"
  outer-paper: "#e6e2d8"
  action-coral: "#e84f2f"
  action-coral-deep: "#b9341c"
  ready-teal: "#117a70"
  muted-on-stage: "#b8c5e5"
  focus-gold: "#ffd166"
typography:
  display:
    fontFamily: "M PLUS 1 Variable, Yu Gothic, sans-serif"
    fontSize: "clamp(2.375rem, 5vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "M PLUS 1 Variable, Yu Gothic, sans-serif"
    fontSize: "clamp(1.3125rem, 2.3vw, 1.875rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "M PLUS 1 Variable, Yu Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  metric:
    fontFamily: "M PLUS 1 Variable, Yu Gothic, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "M PLUS 1 Variable, Yu Gothic, sans-serif"
    fontSize: "clamp(3.5rem, 8vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
rounded:
  control: "12px"
  surface: "14px"
spacing:
  compact: "12px"
  control: "16px"
  surface: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-coral}"
    textColor: "{colors.answer-paper}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "52px"
  button-secondary:
    backgroundColor: "#2d3a62"
    textColor: "{colors.answer-paper}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "52px"
  result-surface:
    backgroundColor: "{colors.answer-paper}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.surface}"
    padding: "32px"
---

# Design System: 数学でGO（現行）

更新日：2026-10-21。旧仕様の詳細は [履歴資料](docs/history/design-before-2026-10-21.md) に保存した。

## 方向性

「数式のステージ」。深い藍の問題面、明るい回答の紙、濃い朱の主要操作を維持する。
初見の利用者が「問題を見る → 書く → 読み取りを確認 → 回答 → 結果」を見失わない、操作中心のUI。
装飾・影・カードを増やすのではなく、状態の見通しと数式の読みやすさを優先する。

## 色と文字

- 舞台 `#101b3d`、紙 `#fffdf7`、墨 `#10182d`、補足 `#bccae9`。
- 現在の主要ボタンは濃い朱 `#b9341c`。焦点は金 `#ffd166`。
- 日本語は自己配信のM PLUS 1 Variable、数式はKaTeX。LaTeX原文だけ等幅。
- 正解・誤答・残機減少は色だけにせず、必ず文字で明示する。
- 生LaTeX・モデル出力のHTMLを信頼しない。KaTeXが解釈できない式は文字列として表示する。

## レイアウトと操作

- 1画面版は広い画面で問題と手書きを左右配置、小画面では上下。Displayは問題を広く、Controllerは入力を主役にする。
- 問題文は折り返し、長い数式は構造を崩さず枠内スクロール。狭い画面や低い画面でも主要操作を隠さない。
- 認識結果・正答例・保存ラベル・終了時正答は共通の数式枠。48px基準、実寸により24pxまで縮小、それ以上はスクロール。
- 手書き画像と認識枠は同じ高さ。各列240pxを確保できなくなったら上下へ並べる。
- ボタンは48px以上の高さを基本とし、主要操作は朱色1つ。固定フッターにはsafe-areaと本文の下余白を確保する。
- ガイド・入力・結果・終了では次の作業に合う見出し／領域へフォーカスを移し、結果が下にあるまま見落とされるのを防ぐ。
- DOM順とキーボード順を一致させる。プルダウンはネイティブselect、補足はdetails/summaryを使う。
- 同値のHUDテキストを書き直さず、残機のstatusを毎100ms更新しない。

## ゲーム状態

- 本番は7問、1問20秒、残機3。誤答では減らず、時間切れのみ−1。
- HUDは問題番号・正解数・連続正解・残機・残り時間。点数は表示しない。
- 時間切れ結果は「時間切れ · 残機 −1」、残機0終了は原因を本文でも示す。
- テストモードは時間・残機表示なし。収集と問題管理はテスト時にのみ出す。
- 処理待ち・切断では時計を停止し、認識プレビューでは進める。初回説明に明記する。

## 動き・入力・回復

- 短い問題だけ、実寸と空き領域の範囲で時間経過による拡大。テスト・長文・reduced-motionでは拡大しない。
- 結果の小さな展開演出以外に装飾アニメーションを増やさない。
- CanvasはPointer Events・pointer capture・touch-actionを使用。undo・全消去・書き直しを残す。
- 通信失敗の理由と再試行を明示し、筆跡を消さない。保存が確定したか不明な場合は同じ要求IDで再試行する。
- ブラウザー全画面が拒否された場合は代替操作を案内する。制約を隠して成功扱いにしない。

## 検証の扱い

[検証記録](reports/refactor_playtest_2026-10-21.md) に実機／エミュレートviewport、入力方法、未検証を区別して記す。
WCAG準拠や全利用者の操作可能性を、スクリーンショット・自動チェックだけで断言しない。
