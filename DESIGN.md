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

# Design System: 数学でGO

## Overview

**Creative North Star: "数式のステージ"**

問題が舞台中央に現れ、その直下の白い回答面へプレイヤーの一筆が入る構成を基本とする。ゲームらしい強さは装飾の多さではなく、問題、入力、提出の順序が迷いなく見えることと、状態が即座に反応することから生む。

暗い舞台と明るい回答面を大きな面で切り替え、提出だけを朱色で強く扱う。計測値や補足は静かに下げ、初見のプレイヤーが数秒で書き始められる密度を保つ。

**Key Characteristics:**

- 数式を中央へ大きく置く一画面の舞台構成
- 白いCanvasと濃紺の周囲による明確な入力領域
- 提出操作だけに使う朱色の強いアクセント
- 準備、認識、失敗を文字と色の両方で示す状態表現
- 結果表示に限って一度だけ使う展開モーション
- プレイ前は数式の大きなタイポグラフィとコース選択で期待を作り、約1秒の導入から本編へ接続

## Colors

深い藍を大面積の舞台にし、紙色と朱色で入力と行動を明確に分ける。青緑は準備完了、金色はキーボードフォーカスだけに使う。

### Primary

- **舞台の藍:** 問題、入力領域の外周、ヘッダーを一続きのゲーム空間として見せる。
- **提出の朱:** 主要操作と、問題下の短いアクセント線に限定する。

### Secondary

- **準備完了の青緑:** モデルが利用可能であることを示す状態色。主要操作には流用しない。
- **焦点の金:** キーボードフォーカスを背景色に関係なく見つけられるようにする。

### Neutral

- **回答の紙:** 手書きCanvasと認識結果の読み取り面。
- **外側の紙:** 結果セクションとページ外周を分ける静かな地色。
- **数式の墨:** 手書き線、見出し、主要な数値。
- **舞台上の淡青:** 補足、処理状態、非主要ラベル。

**The One Coral Action Rule.** 朱色はその時点で最も重要な操作ひとつだけに使い、同一画面内で競合する主要操作を作らない。

## Typography

**Display Font:** M PLUS 1 Variable（Yu Gothic、sans-serif fallback）

**Body Font:** M PLUS 1 Variable（Yu Gothic、sans-serif fallback）
**Label/Mono Font:** LaTeX原文だけui-monospace / Consolas

**Character:** 太く明快な日本語と、同じ骨格の英数字で問題と操作を一体化する。数式レンダリングは問題面と結果面の両方をKaTeXに任せ、積分範囲・極限条件・行列構造を省略しない。残り時間による拡大は最大1.6倍を基本とし、利用できる高さと数式構造に応じて1.0〜1.6倍の範囲で上限を自動調整して見出し・境界線との重なりを防ぐ。

### Hierarchy

- **Display:** 問題式。画面幅に合わせて縮小し、最初の視線を取る。
- **Headline:** 入力指示と結果見出し。短く、太く、負の字間をわずかに使う。
- **Body:** 状態説明と補足。暗い舞台上では専用の淡青を使う。
- **Metric:** スコア、連続数、残機、残り時間。tabular numeralsで更新時の桁揺れを防ぐ。

**The Formula Leads Rule.** 問題文より問題式を大きくし、説明文が数式より先に主役にならないようにする。

## Layout

プレイ前は独立ヘッダーを置かず、最大1240pxの2カラムでゲームの一文説明と選択面を対置する。860px以下ではタイトルを圧縮した1カラムへ畳み、高さの短い横向き端末では選択面を優先して左右配置または単独表示する。難易度、3コース、準備状態、開始操作を100dvh内へ収める。プレイ中は、幅900px以上のデスクトップでは左を問題舞台、右を手書き入力面とする2カラムを基本とする。横向き端末は高さ520px以下でも同じ左右構成へ切り替え、限られた高さを横幅で補う。縦長のタブレットとモバイルでは上下構成を保つが、問題舞台とCanvasの高さをviewportへ追従させる。640px以下では提出を先頭の全幅操作にし、編集操作を3列へ畳む。左右余白はデスクトップ40px、モバイル24pxを下限とする。

問題式と手書きCanvasは、一般的なノートPC、タブレット、スマートフォンの最初のviewport内に同時表示する。高さが620px以下の端末ではヘッダー、問題舞台、Canvas、操作の順に段階的に圧縮し、操作や問題そのものは隠さない。結果は提出後に同じステージ内の結果面へ切り替え、長いページの下へ追加しない。

## Elevation & Depth

基本は色面の切り替えで階層を作り、影は白い入力面と結果面を暗い舞台または外側の紙から分離する場合だけ使う。

### Shadow Vocabulary

- **入力面の浮き:** 暗い舞台から白いCanvasを持ち上げる、下方向へ広がる柔らかい影。
- **結果面の浮き:** 外側の紙から結果を分ける、入力面より薄い環境影。

**The Paper Only Lifts Rule.** 影を持てるのは書く・読むための紙面だけで、ボタンや状態表示は色と動きで応答する。

