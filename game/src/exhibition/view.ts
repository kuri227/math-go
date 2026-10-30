import { DIFFICULTY_LABELS as labels } from "./catalog";
import { EXHIBITION } from "./Session";

export type Role = "single" | "display" | "controller";
const button = (id: string, text: string, primary = false) => `<button type="button" id="${id}"${primary ? ' class="primary"' : ""}>${text}</button>`;
const actionLink = (id: string, href: string, text: string) => `<a id="${id}" class="action-link" href="${href}">${text}</a>`;

/** Static semantic structure, separate from session state and side effects. */
export function appMarkup(role: Role): string {
  const homeStart = button("startGame", role === "single" ? "1画面でスタート" : "ゲーム設定へ", true);
  const dualScreenStart = role === "single" ? actionLink("startDualScreen", "/display", "2画面でスタート") : "";
  const screenGuide = role === "controller"
    ? "<div class=\"rule-note\"><strong>画面の使い分け</strong><p>問題はモニターに表示されます。回答とメモはこの液タブに書きます。</p></div>"
    : "<div class=\"rule-note\"><strong>2画面モード</strong><p>問題はモニター、回答用紙とメモ用紙は液タブに表示されます。</p></div>";
  const staffScreenGuide = role === "single"
    ? `<p class="dual-screen-note"><strong>モニター＋液タブでテストする場合</strong><span>問題はモニター、回答とメモは液タブに表示されます。</span>${actionLink("staffDualScreen", "/display", "2画面テストを開く")}</p>`
    : role === "controller"
      ? '<p class="dual-screen-note"><strong>現在の2画面でテスト</strong><span>問題はモニター、回答とメモはこの液タブに表示されます。</span></p>'
      : "";
  return `
    <header class="app-header"><a class="wordmark" href="${role === "controller" ? "/controller" : role === "display" ? "/display" : "/"}">数学で<span>GO</span></a>
      <div class="header-actions"><span id="connection" role="status"></span><span id="modelStatus" role="status">ゲームを準備中</span><label class="volume-control" for="volume"><span>音量</span><input id="volume" type="range" min="0" max="100" step="5" value="70" aria-label="効果音の音量"><output id="volumeValue" for="volume">70%</output></label>${button("fullscreen", "全画面")}</div></header>
    <main>
      <section id="home" class="home" aria-labelledby="homeTitle">
        <div class="home-orbit" aria-hidden="true"><span>+</span><span>×</span><span>π</span><span>√</span></div>
        <div class="home-copy"><p class="eyebrow">HANDWRITING MATH CHALLENGE</p><h1 id="homeTitle">数学で<span>GO</span></h1><p class="home-lead">ひらめいて、書いて、正解をつかめ！</p>
          <div class="home-rules" aria-label="ゲームの概要"><span><strong>1〜15</strong>問を選べる</span><span><strong>20</strong>秒で回答</span><span><strong>3</strong>つの残機</span></div>
          <div class="home-actions">${homeStart}${dualScreenStart}${button("showRules", "あそびかた")}</div>
          ${button("openStaffTools", "スタッフ用：問題テスト・学習データ整備")}
        </div>
      </section>
      <section id="rules" class="reading-surface rules" hidden aria-labelledby="rulesTitle"><p class="eyebrow">HOW TO PLAY</p><h1 id="rulesTitle">あそびかた</h1><ol class="rule-cards"><li><span>1</span><strong>問題を見る</strong><p>画面に出る数学の問題を読もう。</p></li><li><span>2</span><strong>答えを書く</strong><p>回答用紙に答えを書こう。途中の計算はメモ用紙へ。</p></li><li><span>3</span><strong>読み取りを確認</strong><p>読み取った答えが合っていたら回答！</p></li></ol>${screenGuide}<div class="rule-note"><strong>チャンスは3回</strong><p>不正解では残機は減りません。時間切れになると残機が1つ減ります。</p></div><div class="actions">${button("rulesHome", "タイトルへ")}${button("rulesContinue", "ゲーム設定へ", true)}</div></section>
      <section id="setup" class="setup" aria-labelledby="setupTitle">
        <div class="intro"><p id="setupEyebrow" class="eyebrow">GAME SETTINGS</p><h1 id="setupTitle">ゲーム設定</h1><p id="setupDescription">難易度と問題数を選んで挑戦しよう。</p>${button("setupHome", "タイトルへ戻る")}</div>
        <div class="settings"><div id="difficultyStage" class="difficulty-stage" aria-hidden="true"><span>LEVEL</span><strong id="difficultyNumber">1</strong><p id="difficultyName">${labels[0]}</p></div>
          <div class="game-settings-fields"><label class="field" for="difficulty">難易度<select id="difficulty">${labels.map((label, i) => `<option value="${i + 1}">LEVEL ${i + 1} · ${label}</option>`).join("")}</select></label>
            <label id="questionCountField" class="field" for="questionCount">問題数<select id="questionCount">${Array.from({ length: EXHIBITION.maxQuestions }, (_, i) => `<option value="${i + 1}"${i + 1 === EXHIBITION.questions ? " selected" : ""}>${i + 1}問</option>`).join("")}</select><span id="questionCountHint" class="field-hint"></span></label></div>
          <p id="poolSummary" class="muted"></p><p id="setupStatus" role="status">問題を準備しています。</p>
          <section id="staffTools" hidden aria-labelledby="staffToolsTitle"><div class="staff-heading"><p class="eyebrow">STAFF TOOLS</p><h2 id="staffToolsTitle">問題テスト・データ整備</h2><p>出題確認や学習候補の保存を行うスタッフ専用モードです。</p>${staffScreenGuide}</div><section id="questionPicker" aria-label="テストする問題の選択"><label class="field" for="search">問題文・ID・分野で検索<input id="search" type="search" placeholder="例：方程式、d3-s2"></label>
            <div class="picker-toolbar"><label><input id="allLevels" type="checkbox">全レベルから探す</label><label><input id="onlyPending" type="checkbox">未確認だけ</label></div>
            <p id="selectionCount" role="status">0問選択中</p><div class="selection-actions" aria-label="問題の一括選択">${button("selectAllQuestions", "全問題を選択")}${button("clearSelection", "選択を解除")}</div><div id="questionList" class="question-list"></div></section></section>
          ${button("showGuide", "この設定で進む", true)}
        </div>
      </section>
      <section id="guide" class="reading-surface ready-screen" hidden aria-labelledby="guideTitle"><p class="eyebrow">READY?</p><h1 id="guideTitle"></h1><p id="guideDescription"></p><div class="ready-check"><span>問題を見る</span><span>白い用紙に答えを書く</span><span>読み取りを確認</span></div><p id="guideRules"></p><p id="guidePrivacy"></p><div class="actions">${button("guideBack", "ゲーム設定に戻る")}${button("begin", "ゲームスタート！", true)}</div></section>
      <section id="waiting" class="reading-surface waiting" hidden aria-labelledby="waitingTitle"><p class="eyebrow">DISPLAY READY</p><h1 id="waitingTitle">モニター画面の準備完了</h1><p>次に液タブ用の操作画面を開き、液タブへ移動してください。</p><p id="waitingMessage" role="status">液タブ用画面の接続を待っています。</p><div class="actions"><a id="openControllerWaiting" class="action-link" href="/controller" target="_blank" rel="noopener">液タブ用画面を開く</a><a id="displayLink" href="/display">問題表示画面を開く</a></div></section>
      <section id="play" hidden aria-label="プレイ画面">
        <div class="play-toolbar"><p id="modeName"></p><div class="hud"><span id="round"></span><span id="correct"></span><span id="streak"></span><span id="lives" role="status"></span><strong id="time" aria-label="残り時間"></strong></div>${button("stop", "プレイを終了")}</div>
        <div id="timerTrack" class="timer-track" aria-hidden="true"><div id="timerFill"></div></div>
        <section id="activity" class="activity" hidden aria-label="処理と時計の状態"><div role="status"><h2 id="activityTitle"></h2><p id="activityDescription"></p></div><progress id="recognitionProgress" aria-label="認識・判定処理中"></progress></section>
        <section id="countdown" class="countdown" hidden aria-labelledby="countdownTitle"><p>問題はまだ表示されません</p><h1 id="countdownTitle" tabindex="-1">準備中</h1><p id="countdownDescription" role="status" aria-live="polite"></p></section>
        <div class="play-grid"><section id="problemPane" class="problem-pane" aria-label="問題"><p id="questionMeta" class="muted"></p><div class="prompt-space"><div id="prompt" class="prompt"></div></div><section id="answerReplica" class="answer-replica" aria-labelledby="answerReplicaTitle"><h2 id="answerReplicaTitle">回答中の筆跡</h2><div class="replica-paper"><canvas id="replicaPad" aria-label="入力画面から同期した手書き回答"></canvas><p id="replicaHint">回答を書くと、ここに筆跡が表示されます</p><span id="replicaPointer" hidden aria-hidden="true"></span></div><p id="replicaStatus" class="muted" role="status"></p></section></section>
          <section id="inputPane" class="input-pane" aria-label="手書き用紙"><div id="inputHeading" class="input-heading"><h2 id="paperTitle">回答を書く</h2><div id="paperSwitch" class="paper-switch" aria-label="用紙を切り替える">${button("showAnswer", "回答用紙")}${button("showMemo", "メモ用紙")}</div></div>
            <div id="padWrap" class="pad-wrap"><canvas id="pad" class="drawing-pad" aria-label="手書き回答欄"></canvas><p id="padHint" class="pad-hint">ここに答えを書いてください</p><span id="pointer" class="pad-pointer" hidden aria-hidden="true"></span></div>
            <div id="memoWrap" class="pad-wrap" hidden><canvas id="memoPad" class="drawing-pad" aria-label="採点されないメモ欄"></canvas><p id="memoHint" class="pad-hint memo-hint">このメモはモニターへ送られず、採点・保存にも使いません</p><span id="memoPointer" class="pad-pointer memo-pointer" hidden aria-hidden="true"></span></div>
            <div id="preview" class="preview" hidden><h2>書いた答えと合っていますか？</h2><div class="preview-comparison"><figure><figcaption>書いた答え</figcaption><img id="inkImage" alt="余白を切り取った手書き回答"></figure><div><p>読み取った答え</p><div id="recognized" class="math-output"></div></div></div><details id="recognitionDetails"><summary>スタッフ用：認識の詳細</summary><code id="rawLatex"></code><p id="timing"></p></details></div>
            <div id="inputActions" class="input-actions"><div id="editActions" class="edit-actions">${button("undo", "1画戻す")}${button("clear", "現在の用紙を全消去")}</div><div id="writingActions">${button("backToAnswer", "回答用紙へ戻る", true)}${button("recognize", "読み取りを確認", true)}</div><div id="previewActions" hidden>${button("rewrite", "書き直す")}${button("confirm", "この内容で回答", true)}</div></div>
          </section></div>
        <p id="notice" class="notice" role="status" aria-live="polite"></p>
        <section id="result" class="result reading-surface" hidden aria-labelledby="resultTitle"><h2 id="resultTitle"></h2><div class="result-body"><section id="resultQuestion" class="result-question" aria-labelledby="resultQuestionLabel"><p id="resultQuestionLabel" class="result-label">問題</p><div id="resultPrompt" class="result-prompt"></div></section><section id="resultAnswer" class="result-answer" aria-labelledby="resultAnswerLabel"><p id="resultAnswerLabel" class="result-label">あなたの回答</p><div id="resultRecognized"></div></section><div id="solution" class="solution"><p>正答例</p><div id="expected"></div><p id="explanation"></p></div></div><p id="controllerResultHint">モニターで正答と解説を確認してください。</p><div id="resultActions" class="actions">${button("retryTest", "同じ問題を再テスト")}${button("next", "次の問題へ", true)}</div></section>
        <section id="collection" class="reading-surface collection" hidden aria-labelledby="collectionTitle"><details id="collectionDetails"><summary id="collectionTitle">この手書きを学習候補として保存する</summary><p>必要なときだけ開いてください。問題の正答ではなく、画像に実際に書いた内容を入力します。保存だけではモデルは学習されません。</p>
          <label class="field" for="transcription">書いた内容の正しいLaTeX<input id="transcription" maxlength="4000" autocomplete="off" spellcheck="false"></label><div id="transcriptionPreview" class="math-output" aria-label="保存するラベルの表示"></div>
          <label class="field" for="writerId">筆者コード（学習に使う場合は必要・氏名不要）<input id="writerId" maxlength="64" placeholder="例：writer-01" autocomplete="off"></label>
          <label class="check-line"><input type="checkbox" id="labelConfirmed">画像に書いた内容と、保存するLaTeXが一致していることを確認しました</label>
          <label class="check-line"><input type="checkbox" id="consent">手書き画像・筆跡・確認済みLaTeXを、このPCへ学習・評価用データとして保存することに同意します</label>
          ${button("saveSample", "確認したデータを保存")}<p id="saveStatus" role="status"></p></details></section>
        <section id="review" class="reading-surface" hidden aria-labelledby="reviewTitle"><details id="reviewDetails"><summary id="reviewTitle">問題の確認状況・通常ゲーム候補を変更する（管理者）</summary><p>問題文・正答・表示を確認してから変更してください。変更は次のプレイから反映されます。</p><label class="field" for="reviewStatus">確認状況<select id="reviewStatus"><option value="pending">未確認</option><option value="approved">確認済み</option><option value="needs_revision">要修正</option></select></label><label class="check-line"><input id="exhibitionEnabled" type="checkbox">通常ゲームの出題候補にする</label>${button("saveReview", "確認状況を保存")}<p id="reviewNotice" role="status"></p></details></section>
      </section>
      <section id="finished" class="reading-surface finished" hidden aria-labelledby="endTitle"><p class="eyebrow">GAME RESULT</p><h1 id="endTitle"></h1><p id="endReason"></p><p id="endStats" class="end-stats"></p><p id="endAttempts"></p><div id="endSolution" hidden><h2>最後の問題</h2><div id="lastPrompt"></div><p>正答例</p><div id="lastAnswer"></div><p id="lastExplanation"></p></div><div class="actions end-actions">${button("restart", "同じ設定でもう一度", true)}${button("backToSetup", "ゲーム設定へ")}${button("backHome", "タイトルへ")}</div></section>
    </main>`;
}
