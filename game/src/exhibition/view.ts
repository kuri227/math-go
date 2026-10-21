import { DIFFICULTY_LABELS as labels } from "./catalog";

export type Role = "single" | "display" | "controller";
const button = (id: string, text: string, primary = false) => `<button type="button" id="${id}"${primary ? ' class="primary"' : ""}>${text}</button>`;

/** Static semantic structure, separate from session state and side effects. */
export function appMarkup(role: Role): string {
  return `
    <header class="app-header"><a class="wordmark" href="${role === "controller" ? "/controller" : role === "display" ? "/display" : "/"}">数学で<span>GO</span></a>
      <div class="header-actions"><span id="connection" role="status"></span><span id="modelStatus" role="status">認識モデルを準備中</span>${button("sound", "警告音 ON")}${button("fullscreen", "全画面")}</div></header>
    <main>
      <section id="setup" class="setup" aria-labelledby="setupTitle">
        <div class="intro"><h1 id="setupTitle">書いて、確かめて、<br>数学に挑もう。</h1><p>答えを手書き。読み取りを確認してから回答。<br>本番体験と問題テスト、目的に合わせて選べます。</p>
          <div class="screen-links" id="screenLinks">${role === "display" ? button("openController", "入力画面を開く") + '<a href="/">1画面で使う</a>' : '<a href="/display">2画面で使う</a>'}</div></div>
        <div class="settings"><fieldset><legend>遊び方</legend><div class="mode-choices">
          <label><input type="radio" name="mode" value="exhibition" checked><strong>本番体験</strong><span>7問・1問20秒・残機3。時間切れでのみ残機が減ります。</span></label>
          <label><input type="radio" name="mode" value="test"><strong>テストプレイ・データ収集</strong><span>問題を選んで、時間を気にせず検証。</span></label></div></fieldset>
          <label class="field" for="difficulty">問題のレベル<select id="difficulty">${labels.map((label, i) => `<option value="${i + 1}">${i + 1} · ${label}</option>`).join("")}</select></label>
          <p id="poolSummary" class="muted"></p><p id="setupStatus" role="status">問題データを読み込んでいます。</p>
          <section id="questionPicker" hidden aria-label="テストする問題の選択"><label class="field" for="search">問題文・ID・分野で検索<input id="search" type="search" placeholder="例：方程式、d3-s2"></label>
            <div class="picker-toolbar"><label><input id="allLevels" type="checkbox">全レベルから探す</label><label><input id="onlyPending" type="checkbox">未確認だけ</label></div>
            <p id="selectionCount" role="status">0問選択中</p><div id="questionList" class="question-list"></div>${button("clearSelection", "選択を解除")}</section>
          ${button("showGuide", "遊び方を確認して進む", true)}
        </div>
      </section>
      <section id="guide" class="reading-surface" hidden aria-labelledby="guideTitle"><h1 id="guideTitle"></h1><p id="guideDescription"></p><ol><li>問題を読み、答えを白い欄に書きます。</li><li>「読み取りを確認」で、画像と認識した数式を見比べます。</li><li>合っていれば「この内容で回答」。違うときは書き直せます。</li></ol><p id="guideRules"></p><p id="guidePrivacy"></p><div class="actions">${button("guideBack", "設定に戻る")}${button("begin", "はじめる", true)}</div></section>
      <section id="waiting" class="reading-surface" hidden><h1>入力画面</h1><p id="waitingMessage">問題表示画面でモードと問題を選んでください。</p><a id="displayLink" href="/display">問題表示画面を開く</a></section>
      <section id="play" hidden aria-label="プレイ画面">
        <div class="play-toolbar"><p id="modeName"></p><div class="hud"><span id="round"></span><span id="correct"></span><span id="streak"></span><span id="lives" role="status"></span><strong id="time" aria-label="残り時間"></strong></div>${button("stop", "プレイを終了")}</div>
        <div id="timerTrack" class="timer-track" aria-hidden="true"><div id="timerFill"></div></div>
        <div class="play-grid"><section id="problemPane" class="problem-pane" aria-label="問題"><p id="questionMeta" class="muted"></p><div class="prompt-space"><div id="prompt" class="prompt"></div></div></section>
          <section id="inputPane" class="input-pane" aria-label="手書き回答"><div id="inputHeading" class="input-heading"><h2>答えを書く</h2></div>
            <div id="padWrap" class="pad-wrap"><canvas id="pad" aria-label="手書き回答欄"></canvas><p id="padHint">ここに答えを書いてください</p><span id="pointer" hidden aria-hidden="true"></span></div>
            <div id="preview" class="preview" hidden><h2>書いた内容と合っていますか？</h2><div class="preview-comparison"><figure><figcaption>認識に送った画像</figcaption><img id="inkImage" alt="余白を切り取った手書き回答"></figure><div><p>読み取った数式</p><div id="recognized" class="math-output"></div></div></div><details><summary>LaTeX原文・処理時間</summary><code id="rawLatex"></code><p id="timing"></p></details></div>
            <div id="inputActions" class="input-actions"><div id="editActions" class="edit-actions">${button("undo", "1画戻す")}${button("clear", "全消去")}</div><div id="writingActions">${button("recognize", "読み取りを確認", true)}</div><div id="previewActions" hidden>${button("rewrite", "書き直す")}${button("confirm", "この内容で回答", true)}</div></div>
          </section></div>
        <p id="notice" class="notice" role="status" aria-live="polite"></p>
        <section id="result" class="result reading-surface" hidden aria-labelledby="resultTitle"><h2 id="resultTitle"></h2><div class="solution"><p>正答例</p><div id="expected"></div><p id="explanation"></p></div><div id="resultActions" class="actions">${button("retryTest", "同じ問題を再テスト")}${button("next", "次の問題へ", true)}</div></section>
        <section id="collection" class="reading-surface collection" hidden aria-labelledby="collectionTitle"><h2 id="collectionTitle">この手書きを学習候補として保存</h2><p>正解・不正解にかかわらず保存できます。問題の正答ではなく、画像に実際に書いた内容を入力してください。保存だけではモデルは学習されません。</p>
          <label class="field" for="transcription">書いた内容の正しいLaTeX<input id="transcription" maxlength="4000" autocomplete="off" spellcheck="false"></label><div id="transcriptionPreview" class="math-output" aria-label="保存するラベルの表示"></div>
          <label class="field" for="writerId">筆者コード（学習に使う場合は必要・氏名不要）<input id="writerId" maxlength="64" placeholder="例：writer-01" autocomplete="off"></label>
          <label class="check-line"><input type="checkbox" id="labelConfirmed">画像に書いた内容と、保存するLaTeXが一致していることを確認しました</label>
          <label class="check-line"><input type="checkbox" id="consent">手書き画像・筆跡・確認済みLaTeXを、このPCへ学習・評価用データとして保存することに同意します</label>
          ${button("saveSample", "確認したデータを保存")}<p id="saveStatus" role="status"></p></section>
        <section id="review" class="reading-surface" hidden aria-labelledby="reviewTitle"><h2 id="reviewTitle">問題の確認・本番への反映</h2><p>問題文・正答・表示を確認してから変更してください。変更は次のプレイから反映されます。</p><label class="field" for="reviewStatus">確認状況<select id="reviewStatus"><option value="pending">未確認</option><option value="approved">確認済み</option><option value="needs_revision">要修正</option></select></label><label class="check-line"><input id="exhibitionEnabled" type="checkbox">本番体験の出題候補にする</label>${button("saveReview", "確認状況を保存")}<p id="reviewNotice" role="status"></p></section>
      </section>
      <section id="finished" class="reading-surface finished" hidden aria-labelledby="endTitle"><h1 id="endTitle"></h1><p id="endReason"></p><p id="endStats" class="end-stats"></p><p id="endAttempts"></p><div id="endSolution" hidden><h2>最後の問題</h2><div id="lastPrompt"></div><p>正答例</p><div id="lastAnswer"></div><p id="lastExplanation"></p></div><div class="actions">${button("backToSetup", "モード・問題を選び直す", true)}</div></section>
    </main>`;
}