## Shapes

操作は12px、主要な紙面は14pxの角丸を使う。丸みは触れられる境界を示すためのもので、テキストや統計を個別の小カードへ分割しない。Canvas本体は直線的な白面とし、上部の見出し帯だけ角を継承する。

## Components

### Buttons

- **Shape:** 高さ52px、12pxの角丸。モバイルでは高さ48pxまで縮める。
- **Primary:** 白文字と提出の朱。hover時は濃い朱へ移り、2pxだけ上がる。
- **Secondary:** 白文字と中明度の藍。結果面上の再試行だけは紙に馴染む淡色へ反転する。
- **Focus / Disabled:** 金色の3px focus ring。無効時は透明度を下げ、カーソルと文言の両方で理由を示す。

### Cards / Containers

- **Corner Style:** 14pxの小さな丸み。
- **Background:** 入力面は純白、結果面は回答の紙。
- **Shadow Strategy:** Paper Only Lifts Ruleに従う。
- **Internal Padding:** 結果面は32px、モバイルでは上下22px・左右18px。

### Handwriting Surface

白背景・濃紺5px線を基本とする。ブラウザの十字cursorに加え、朱色の16pxリングでポインター位置を表示する。Pointer Events、undo、clear、cropは視覚層から独立したコンポーネントとして維持する。

### Status Indicator

小さな点、色付きの外周、状態文の3要素を組み合わせる。色だけに意味を持たせず、「読み込み中」「準備完了」「エラー」を必ず文字で併記する。

## Do's and Don'ts

### Do:

- **Do** 問題、入力、提出の順序を最初の画面内で明示する。
- **Do** ロード中・認識中・失敗を同じ位置の文言と操作状態で伝える。
- **Do** スコアと残り時間をtabular numeralsで安定して表示する。
- **Do** Phaserの演出とHTMLの入力・結果を明確な責務境界で保つ。
- **Do** スコア、連続数、残機をヘッダーの同じ位置で更新する。
- **Do** 正誤演出を先に見せてから、認識結果と正答の比較へ移動する。
- **Do** 認識違いを失点確定前に書き直せるようにする。

### Don't:

- **Don't** 複数の主要ボタンを同じ朱色で競わせない。
- **Don't** 統計や説明を同じ大きさの小カード群へ分割しない。
- **Don't** 手書きCanvasをPhaser WebGL textureへ統合しない。
- **Don't** モデル準備中の提出操作を、理由なしで押せる状態にしない。
- **Don't** 外部作品のロゴ、キャラクター、背景、音、固有文言、画面配置を複製しない。

## Game HUD and Feedback

ヘッダーはスコア、連続数、残機、残り時間を一列で保持する。制限時間なしのコースでは時計とゲージを隠す。舞台上はROUND、難易度、カテゴリ、問題だけに絞り、抽象的な斜線と円で数学の集中領域を作る。キャラクターや具体物の背景には依存しない。

判定結果は正解を青緑、要確認を濃い朱で示し、色と同時に「正解」「もう一度確認」を大きな文字で表示する。約780msの舞台演出後、比較結果へスクロールする。結果面では認識した回答と正答を同じ寸法で並べ、性能値をその下へ置く。

認識LaTeXをKaTeXで構文解析できない場合は、KaTeX既定の赤いエラー表示を使わない。正誤色との混同を避けるため、LaTeX原文を中立色の等幅文字で表示し、補足ツールチップでフォールバックであることを示す。

終了画面はスコアを主役にし、正解数、平均応答、残機を二次情報とする。再挑戦以外の強い操作は置かない。

## Pre-play / Post-play Extension Boundary

タイトル、コース選択、ステージ導入、終了結果はゲーム本体と認識パイプラインから分離する。現段階の画面は体験方向を確かめるプロトタイプであり、今後提示される要件定義に応じてオンボーディング、難易度選択、報酬、復習、ランキングへ更新できる余地を残す。認識API、Canvas入力、判定フローはこれらの変更に依存させない。

## Dual-screen target

最終展示では、同じ視覚世界を2つの役割へ適応する。モニター側Displayは「数式のステージ」を広げ、問題、時間、スコア、正誤演出、解説を遠目にも読める密度にする。液タブ側Controllerは「回答の紙」を画面の主役にし、Canvasと提出系操作だけをペンで届く範囲へ置く。

- Displayは見る画面であり、回答ボタンやCanvasを置かない。
- Controllerは触る画面であり、問題本文や詳細HUDを常時複製しない。
- 両画面で同時に朱色の主要操作を競合させない。Controllerの提出中はDisplay側に操作を出さず、演出だけを行う。
- 接続中、切断、認識中、書き直し可能、次へ進める状態を、両画面で矛盾のない文言として表示する。
- Controllerのタッチ対象は44px以上を下限とし、ペン入力領域とボタンの誤接触を防ぐ。
- 現行1画面はフォールバックとして残し、2画面専用CSSで無理に兼用しない。
