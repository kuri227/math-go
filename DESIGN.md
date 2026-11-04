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

更新日：2026-11-04。旧仕様の詳細は [履歴資料](docs/history/design-before-2026-10-21.md) に保存した。

## 方向性

「数式のステージ」。深い藍の問題面、明るい回答の紙、濃い朱の主要操作を維持する。
初見の利用者が「問題を見る → 書く → 読み取りを確認 → 回答 → 結果」を見失わない、操作中心のUI。
装飾・影・カードを増やすのではなく、状態の見通しと数式の読みやすさを優先する。

## 色と文字

- 舞台 `#101b3d`、紙 `#fffdf7`、墨 `#10182d`、補足 `#bccae9`。
- 現在の主要ボタンは濃い朱 `#b9341c`。焦点は藍の面では金 `#ffd166`、紙の面では青緑 `#117a70` とする。
- 日本語は自己配信のM PLUS 1 Variable、数式はKaTeX。LaTeX原文だけ等幅。
- 正解・誤答・残機減少は色だけにせず、記号と文字で明示する。判定直後は両画面に短い大判フィードバックを出し、結果画面では同じ判定を常時表示する。
- 装飾目的の英語小見出し、同寸カードの反復、色付きの太い縦罫線は使わない。手順・注意・判定は、近接、文字階層、細い区切り、面の色で役割を示す。
- 生LaTeX・モデル出力のHTMLを信頼しない。KaTeXが解釈できない式は文字列として表示する。

## レイアウトと操作

- 1画面版は広い画面で問題と手書きを左右配置、小画面では上下。Displayは問題を広く、Controllerは入力を主役にする。
- 縦画面は幅ではなく向きを優先し、問題を上、回答・認識確認を下へ積む。画面高を固定ステージとして使い、1画面版は問題対入力をおよそ3:7、Displayは問題対回答筆跡をおよそ6:4、Controllerは残り高を手書き面へ配分する。ページ全体はスクロールさせず、長い数式だけを枠内スクロールにする。
- 問題文は折り返し、長い数式は構造を崩さず枠内スクロール。狭い画面や低い画面でも主要操作を隠さない。
- 認識結果・正答例・保存ラベル・終了時正答は共通の数式枠。48px基準、実寸により24pxまで縮小、それ以上はスクロール。
- 手書き画像と認識枠は同じ高さ。各列240pxを確保できなくなったら上下へ並べる。
- ボタンは48px以上の高さを基本とし、主要操作は朱色1つ。固定フッターにはsafe-areaと本文の下余白を確保する。
- 縦型の狭い画面では44pxを下限とし、ヘッダー・HUD・操作列を圧縮しても問題、用紙、確認画像、主要ボタンを同一viewportに残す。`svh`とsafe-areaを使い、ブラウザーUIや角丸領域を避ける。
- ガイド・入力・結果・終了では次の作業に合う見出し／領域へフォーカスを移し、結果が下にあるまま見落とされるのを防ぐ。
- DOM順とキーボード順を一致させる。プルダウンはネイティブselect、補足はdetails/summaryを使う。
- 同値のHUDテキストを書き直さず、残機のstatusを毎100ms更新しない。

## ゲーム状態

- 本番は選んだ難易度の本番候補から10問を重複なしで出題する。制限時間は難易度順に15・25・40・55・75・100・120秒、残機3で、誤答では減らず、時間切れのみ−1。
- HUDは問題番号・正解数・連続正解・残機・残り時間。点数は表示しない。
- 時間切れ結果は「時間切れ · 残機 −1」、残機0終了は原因を本文でも示す。
- テスト・開発者モードも難易度別時計と残機3を表示し、選択問題を順番に循環する。問題点報告、収集、問題管理はこのモードだけに出す。最後の残機を失った場合も即座に結果へ飛ばさず、その問題を確認・報告してから終了結果へ進む。
- 手書き中だけ時計を進め、処理待ち・認識確認・切断では停止。状態を大きな見出しと説明で示し、残り時間にも「時計停止中」と表示する。認識・判定中は進行表示を添える。
- 学習候補保存と問題管理はテスト専用のネイティブdetailsへ分け、必要なときだけ開く。ソロプレイの進行を最優先にする。
- テスト開始前の問題選択は展示設定と分離した全幅の管理ワークスペースとし、絞り込み・検索結果・選択中の3領域で構成する。一括選択は全問題ではなく現在の絞り込み結果を対象とする。詳細は[テスト・開発者ワークスペース再設計](docs/test-developer-workspace-design.md)を正とする。
- 2画面の開始前は、液タブの画面をそのまま複製せず、タイトル・遊び方・難易度・問題選択の状態をモニター向けの大きな表示へ変換する。難易度変更はLEVEL・名称・制限時間を即時反映する。ゲーム開始後の問題・筆跡・結果の役割分担は変更しない。
- 準備表示は「問題データ」「2画面接続」「認識モデル」を一つの曖昧な文言へまとめない。モニターは認識モデルを読み込まず、液タブから受け取った認識準備状態だけを表示する。

## 動き・入力・回復

- 短い問題だけ、実寸と空き領域の範囲で時間経過による拡大。テスト・長文・reduced-motionでは拡大しない。
- タイトルでは一度だけ「数学のステージが開く」演出を行う。遊び方・設定・開始確認は、ページ・設定面・ステージという役割に合わせた短い遷移で移動先を伝える。
- プレイ中の動きは操作と状態の説明に限定する。ボタンの押下、用紙の選択、HUDの値更新、カウントダウン、残り5秒をそれぞれ短く示し、待ち時間を増やさない。
- 判定直後は正解を拡大、不正解を横方向の短い収束、時間切れを下からの到着として区別する。動きを減らす設定でも記号・文字・面・下端ラインの違いは維持する。
- 常時ループは残り5秒の警告だけとし、CSSのtransform・opacity・clip-pathを中心に構成する。モーション用の外部ライブラリは追加しない。
- CanvasはPointer Events・pointer capture・touch-actionを使用。undo・全消去・書き直しを残す。
- 通信失敗の理由と再試行を明示し、筆跡を消さない。保存が確定したか不明な場合は同じ要求IDで再試行する。
- ブラウザー全画面が拒否された場合は代替操作を案内する。制約を隠して成功扱いにしない。

## 検証の扱い

[検証記録](reports/refactor_playtest_2026-10-21.md) に実機／エミュレートviewport、入力方法、未検証を区別して記す。
WCAG準拠や全利用者の操作可能性を、スクリーンショット・自動チェックだけで断言しない。
