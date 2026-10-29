import "@fontsource-variable/m-plus-1";
import "katex/dist/katex.min.css";
import "./app.css";
import { RecognitionClient } from "../api/RecognitionClient";
import { HandwritingPad, type CroppedImage, type InkSnapshot } from "../ui/HandwritingPad";
import { renderMath } from "../ui/renderMath";
import { richText } from "./richText";
import { Session, chooseExhibition, EXHIBITION, type Mode, type Snapshot } from "./Session";
import type { Question, RecognitionResponse } from "../domain/types";
import { DualScreenChannel } from "../dual-screen/DualScreenChannel";
import { WebSocketTransport } from "../dual-screen/WebSocketTransport";
import { formulaScale } from "../game/formulaLayout";
import { GAME_VOLUME_STORAGE_KEY, UrgencySound } from "../ui/UrgencySound";
import { StatePublisher } from "../dual-screen/StatePublisher";
import { connectionCopy } from "../dual-screen/connectionCopy";
import { isSafeInkSnapshot } from "../dual-screen/messages";
import { activity, clockRunning } from "./activity";
import { byId as $, text } from "./dom";

import { appMarkup, type Role } from "./view";
import { DIFFICULTY_LABELS as difficultyLabels, REVIEW_LABELS as reviewLabels, QuestionCatalog } from "./catalog";
import {
  answerReplicaVisible,
  playNotice,
  playNoticeVisible,
  remainingSeconds,
  toControllerSnapshot,
  type Paper,
} from "./presentation";

export function runApp(role: Role): void {
  document.body.dataset.role = role;
  $("app").innerHTML = appMarkup(role);

  const client = new RecognitionClient();
  const sound = new UrgencySound();
  const volume = $<HTMLInputElement>("volume");
  const updateVolume = (percent: number) => {
    volume.value = String(percent);
    volume.setAttribute("aria-valuetext", percent === 0 ? "ミュート" : `${percent}パーセント`);
    $("volumeValue").textContent = `${percent}%`;
  };
  updateVolume(sound.volume);
  volume.addEventListener("input", () => updateVolume(sound.setVolume(Number(volume.value))));
  volume.addEventListener("change", () => sound.playEffect("tap"));
  window.addEventListener("storage", event => {
    if (event.key === GAME_VOLUME_STORAGE_KEY && event.newValue !== null) updateVolume(sound.setVolume(Number(event.newValue), false));
  });
  document.addEventListener("pointerdown", () => sound.arm(), { once: true, passive: true });
  document.addEventListener("keydown", () => sound.arm(), { once: true });
  let lastSound = "";
  let publishAnswerInk = (_snapshot?: InkSnapshot, _force?: boolean): void => {};
  const pad = new HandwritingPad($<HTMLCanvasElement>("pad"), $("padHint"), $("pointer"), snapshot => publishAnswerInk(snapshot));
  const memoPad = new HandwritingPad($<HTMLCanvasElement>("memoPad"), $("memoHint"), $("memoPointer"));
  const replicaPad = new HandwritingPad($<HTMLCanvasElement>("replicaPad"), $("replicaHint"), $("replicaPointer"));
  replicaPad.setDisabled(true);
  let bank: Question[] = [], modelReady = false, connected = role === "single";
  let catalog = new QuestionCatalog(bank);
  const setBank = (questions: Question[]) => { bank = questions; catalog = new QuestionCatalog(bank); };
  let selectedMode: Mode = "exhibition", session: Session | null = null, remote: Snapshot | null = null;
  let setupView: "home" | "difficulty" | "rules" | "staff" = "home";
  let lastRender = "", lastQuestion = "", lastPreview = "", busy = false, saveBusy = false, savedRequest = "";
  let lastFocusedPreview = "", controllerConnectionId: string | null = null;
  let activePaper: Paper = "answer", inkGeneration = 0, inkTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingInk: InkSnapshot | null = null;
  let pendingControllerReady = "";
  let replicaGeneration = -1;
  let draft: { image: CroppedImage; strokes: object; response?: RecognitionResponse; questionId: string; runId: string } | null = null;
  let imageUrl: string | null = null;
  let activeRecognition: { id: string; runId: string; questionId: string } | null = null;
  const selected = new Set<string>();
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session") || crypto.randomUUID();
  if (role !== "single" && !params.has("session")) { params.set("session", sessionId); history.replaceState(null, "", `${location.pathname}?${params}`); }
  if (role !== "single") document.querySelector<HTMLAnchorElement>(".wordmark")!.href = `${location.pathname}?session=${encodeURIComponent(sessionId)}`;
  $<HTMLAnchorElement>("displayLink").href = `/display?session=${encodeURIComponent(sessionId)}`;
  $("displayLink").hidden = role === "display";
  const controllerLink = $<HTMLAnchorElement>("openControllerWaiting");
  controllerLink.href = `/controller?session=${encodeURIComponent(sessionId)}`;
  controllerLink.hidden = role !== "display";
  const channel = role === "single" ? null : new DualScreenChannel(new WebSocketTransport(sessionId, role), sessionId, role);
  const state = () => role === "controller" ? remote : session?.snapshot ?? null;
  const canInput = () => role !== "display" && modelReady && connected && !!state() && !state()!.paused;
  const publisher = new StatePublisher<Snapshot | null>(snapshot => channel?.send({ type: "exhibition-state", snapshot }));
  const controllerSnapshot = (): Snapshot | null => session ? toControllerSnapshot(session.snapshot) : null;
  const sendState = (force = false) => { if (role === "display") publisher.publish(controllerSnapshot(), force); };
  publishAnswerInk = (snapshot = pad.exportInkSnapshot(), force = false) => {
    if (role !== "controller" || !channel || !connected) return;
    const s = state();
    if (!s?.question || !["countdown", "writing", "recognizing", "preview", "judging"].includes(s.phase)) return;
    pendingInk = snapshot;
    const send = () => {
      inkTimer = null;
      const latest = pendingInk; pendingInk = null;
      if (latest && isSafeInkSnapshot(latest)) channel.send({ type: "ink-snapshot", runId: s.runId, questionId: s.question!.id, generation: inkGeneration, ink: latest });
      else if (latest) $("notice").textContent = "回答が長いため、モニターへの筆跡同期を停止しました。回答と読み取りは液タブで続けられます。";
    };
    if (force) { if (inkTimer) clearTimeout(inkTimer); send(); }
    else if (!inkTimer) inkTimer = setTimeout(send, 40);
  };
  const selectedLevel = () => Number($<HTMLSelectElement>("difficulty").value);
  const on = (id: string, action: () => void | Promise<void>) => $(id).addEventListener("click", () => {
    if (role !== "display") sound.playEffect("tap");
    void Promise.resolve().then(action).catch(showError);
  });
  function showError(error: unknown): void { const text = error instanceof Error ? error.message : String(error); $(state() && !["guide", "finished"].includes(state()!.phase) ? "notice" : "setupStatus").textContent = text; }
  function showSetupView(view: typeof setupView): void {
    setupView = view;
    selectedMode = view === "staff" ? "test" : "exhibition";
    lastRender = "";
    render();
    updateSetup();
    requestAnimationFrame(() => {
      const target = view === "home" ? "homeTitle" : view === "rules" ? "rulesTitle" : "setupTitle";
      $(target).tabIndex = -1;
      $(target).focus();
      window.scrollTo({ top: 0 });
    });
  }
  function releaseDraft(): void { draft = null; savedRequest = ""; if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; $<HTMLImageElement>("inkImage").removeAttribute("src"); }
  function updateSetup(): void {
    const pool = bank.filter(q => q.difficulty === selectedLevel());
    const eligible = pool.filter(q => q.exhibition_enabled && q.review_status === "approved");
    $("staffTools").hidden = setupView !== "staff";
    $("setupEyebrow").textContent = setupView === "staff" ? "STAFF TOOLS" : "SELECT LEVEL";
    $("setupTitle").textContent = setupView === "staff" ? "問題テスト" : "難易度をえらぼう";
    $("setupDescription").textContent = setupView === "staff" ? "確認したい問題を選び、認識や表示をテストします。" : "自分に合ったレベルを選んで、7問に挑戦しよう。";
    $("difficultyNumber").textContent = String(selectedLevel());
    $("difficultyName").textContent = difficultyLabels[selectedLevel() - 1] ?? "";
    $("poolSummary").textContent = selectedMode === "test" ? `${pool.length}問あります。テストする問題を下から選んでください。` : eligible.length >= EXHIBITION.questions ? "このレベルから7問が出題されます。" : "このレベルは準備中です。スタッフへ声をかけてください。";
    $("selectAllQuestions").textContent = `全${bank.length}問を選択`;
    $<HTMLButtonElement>("selectAllQuestions").disabled = bank.length === 0 || selected.size === bank.length;
    const ready = modelReady && bank.length > 0 && connected && (selectedMode === "test" ? selected.size > 0 : eligible.length >= EXHIBITION.questions);
    $<HTMLButtonElement>("showGuide").disabled = !ready;
    $("setupStatus").textContent = !bank.length || !modelReady ? "ゲームを準備しています。少しお待ちください。" : !connected ? "もう一方の画面を準備しています。" : selectedMode === "test" && !selected.size ? "テストする問題にチェックを入れてください。" : selectedMode === "exhibition" && eligible.length < EXHIBITION.questions ? "このレベルはまだ遊べません。別のレベルを選んでください。" : "準備OK！";
    $("selectionCount").textContent = `${selected.size}問選択中（選んだ順に出題）`;
    $("showGuide").textContent = selectedMode === "test" ? "選んだ問題をテスト" : "このレベルで進む";
  }
  function drawPicker(): void {
    const search = $<HTMLInputElement>("search").value.toLocaleLowerCase();
    const all = $<HTMLInputElement>("allLevels").checked, pending = $<HTMLInputElement>("onlyPending").checked;
    const matches = catalog.search(search, selectedLevel(), all, pending);
    const list = $("questionList"); list.replaceChildren();
    if (!matches.length) { list.textContent = "該当する問題がありません。検索条件を変更してください。"; }
    for (const q of matches) {
      const row = document.createElement("label"); row.className = "question-option";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = selected.has(q.id); check.setAttribute("aria-label", `${q.id} をテストする`);
      const content = document.createElement("span"), meta = document.createElement("small"), prompt = document.createElement("span");
      meta.textContent = `${q.id} · ${q.category} · ${reviewLabels[q.review_status ?? "pending"]}${q.exhibition_enabled ? " · 通常ゲーム候補" : ""}`;
      richText(q.prompt ?? q.display, prompt); content.append(meta, prompt); row.append(check, content); list.append(row);
      check.addEventListener("change", () => { if (check.checked) selected.add(q.id); else selected.delete(q.id); updateSetup(); });
    }
    updateSetup();
  }
  function scheduleControllerReady(s: Snapshot): void {
    if (role !== "controller" || s.phase !== "countdown" || !s.paused || !connected || !modelReady || !s.question) return;
    const readyKey = `${s.runId}:${s.question.id}`;
    if (pendingControllerReady === readyKey) return;
    pendingControllerReady = readyKey;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const current = state();
      if (!connected || !modelReady || current?.phase !== "countdown" || !current.paused || `${current.runId}:${current.question?.id}` !== readyKey) return;
      publishAnswerInk(undefined, true);
      channel?.send({ type: "exhibition-control", action: "controller-ready", runId: current.runId, questionId: current.question!.id });
    }));
  }
  function render(): void {
    const s = state();
    const phase = s?.phase ?? "setup";
    if (phase !== "countdown") pendingControllerReady = "";
    const previousPhase = document.body.dataset.phase;
    document.body.dataset.phase = phase;
    if (previousPhase !== phase) requestAnimationFrame(() => {
      if (document.body.dataset.phase !== phase) return;
      if (["recognizing", "preview", "judging"].includes(phase)) $("activityTitle").scrollIntoView({ block: "nearest" });
      const target = ({ setup: role === "display" ? "waitingTitle" : "homeTitle", guide: "guideTitle", countdown: "countdownTitle", result: "resultTitle", finished: "endTitle", writing: role === "display" ? "questionMeta" : "inputHeading" } as Record<string, string>)[phase];
      if (target) { const element = $(target); element.tabIndex = -1; element.focus(); if (phase === "result") element.scrollIntoView({ block: "start" }); }
    });
    if (previousPhase !== phase && (["setup", "guide", "finished"].includes(phase) || phase === "writing" && previousPhase === "guide")) window.scrollTo({ top: 0 });
    document.body.dataset.setupView = setupView;
    $("home").hidden = role === "display" || phase !== "setup" || setupView !== "home";
    $("rules").hidden = role === "display" || phase !== "setup" || setupView !== "rules";
    $("setup").hidden = role === "display" || phase !== "setup" || !["difficulty", "staff"].includes(setupView);
    $("waiting").hidden = role !== "display" || phase !== "setup";
    $("guide").hidden = phase !== "guide";
    $("guideBack").hidden = role === "display";
    $("begin").hidden = role === "display";
    $("play").hidden = ["setup", "guide", "finished"].includes(phase);
    $("finished").hidden = phase !== "finished";
    if (!s) return;
    const key = `${s.runId}:${s.question?.id}`;
    if (key !== lastQuestion) {
      lastQuestion = key; inkGeneration++;
      if (role !== "display") { pad.clear(); memoPad.clear(); activePaper = "answer"; }
      replicaGeneration = -1; replicaPad.clear(); releaseDraft(); lastPreview = ""; $("saveStatus").textContent = ""; $("reviewNotice").textContent = ""; window.scrollTo({ top: 0 });
    }
    $("modeName").textContent = s.mode === "test" ? "テストプレイ・時間制限なし" : "7問チャレンジ";
    text("round", `${s.round} / ${s.total}問`);
    text("correct", `正解 ${s.correct}`); text("streak", `連続 ${s.streak}`);
    $("lives").hidden = s.mode === "test"; text("lives", `残機 ${s.lives ?? 3} / 3`);
    $("time").hidden = s.mode === "test"; text("time", `${remainingSeconds(s.remainingMs)}秒${clockRunning(s) ? "" : " · 時計停止中"}`);
    $("time").dataset.paused = String(!clockRunning(s));
    const status = activity(s);
    $("activity").hidden = !status;
    text("activityTitle", status?.title ?? ""); text("activityDescription", status?.description ?? "");
    $("recognitionProgress").hidden = !status?.busy;
    $("timerTrack").hidden = s.mode === "test";
    $("timerFill").style.width = `${Math.max(0, s.remainingMs / (EXHIBITION.seconds * 10))}%`;
    $("timerTrack").dataset.urgent = String(s.remainingMs <= 5000);
    $("countdown").hidden = phase !== "countdown";
    if (phase === "countdown") {
      const seconds = Math.ceil(s.countdownRemainingMs / 1000);
      $("countdownTitle").textContent = s.paused ? "入力画面を準備中" : seconds > 0 ? String(seconds) : "スタート";
      $("countdownDescription").textContent = s.paused ? "用紙の準備が整うまで、問題と時計は開始しません。" : "モニターを見て、ペンを構えてください。";
      scheduleControllerReady(s);
    }
    if (phase === "guide") {
      $("guideTitle").textContent = s.mode === "test" ? "テストプレイ・データ収集" : "ゲームの遊び方";
      $("guideDescription").textContent = s.mode === "test" ? `選択した${s.total}問を、選んだ順にテストします。` : `${s.question?.difficulty_label ?? "選んだ難易度"}の問題から${s.total}問に挑戦します。`;
      $("guideRules").textContent = s.mode === "test" ? "時間制限・残機はありません。同じ問題を何度でもテストできます。" : "1問20秒。時間切れになると残機が1つ減ります。";
      $("guidePrivacy").textContent = s.mode === "test" ? "データは自動保存しません。同意して確認した回答だけ、このPCへ保存できます。メモは保存されません。" : "";
      $("guidePrivacy").hidden = s.mode !== "test";
    }
    const prompt = $("prompt"), space = prompt.parentElement!;
    const timed = s.mode === "exhibition" && ["writing", "recognizing", "preview", "judging"].includes(s.phase);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = !reducedMotion && timed && (s.question?.prompt ?? "").length < 48
      ? formulaScale(prompt.offsetWidth, prompt.offsetHeight, space.clientWidth, space.clientHeight, s.remainingMs / (EXHIBITION.seconds * 1000)) : 1;
    prompt.style.transform = `scale(${scale})`;
    const second = Math.ceil(s.remainingMs / 1000), soundKey = `${s.runId}:${s.round}:${second}`;
    if (role !== "controller" && clockRunning(s) && second > 0 && second <= 5 && lastSound !== soundKey) { lastSound = soundKey; sound.playUrgency(second); }
    const renderKey = `${key}:${phase}:${s.notice}:${s.recognition?.request_id}:${s.judgement?.correct}:${s.paused}:${connected}:${modelReady}`;
    if (renderKey === lastRender) return; lastRender = renderKey;
    const q = s.question!;
    if (role !== "controller" && phase !== "countdown") {
      $("questionMeta").textContent = `${q.difficulty_label} · ${q.category}${s.mode === "test" ? ` · ${q.id}` : ""}`;
      richText(q.prompt ?? `${q.instruction}\n$${q.display_latex}$`, $("prompt"));
      $("prompt").classList.toggle("short-prompt", (q.prompt ?? q.display).length < 48);
    } else { $("questionMeta").textContent = ""; $("prompt").replaceChildren(); }
    $("problemPane").hidden = role === "controller" || phase === "countdown" || phase === "result";
    $("answerReplica").hidden = !answerReplicaVisible(role, phase);
    $("inputPane").hidden = role === "display" || phase === "result" && !draft?.response;
    $("notice").hidden = !playNoticeVisible(role, phase);
    $("notice").textContent = playNotice(s, role, connected, activePaper);
    const writing = phase === "writing", preview = phase === "preview";
    $("padWrap").hidden = activePaper !== "answer" || !["countdown", "writing", "recognizing"].includes(phase);
    $("memoWrap").hidden = activePaper !== "memo" || !writing;
    $("paperSwitch").hidden = !writing;
    $("showAnswer").setAttribute("aria-pressed", String(activePaper === "answer"));
    $("showMemo").setAttribute("aria-pressed", String(activePaper === "memo"));
    $("paperTitle").textContent = activePaper === "answer" ? "回答を書く" : "採点されないメモ";
    $("backToAnswer").hidden = activePaper !== "memo";
    $("recognize").hidden = activePaper === "memo";
    $("inputHeading").hidden = !writing && phase !== "recognizing";
    $("editActions").hidden = !writing && phase !== "recognizing";
    $("inputActions").hidden = !["writing", "recognizing", "preview", "judging"].includes(phase);
    $("resultActions").hidden = role === "display";
    $("stop").hidden = role === "display";
    pad.setDisabled(!writing || !canInput() || busy || activePaper !== "answer");
    memoPad.setDisabled(!writing || !canInput() || busy || activePaper !== "memo");
    for (const id of ["undo", "clear", "recognize"]) $<HTMLButtonElement>(id).disabled = !writing || !canInput() || busy;
    $<HTMLButtonElement>("confirm").disabled = !preview || !canInput() || busy;
    $<HTMLButtonElement>("rewrite").disabled = !preview || !canInput() || busy;
    $("writingActions").hidden = !writing && phase !== "recognizing";
    $("previewActions").hidden = !preview && phase !== "judging";
    $("preview").hidden = !["preview", "judging", "result"].includes(phase) || role === "display" || !draft?.response;
    $("recognitionDetails").hidden = s.mode !== "test";
    $("result").hidden = phase !== "result";
    $("resultQuestion").hidden = role === "controller";
    $("resultAnswer").hidden = role === "controller" || s.timedOut || !s.recognition;
    $("solution").hidden = role === "controller";
    $("controllerResultHint").hidden = role !== "controller";
    if (phase === "result" && role !== "controller") {
      richText(q.prompt ?? `${q.instruction}\n$${q.display_latex}$`, $("resultPrompt"));
      if (!s.timedOut && s.recognition) renderMath(s.recognition.raw_latex, $("resultRecognized"));
    }
    if (phase === "result" && s.timedOut) {
      $("resultTitle").textContent = role === "controller" ? "モニターで結果を確認" : "時間切れ · 残機 −1";
      $("expected").textContent = "正答を読み込んでいます。"; $("explanation").textContent = "";
      if (role !== "controller") void loadTimeoutSolution(s);
    }
    $("retryTest").hidden = s.mode !== "test" || role === "display";
    $("next").hidden = role === "display";
    $("next").textContent = s.round === s.total ? "結果を見る" : "次の問題へ";
    if (s.recognition && s.recognition.request_id !== lastPreview) {
      lastPreview = s.recognition.request_id; renderMath(s.recognition.raw_latex, $("recognized"));
      $("rawLatex").textContent = s.recognition.raw_latex;
      $("timing").textContent = `認識 ${s.recognition.timing.inference_ms.toFixed(0)} ms / 全体 ${s.recognition.timing.total_ms.toFixed(0)} ms · ${s.recognition.device}`;
      $<HTMLInputElement>("transcription").value = s.recognition.raw_latex;
      renderMath(s.recognition.raw_latex, $("transcriptionPreview"));
      $<HTMLInputElement>("labelConfirmed").checked = false; $<HTMLInputElement>("consent").checked = false;
      $<HTMLButtonElement>("saveSample").disabled = false;
      $("saveStatus").textContent = "まだ保存していません。画像とラベルを確認してください。";
    }
    if (preview && role !== "display" && !busy && canInput() && s.recognition?.request_id !== lastFocusedPreview) {
      lastFocusedPreview = s.recognition!.request_id; $("confirm").focus({ preventScroll: true });
    }
    const canCollect = s.mode === "test" && role !== "display" && !!draft?.response && ["preview", "result"].includes(phase);
    $("collection").hidden = !canCollect;
    $("review").hidden = s.mode !== "test" || phase !== "result" || role === "display";
    if (phase === "result" && s.judgement) {
      $("resultTitle").textContent = role === "controller" ? "モニターで結果を確認" : s.judgement.correct ? "正解！" : "正答候補とは一致しませんでした";
      if (role !== "controller") { renderMath(s.judgement.expected_latex, $("expected")); richText(s.judgement.explanation, $("explanation")); }
      if (role !== "display") { $<HTMLSelectElement>("reviewStatus").value = q.review_status ?? "pending"; $<HTMLInputElement>("exhibitionEnabled").checked = !!q.exhibition_enabled; }
    }
    if (phase === "finished") {
      releaseDraft(); $("endTitle").textContent = s.endReason === "completed" ? "全問完了！" : s.endReason === "timeout" ? "残機0 · プレイ終了" : "プレイ終了";
      $("endReason").textContent = role === "controller" ? "モニターで最終結果を確認できます。" : s.notice;
      const seen = s.endReason === "completed" ? s.total : s.round;
      $("endStats").textContent = `${seen}問中 ${s.correct}問正解 · 正解率 ${Math.round(s.correct / seen * 100)}%`;
      $("endAttempts").textContent = s.mode === "test"
        ? `テストした問題 ${seen}問 · 回答 ${s.attempts}回 · 不正解 ${s.wrongAttempts}回`
        : `挑戦した問題 ${seen}問 · 残機 ${s.lives} / 3`;
      $("endStats").hidden = role === "controller";
      $("endAttempts").hidden = role === "controller";
      $("backToSetup").hidden = role === "display";
      $("restart").hidden = role === "display";
      $("backHome").hidden = role === "display";
    }
    if (previousPhase !== phase && previousPhase) {
      if (role !== "controller" && phase === "writing" && previousPhase === "countdown") sound.playEffect("start");
      else if (role !== "controller" && phase === "result") sound.playEffect(s.timedOut ? "timeout" : s.judgement?.correct ? "correct" : "wrong");
      else if (role !== "controller" && phase === "finished") sound.playEffect("finish");
      else if (role !== "controller" && phase === "writing" && previousPhase === "judging") sound.playEffect("wrong");
    }
  }

  async function action(action: "recognize" | "confirm" | "rewrite" | "next" | "retry-test" | "stop", data: { requestId?: string; response?: RecognitionResponse; error?: string } = {}): Promise<void> {
    const s = state(); if (!s?.question) return;
    if (saveBusy && action !== "recognize") return;
    if (role === "controller") { channel?.send({ type: "exhibition-action", action, runId: s.runId, questionId: s.question.id, ...data }); return; }
    if (!session) return;
    if (action === "recognize") {
      if (data.error) session.fail(data.requestId!, data.error);
      else if (data.response) session.recognized(data.requestId!, data.response);
      else session.beginRecognition(data.requestId!);
    } else if (action === "confirm") {
      const requestId = crypto.randomUUID(); const recognition = s.recognition;
      if (!recognition || !session.beginJudge(requestId)) return;
      render(); sendState();
      const current = session;
      try { const result = await client.judge(s.question.id, recognition.raw_latex); if (session === current) session.judged(requestId, result); }
      catch (e) { if (session === current) session.fail(requestId, `判定できませんでした。もう一度回答を送れます。${String(e)}`); }
    } else if (action === "rewrite") { session.rewrite(); }
    else if (action === "next") { if (saveBusy) return; session.next(role === "display"); if (role === "single" && session.snapshot.phase === "countdown") session.readyForCountdown(); }
    else if (action === "retry-test") { session.retryTest(role === "display"); if (role === "single" && session.snapshot.phase === "countdown") session.readyForCountdown(); }
    else if (action === "stop") { session.finish("stopped"); }
    render(); sendState();
    if (session.snapshot.phase === "finished") await loadLastSolution(session.snapshot);
  }
  async function loadLastSolution(s: Snapshot): Promise<void> {
    $("endSolution").hidden = true;
    if (!s.question || s.endReason === "completed") return;
    const runId = s.runId;
    try {
      const solution = await client.fetchSolution(s.question.id);
      if (state()?.runId !== runId || state()?.phase !== "finished") return;
      richText(s.question.prompt ?? s.question.display, $("lastPrompt")); renderMath(solution.expected_latex, $("lastAnswer")); richText(solution.explanation, $("lastExplanation")); $("endSolution").hidden = false;
    } catch { $("endAttempts").textContent += " 正答の取得に失敗しました。スタッフへお知らせください。"; }
  }
  async function loadTimeoutSolution(s: Snapshot): Promise<void> {
    const questionId = s.question!.id, runId = s.runId;
    try {
      const solution = await client.fetchSolution(questionId);
      const current = state();
      if (current?.runId !== runId || current.question?.id !== questionId || current.phase !== "result" || !current.timedOut) return;
      renderMath(solution.expected_latex, $("expected")); richText(solution.explanation, $("explanation"));
    } catch { if (state()?.runId === runId && state()?.phase === "result" && state()?.question?.id === questionId) $("explanation").textContent = "正答を取得できませんでした。次へ進むか、スタッフへお知らせください。"; }
  }
  async function recognize(): Promise<void> {
    const s = state(); if (!s?.question || s.phase !== "writing" || !canInput() || busy) return;
    if (!pad.hasInk) { $("notice").textContent = "白い欄に答えを書いてから押してください。"; return; }
    busy = true; pad.setDisabled(true);
    const context = { id: crypto.randomUUID(), runId: s.runId, questionId: s.question.id }; activeRecognition = context;
    try {
      await action("recognize", { requestId: context.id });
      const image = await pad.toCroppedPng();
      releaseDraft(); draft = { image, strokes: pad.exportStrokes(image.crop), runId: s.runId, questionId: s.question.id };
      imageUrl = URL.createObjectURL(image.blob); $<HTMLImageElement>("inkImage").src = imageUrl;
      const response = await client.recognize(image.blob, context.id);
      if (activeRecognition !== context || state()?.runId !== context.runId || state()?.question?.id !== context.questionId) return;
      draft.response = response; await action("recognize", { requestId: context.id, response });
    } catch (e) { if (activeRecognition === context) await action("recognize", { requestId: context.id, error: `読み取りに失敗しました。書いた内容は残っています。もう一度お試しください。${String(e)}` }); }
    finally { if (activeRecognition === context) { activeRecognition = null; busy = false; lastRender = ""; render(); } }
  }
  channel?.subscribe(message => {
    if (role === "controller" && message.type === "exhibition-state") {
      const previous = remote; remote = message.snapshot;
      if (!remote || remote.runId !== previous?.runId || remote.phase === "finished" || remote.phase === "setup" || remote.phase === "writing" && previous?.phase === "recognizing") { activeRecognition = null; busy = false; }
      render();
    } else if (role === "controller" && message.type === "setup-error") {
      $("setupStatus").textContent = message.message;
    } else if (role === "display" && message.type === "exhibition-action") {
      const s = session?.snapshot;
      if (!s || message.runId !== s.runId || message.questionId !== s.question?.id || !connected) return;
      void action(message.action, message);
    } else if (role === "display" && message.type === "exhibition-control") {
      if (message.action === "configure") {
        try {
          if (!modelReady) throw new Error("認識モデルの準備が終わるまでお待ちください。");
          if (!(["exhibition", "test"] as unknown[]).includes(message.mode) || !Number.isInteger(message.difficulty) || message.difficulty < 1 || message.difficulty > 7 || !Array.isArray(message.questionIds) || message.questionIds.length > bank.length || message.questionIds.some(id => typeof id !== "string")) throw new Error("設定内容が正しくありません。入力画面を再読み込みしてください。");
          const difficulty = Math.trunc(message.difficulty);
          const questions = message.mode === "test"
            ? message.questionIds.map(id => bank.find(q => q.id === id)).filter((q): q is Question => Boolean(q))
            : chooseExhibition(bank, difficulty);
          if (message.mode === "test" && questions.length !== message.questionIds.length) throw new Error("選択した問題を確認できませんでした。問題データを再読み込みしてください。");
          if (message.mode === "exhibition" && questions.length !== EXHIBITION.questions) throw new Error(`レベル${difficulty}の通常ゲーム候補が${EXHIBITION.questions}問必要です。`);
          if (!questions.length) throw new Error("出題する問題を選んでください。");
          session = new Session(questions, message.mode); lastRender = ""; render(); sendState(true);
        } catch (error) {
          channel.send({ type: "setup-error", message: error instanceof Error ? error.message : String(error) });
        }
      } else if (message.action === "back-to-setup") {
        session = null; releaseDraft(); lastRender = ""; render(); sendState(true);
      } else if (message.action === "begin-countdown") {
        if (!session || message.runId !== session.snapshot.runId || !connected || !modelReady) return;
        if (session.beginCountdown(3_000)) { render(); sendState(true); }
      } else if (message.action === "controller-ready") {
        if (!session || message.runId !== session.snapshot.runId || message.questionId !== session.snapshot.question?.id || !connected) return;
        if (session.readyForCountdown()) { render(); sendState(true); }
      }
    } else if (role === "display" && message.type === "ink-snapshot") {
      const s = session?.snapshot;
      if (!s?.question || message.runId !== s.runId || message.questionId !== s.question.id || !isSafeInkSnapshot(message.ink)) return;
      if (message.generation < replicaGeneration) return;
      replicaGeneration = message.generation;
      replicaPad.importInkSnapshot(message.ink);
      $("replicaStatus").textContent = connected ? "入力画面の回答を同期中" : "同期停止中";
    } else if (role === "display" && message.type === "hello") {
      if (controllerConnectionId !== null && controllerConnectionId !== message.connectionId) {
        session?.cancelRecognition();
        // A replacement tab has no original PNG. Never ask it to confirm an
        // orphaned preview that it cannot visually verify.
        if (session?.snapshot.phase === "preview") session.rewrite();
      }
      controllerConnectionId = message.connectionId; sendState(true);
    } else if (role === "controller" && message.type === "hello") {
      publishAnswerInk(undefined, true);
    }
  });
  channel?.subscribeConnection(connection => {
    connected = connection.connected;
    const connectionText = connectionCopy(connection, role === "display" ? "display" : "controller");
    text("connection", connectionText);
    text("waitingMessage", connection.rejectionReason || connection.incompatible ? connectionText : role === "display" ? "液タブでモードと問題を選んでください。" : "問題表示画面との接続を待っています。");
    if (role === "display" && session) {
      if (!connected && session.snapshot.phase === "countdown") session.cancelCountdown();
      else session.pause(!connected);
      if (!connected && session.snapshot.phase === "recognizing" && activeRecognition === null) {
        // A controller may disappear during inference. Invalidate its result and
        // resume writing on reconnect instead of leaving an unrecoverable spinner.
        session.cancelRecognition();
      }
      sendState();
    }
    $("replicaStatus").textContent = connected ? "入力画面の回答を同期中" : "同期停止中 · 再接続すると回答全体を取り直します";
    if (!connected) { activeRecognition = null; busy = false; pendingControllerReady = ""; }
    updateSetup(); lastRender = ""; render();
  });
  channel?.start();
  window.addEventListener("pagehide", () => channel?.close());
  $("difficulty").addEventListener("change", drawPicker);
  for (const id of ["search", "allLevels", "onlyPending"]) $(id).addEventListener(id === "search" ? "input" : "change", drawPicker);
  on("clearSelection", () => { selected.clear(); drawPicker(); });
  on("selectAllQuestions", () => { selected.clear(); for (const question of bank) selected.add(question.id); drawPicker(); });
  on("startGame", () => showSetupView("difficulty"));
  on("showRules", () => showSetupView("rules"));
  on("rulesHome", () => showSetupView("home"));
  on("rulesContinue", () => showSetupView("difficulty"));
  on("openStaffTools", () => { showSetupView("staff"); drawPicker(); });
  on("setupHome", () => showSetupView("home"));
  on("showGuide", () => {
    const questions = selectedMode === "test" ? catalog.selected(selected) : chooseExhibition(bank, selectedLevel());
    if (!modelReady || !connected || !questions.length) return;
    if (role === "controller") {
      $("setupStatus").textContent = "問題表示画面で設定を確認しています。";
      channel?.send({ type: "exhibition-control", action: "configure", mode: selectedMode, difficulty: selectedLevel(), questionIds: selectedMode === "test" ? questions.map(q => q.id) : [] });
    } else {
      session = new Session(questions, selectedMode); lastRender = ""; render(); sendState();
    }
  });
  on("guideBack", () => {
    if (role === "controller") channel?.send({ type: "exhibition-control", action: "back-to-setup", runId: state()?.runId });
    else { session = null; render(); sendState(); updateSetup(); }
    showSetupView(selectedMode === "test" ? "staff" : "difficulty");
  });
  on("begin", () => {
    if (!connected || !modelReady) return;
    if (role === "controller") channel?.send({ type: "exhibition-control", action: "begin-countdown", runId: state()?.runId });
    else if (session?.beginCountdown(3_000)) { session.readyForCountdown(); render(); sendState(); }
  });
  const selectedPad = () => activePaper === "memo" ? memoPad : pad;
  on("undo", () => selectedPad().undo()); on("clear", () => selectedPad().clear()); on("recognize", recognize);
  on("showAnswer", () => { activePaper = "answer"; lastRender = ""; render(); });
  on("showMemo", () => { if (state()?.phase !== "writing") return; activePaper = "memo"; lastRender = ""; render(); });
  on("backToAnswer", () => { activePaper = "answer"; lastRender = ""; render(); });
  on("rewrite", async () => { await action("rewrite"); if (state()?.phase === "writing") { pad.clear(); releaseDraft(); } });
  on("confirm", () => action("confirm")); on("next", () => action("next"));
  on("retryTest", async () => { await action("retry-test"); pad.clear(); memoPad.clear(); activePaper = "answer"; releaseDraft(); lastPreview = ""; });
  on("stop", () => { if (saveBusy) { $("notice").textContent = "保存処理が終わるまでお待ちください。"; return; } return action("stop"); });
  on("backToSetup", () => {
    setupView = selectedMode === "test" ? "staff" : "difficulty";
    if (role === "controller") channel?.send({ type: "exhibition-control", action: "back-to-setup", runId: state()?.runId });
    else { session = null; releaseDraft(); lastRender = ""; render(); sendState(); }
    void client.fetchQuestions().then(qs => { setBank(qs); drawPicker(); }).catch(showError);
  });
  on("backHome", () => {
    setupView = "home";
    selectedMode = "exhibition";
    if (role === "controller") channel?.send({ type: "exhibition-control", action: "back-to-setup", runId: state()?.runId });
    else { session = null; releaseDraft(); lastRender = ""; render(); sendState(); }
  });
  on("restart", () => {
    const questions = selectedMode === "test" ? catalog.selected(selected) : chooseExhibition(bank, selectedLevel());
    if (!questions.length) return;
    if (role === "controller") channel?.send({ type: "exhibition-control", action: "configure", mode: selectedMode, difficulty: selectedLevel(), questionIds: selectedMode === "test" ? questions.map(q => q.id) : [] });
    else { session = new Session(questions, selectedMode); releaseDraft(); lastRender = ""; render(); sendState(true); }
  });
  on("fullscreen", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $("modelStatus").textContent = "全画面にできませんでした。ブラウザーの全画面操作をお試しください。"; } });
  document.addEventListener("fullscreenchange", () => { $("fullscreen").textContent = document.fullscreenElement ? "全画面を終了" : "全画面"; });
  $("transcription").addEventListener("input", () => { renderMath($<HTMLInputElement>("transcription").value, $("transcriptionPreview")); $<HTMLInputElement>("labelConfirmed").checked = false; });
  on("saveSample", async () => {
    if (!draft?.response || saveBusy || savedRequest === draft.response.request_id || state()?.mode !== "test") return;
    if (!$<HTMLInputElement>("labelConfirmed").checked || !$<HTMLInputElement>("consent").checked || !$<HTMLInputElement>("transcription").value.trim()) { $("saveStatus").textContent = "書いた内容のLaTeXと、2つの確認・同意チェックが必要です。"; return; }
    const savingDraft = draft;
    saveBusy = true; $<HTMLButtonElement>("saveSample").disabled = true;
    for (const id of ["next", "retryTest", "rewrite", "confirm", "stop"]) $<HTMLButtonElement>(id).disabled = true;
    const form = new FormData(); form.append("image", draft.image.blob, "handwriting.png"); form.append("strokes_json", JSON.stringify(draft.strokes));
    form.append("question_id", draft.questionId); form.append("ground_truth_latex", $<HTMLInputElement>("transcription").value);
    form.append("recognized_latex", draft.response.raw_latex); form.append("recognition_request_id", draft.response.request_id);
    form.append("writer_id", $<HTMLInputElement>("writerId").value || "anonymous"); form.append("consent", "true"); form.append("label_confirmed", "true");
    try { const result = await client.saveSample(form); savedRequest = savingDraft.response!.request_id; $("saveStatus").textContent = `保存しました：${result.sample_id}（学習候補・未学習）`; }
    catch (e) { $("saveStatus").textContent = `保存できませんでした。画像は残っています。${String(e)}`; }
    finally { saveBusy = false; for (const id of ["next", "retryTest", "rewrite", "confirm", "stop"]) $<HTMLButtonElement>(id).disabled = false; $<HTMLButtonElement>("saveSample").disabled = savedRequest === draft?.response?.request_id; lastRender = ""; render(); }
  });
  on("saveReview", async () => {
    const q = state()?.question; if (!q || role === "display") return;
    const status = $<HTMLSelectElement>("reviewStatus").value, enabled = $<HTMLInputElement>("exhibitionEnabled").checked;
    if (enabled && status !== "approved") { $("reviewNotice").textContent = "通常ゲームの候補にするには確認状況を「確認済み」にしてください。"; return; }
    $<HTMLButtonElement>("saveReview").disabled = true;
    try { const result = await client.reviewQuestion(q.id, status, enabled); Object.assign(q, result); setBank(bank.map(item => item.id === q.id ? result : item)); $("reviewNotice").textContent = "保存しました。次のプレイから反映されます。"; sendState(); }
    catch (e) { $("reviewNotice").textContent = `保存できませんでした。${String(e)}`; } finally { $<HTMLButtonElement>("saveReview").disabled = false; }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.repeat || (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, button, a, summary"))) return;
    if (state()?.phase === "writing") { event.preventDefault(); void recognize(); }
    else if (state()?.phase === "preview") { event.preventDefault(); void action("confirm"); }
  });
  setInterval(() => { if (role !== "controller" && session) { const expired = session.tick(); render(); sendState(); if (expired) void loadLastSolution(session.snapshot); } }, 100);
  render(); updateSetup();
  void client.fetchQuestions().then(questions => { setBank(questions); drawPicker(); }).catch(e => { $("setupStatus").textContent = `問題を取得できません。ページを更新してください。${String(e)}`; });
  void client.beginPreload().then(() => client.waitUntilReady(() => {})).then(() => { modelReady = true; $("modelStatus").textContent = "準備OK"; updateSetup(); lastRender = ""; render(); }).catch(() => { $("modelStatus").textContent = "準備できませんでした。スタッフへお知らせください。"; });
}
