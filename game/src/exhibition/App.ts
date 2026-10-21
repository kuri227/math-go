import "@fontsource-variable/m-plus-1";
import "katex/dist/katex.min.css";
import "./app.css";
import { RecognitionClient } from "../api/RecognitionClient";
import { HandwritingPad, type CroppedImage } from "../ui/HandwritingPad";
import { renderMath } from "../ui/renderMath";
import { richText } from "./richText";
import { Session, chooseExhibition, EXHIBITION, type Mode, type Snapshot } from "./Session";
import type { Question, RecognitionResponse } from "../domain/types";
import { DualScreenChannel } from "../dual-screen/DualScreenChannel";
import { BroadcastChannelTransport } from "../dual-screen/BroadcastChannelTransport";
import { formulaScale } from "../game/formulaLayout";
import { UrgencySound } from "../ui/UrgencySound";
import { StatePublisher } from "../dual-screen/StatePublisher";
import { byId as $, text } from "./dom";

import { appMarkup, type Role } from "./view";
import { DIFFICULTY_LABELS as labels, REVIEW_LABELS as reviewLabels, QuestionCatalog } from "./catalog";

export function runApp(role: Role): void {
  document.body.dataset.role = role;
  $("app").innerHTML = appMarkup(role);

  const client = new RecognitionClient();
  const sound = new UrgencySound();
  $("sound").textContent = sound.isEnabled ? "警告音 ON" : "警告音 OFF";
  $("sound").hidden = role === "controller";
  let lastSound = "";
  const pad = new HandwritingPad($<HTMLCanvasElement>("pad"), $("padHint"), $("pointer"));
  let bank: Question[] = [], modelReady = false, connected = role === "single";
  let catalog = new QuestionCatalog(bank);
  const setBank = (questions: Question[]) => { bank = questions; catalog = new QuestionCatalog(bank); };
  let selectedMode: Mode = "exhibition", session: Session | null = null, remote: Snapshot | null = null;
  let lastRender = "", lastQuestion = "", lastPreview = "", busy = false, saveBusy = false, savedRequest = "";
  let lastFocusedPreview = "", controllerConnectionId: string | null = null;
  let draft: { image: CroppedImage; strokes: object; response?: RecognitionResponse; questionId: string; runId: string } | null = null;
  let imageUrl: string | null = null;
  let activeRecognition: { id: string; runId: string; questionId: string } | null = null;
  const selected = new Set<string>();
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("session") || crypto.randomUUID();
  if (role !== "single" && !params.has("session")) { params.set("session", sessionId); history.replaceState(null, "", `${location.pathname}?${params}`); }
  if (role !== "single") document.querySelector<HTMLAnchorElement>(".wordmark")!.href = `${location.pathname}?session=${encodeURIComponent(sessionId)}`;
  $<HTMLAnchorElement>("displayLink").href = `/display?session=${encodeURIComponent(sessionId)}`;
  const channel = role === "single" ? null : new DualScreenChannel(new BroadcastChannelTransport(`math-go:v2:${sessionId}`), sessionId, role);
  const state = () => role === "controller" ? remote : session?.snapshot ?? null;
  const canInput = () => role !== "display" && modelReady && connected && !!state() && !state()!.paused;
  const publisher = new StatePublisher<Snapshot | null>(snapshot => channel?.send({ type: "exhibition-state", snapshot }));
  const sendState = (force = false) => { if (role === "display") publisher.publish(session?.snapshot ?? null, force); };
  const selectedLevel = () => Number($<HTMLSelectElement>("difficulty").value);
  const on = (id: string, action: () => void | Promise<void>) => $(id).addEventListener("click", () => { void Promise.resolve().then(action).catch(showError); });
  function showError(error: unknown): void { const text = error instanceof Error ? error.message : String(error); $(state() && !["guide", "finished"].includes(state()!.phase) ? "notice" : "setupStatus").textContent = text; }
  function releaseDraft(): void { draft = null; savedRequest = ""; if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; $<HTMLImageElement>("inkImage").removeAttribute("src"); }
  function updateSetup(): void {
    const pool = bank.filter(q => q.difficulty === selectedLevel());
    const eligible = pool.filter(q => q.exhibition_enabled && q.review_status === "approved");
    $("questionPicker").hidden = selectedMode !== "test";
    $("poolSummary").textContent = `${pool.length}問中、本番候補 ${eligible.length}問。テストプレイでは未確認の問題も選べます。`;
    const ready = modelReady && bank.length > 0 && connected && (selectedMode === "test" ? selected.size > 0 : eligible.length >= EXHIBITION.questions);
    $<HTMLButtonElement>("showGuide").disabled = !ready;
    $("setupStatus").textContent = !bank.length ? "問題データを読み込み中です。" : !modelReady ? "認識モデルを準備しています。" : !connected ? "入力画面を開いて接続してください。" : selectedMode === "test" && !selected.size ? "テストする問題にチェックを入れてください。" : selectedMode === "exhibition" && eligible.length < EXHIBITION.questions ? `本番候補が${EXHIBITION.questions}問必要です。テストプレイで確認して追加してください。` : "準備できました。遊び方を確認して始めましょう。";
    $("selectionCount").textContent = `${selected.size}問選択中（選んだ順に出題）`;
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
      meta.textContent = `${q.id} · ${q.category} · ${reviewLabels[q.review_status ?? "pending"]}${q.exhibition_enabled ? " · 本番候補" : ""}`;
      richText(q.prompt ?? q.display, prompt); content.append(meta, prompt); row.append(check, content); list.append(row);
      check.addEventListener("change", () => { if (check.checked) selected.add(q.id); else selected.delete(q.id); updateSetup(); });
    }
    updateSetup();
  }
  function render(): void {
    const s = state();
    const phase = s?.phase ?? "setup";
    const previousPhase = document.body.dataset.phase;
    document.body.dataset.phase = phase;
    if (previousPhase !== phase) requestAnimationFrame(() => {
      if (document.body.dataset.phase !== phase) return;
      const target = ({ setup: role === "controller" ? "waitingMessage" : "setupTitle", guide: role === "controller" ? "waitingMessage" : "guideTitle", result: "resultTitle", finished: "endTitle", writing: role === "display" ? "questionMeta" : "inputHeading" } as Record<string, string>)[phase];
      if (target) { const element = $(target); element.tabIndex = -1; element.focus(); if (phase === "result") element.scrollIntoView({ block: "start" }); }
    });
    if (previousPhase !== phase && (["setup", "guide", "finished"].includes(phase) || phase === "writing" && previousPhase === "guide")) window.scrollTo({ top: 0 });
    $("setup").hidden = role === "controller" || phase !== "setup";
    $("waiting").hidden = role !== "controller" || !["setup", "guide"].includes(phase);
    $("guide").hidden = role === "controller" || phase !== "guide";
    $("play").hidden = ["setup", "guide", "finished"].includes(phase);
    $("finished").hidden = phase !== "finished";
    if (!s) return;
    const key = `${s.runId}:${s.question?.id}`;
    if (key !== lastQuestion) { lastQuestion = key; pad.clear(); releaseDraft(); lastPreview = ""; $("saveStatus").textContent = ""; $("reviewNotice").textContent = ""; window.scrollTo({ top: 0 }); }
    $("modeName").textContent = s.mode === "test" ? "テストプレイ・時間制限なし" : "本番体験";
    text("round", `${s.round} / ${s.total}問`);
    text("correct", `正解 ${s.correct}`); text("streak", `連続 ${s.streak}`);
    $("lives").hidden = s.mode === "test"; text("lives", `残機 ${s.lives ?? 3} / 3`);
    $("time").hidden = s.mode === "test"; text("time", `${(s.remainingMs / 1000).toFixed(1)}秒${s.paused || ["recognizing", "judging", "result"].includes(s.phase) ? "（停止中）" : ""}`);
    $("timerTrack").hidden = s.mode === "test";
    $("timerFill").style.width = `${Math.max(0, s.remainingMs / (EXHIBITION.seconds * 10))}%`;
    $("timerTrack").dataset.urgent = String(s.remainingMs <= 5000);
    const prompt = $("prompt"), space = prompt.parentElement!;
    const timed = s.mode === "exhibition" && ["writing", "recognizing", "preview", "judging"].includes(s.phase);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = !reducedMotion && timed && (s.question?.prompt ?? "").length < 48
      ? formulaScale(prompt.offsetWidth, prompt.offsetHeight, space.clientWidth, space.clientHeight, s.remainingMs / (EXHIBITION.seconds * 1000)) : 1;
    prompt.style.transform = `scale(${scale})`;
    const second = Math.ceil(s.remainingMs / 1000), soundKey = `${s.runId}:${s.round}:${second}`;
    if (role !== "controller" && timed && !s.paused && ["writing", "preview"].includes(s.phase) && second > 0 && second <= 5 && lastSound !== soundKey) { lastSound = soundKey; sound.play(second); }
    const renderKey = `${key}:${phase}:${s.notice}:${s.recognition?.request_id}:${s.judgement?.correct}:${s.paused}:${connected}:${modelReady}`;
    if (renderKey === lastRender) return; lastRender = renderKey;
    const q = s.question!;
    $("questionMeta").textContent = `${q.difficulty_label} · ${q.category}${s.mode === "test" ? ` · ${q.id}` : ""}`;
    richText(q.prompt ?? `${q.instruction}\n$${q.display_latex}$`, $("prompt"));
    $("prompt").classList.toggle("short-prompt", (q.prompt ?? q.display).length < 48);
    $("problemPane").hidden = role === "controller";
    $("inputPane").hidden = role === "display" || phase === "result" && !draft?.response;
    $("notice").textContent = !connected ? "相手の画面との接続が切れました。再接続まで時計を止めています。" : s.paused ? "入力画面を再接続してください。時計を止めています。" : s.notice || (role === "display" ? "入力画面に答えを書き、読み取りを確認してから回答してください。" : "答えを書いて「読み取りを確認」を押してください。");
    const writing = phase === "writing", preview = phase === "preview";
    $("padWrap").hidden = !writing && phase !== "recognizing";
    $("inputHeading").hidden = !writing && phase !== "recognizing";
    $("editActions").hidden = !writing && phase !== "recognizing";
    $("inputActions").hidden = !["writing", "recognizing", "preview", "judging"].includes(phase);
    $("resultActions").hidden = role === "display";
    pad.setDisabled(!writing || !canInput() || busy);
    for (const id of ["undo", "clear", "recognize"]) $<HTMLButtonElement>(id).disabled = !writing || !canInput() || busy;
    $<HTMLButtonElement>("confirm").disabled = !preview || !canInput() || busy;
    $<HTMLButtonElement>("rewrite").disabled = !preview || !canInput() || busy;
    $("writingActions").hidden = !writing && phase !== "recognizing";
    $("previewActions").hidden = !preview && phase !== "judging";
    $("preview").hidden = !["preview", "judging", "result"].includes(phase) || role === "display" || !draft?.response;
    $("result").hidden = phase !== "result";
    if (phase === "result" && s.timedOut) {
      $("resultTitle").textContent = "時間切れ · 残機 −1";
      $("expected").textContent = "正答を読み込んでいます。"; $("explanation").textContent = "";
      void loadTimeoutSolution(s);
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
    $("review").hidden = s.mode !== "test" || phase !== "result" || role === "controller";
    if (phase === "result" && s.judgement) {
      $("resultTitle").textContent = s.judgement.correct ? "正解！" : "正答候補とは一致しませんでした";
      renderMath(s.judgement.expected_latex, $("expected")); richText(s.judgement.explanation, $("explanation"));
      if (role !== "controller") { $<HTMLSelectElement>("reviewStatus").value = q.review_status ?? "pending"; $<HTMLInputElement>("exhibitionEnabled").checked = !!q.exhibition_enabled; }
    }
    if (phase === "finished") {
      releaseDraft(); $("endTitle").textContent = s.endReason === "completed" ? "全問完了！" : s.endReason === "timeout" ? "残機0 · プレイ終了" : "プレイ終了";
      $("endReason").textContent = s.notice;
      const seen = s.endReason === "completed" ? s.total : s.round;
      $("endStats").textContent = `${seen}問中 ${s.correct}問正解 · 正解率 ${Math.round(s.correct / seen * 100)}%`;
      $("endAttempts").textContent = `出題 ${seen} / ${s.total}問 · 回答送信 ${s.attempts}回 / 不正解 ${s.wrongAttempts}回。${s.mode === "test" ? "時間・残機制限なし。" : `残機 ${s.lives} / 3（時間切れでのみ減少）。`}`;
      $("backToSetup").hidden = role === "controller";
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
    else if (action === "next") { if (saveBusy) return; session.next(); }
    else if (action === "retry-test") { session.retryTest(); }
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
      render(); if (remote?.phase === "finished" && previous?.phase !== "finished") void loadLastSolution(remote);
    } else if (role === "display" && message.type === "exhibition-action") {
      const s = session?.snapshot;
      if (!s || message.runId !== s.runId || message.questionId !== s.question?.id || !connected) return;
      void action(message.action, message);
    } else if (role === "display" && message.type === "hello") {
      if (controllerConnectionId !== null && controllerConnectionId !== message.connectionId) {
        session?.cancelRecognition();
        // A replacement tab has no original PNG. Never ask it to confirm an
        // orphaned preview that it cannot visually verify.
        if (session?.snapshot.phase === "preview") session.rewrite();
      }
      controllerConnectionId = message.connectionId; sendState(true);
    }
  });
  channel?.subscribeConnection(connection => {
    connected = connection.connected;
    $("connection").textContent = connection.incompatible ? "画面のバージョンが違います。両画面を更新してください。" : connected ? "2画面接続済み" : "相手の画面を待っています";
    if (role === "display" && session) {
      session.pause(!connected);
      if (!connected && session.snapshot.phase === "recognizing" && activeRecognition === null) {
        // A controller may disappear during inference. Invalidate its result and
        // resume writing on reconnect instead of leaving an unrecoverable spinner.
        session.cancelRecognition();
      }
      sendState();
    }
    if (!connected) { activeRecognition = null; busy = false; }
    updateSetup(); lastRender = ""; render();
  });
  channel?.start();
  window.addEventListener("pagehide", () => channel?.close());
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(input => input.addEventListener("change", () => { selectedMode = input.value as Mode; drawPicker(); }));
  $("difficulty").addEventListener("change", drawPicker);
  for (const id of ["search", "allLevels", "onlyPending"]) $(id).addEventListener(id === "search" ? "input" : "change", drawPicker);
  on("clearSelection", () => { selected.clear(); drawPicker(); });
  on("showGuide", () => {
    const questions = selectedMode === "test" ? catalog.selected(selected) : chooseExhibition(bank, selectedLevel());
    if (!modelReady || !connected || !questions.length) return;
    session = new Session(questions, selectedMode); lastRender = "";
    $("guideTitle").textContent = selectedMode === "test" ? "テストプレイ・データ収集" : "本番体験の遊び方";
    $("guideDescription").textContent = selectedMode === "test" ? `選択した${questions.length}問を、選んだ順にテストします。` : `${labels[selectedLevel() - 1]}の本番候補から${questions.length}問に挑戦します。`;
    $("guideRules").textContent = selectedMode === "test" ? "時間制限・残機はありません。同じ問題を何度でもテストできます。" : "残機3・1問20秒。不正解でも残機は減らず、同じ問題に何度でも再回答できます。時間切れで残機が1減り、正答を確認して次へ進みます。残機0で終了。認識・判定の処理待ちだけ時計が止まり、読み取り確認中は時間が進みます。";
    $("guidePrivacy").textContent = selectedMode === "test" ? "データは自動保存しません。画像とラベルを確認し、保存に同意したものだけ、このPCへ保存します。" : "本番体験の手書き画像は学習データとして保存しません。";
    render(); sendState();
  });
  on("guideBack", () => { session = null; render(); sendState(); updateSetup(); });
  on("begin", () => { if (!connected || !modelReady) return; session?.start(); render(); sendState(); });
  on("undo", () => pad.undo()); on("clear", () => pad.clear()); on("recognize", recognize);
  on("rewrite", async () => { await action("rewrite"); if (state()?.phase === "writing") { pad.clear(); releaseDraft(); } });
  on("confirm", () => action("confirm")); on("next", () => action("next"));
  on("retryTest", async () => { await action("retry-test"); pad.clear(); releaseDraft(); lastPreview = ""; });
  on("stop", () => { if (saveBusy) { $("notice").textContent = "保存処理が終わるまでお待ちください。"; return; } return action("stop"); });
  on("backToSetup", () => { session = null; releaseDraft(); lastRender = ""; render(); sendState(); void client.fetchQuestions().then(qs => { setBank(qs); drawPicker(); }).catch(showError); });
  on("fullscreen", async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $("modelStatus").textContent = "全画面にできませんでした。ブラウザーの全画面操作をお試しください。"; } });
  on("sound", () => { $("sound").textContent = sound.toggle() ? "警告音 ON" : "警告音 OFF"; });
  document.addEventListener("fullscreenchange", () => { $("fullscreen").textContent = document.fullscreenElement ? "全画面を終了" : "全画面"; });
  if (role === "display") on("openController", () => { window.open(`/controller?session=${encodeURIComponent(sessionId)}`, "_blank", "noopener"); });
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
    const q = state()?.question; if (!q || role === "controller") return;
    const status = $<HTMLSelectElement>("reviewStatus").value, enabled = $<HTMLInputElement>("exhibitionEnabled").checked;
    if (enabled && status !== "approved") { $("reviewNotice").textContent = "本番候補にするには確認状況を「確認済み」にしてください。"; return; }
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
  void client.beginPreload().then(() => client.waitUntilReady(() => {})).then(() => { modelReady = true; $("modelStatus").textContent = "認識モデル準備完了"; updateSetup(); lastRender = ""; render(); }).catch(e => { $("modelStatus").textContent = `モデルの準備に失敗。サーバーと環境を確認してページを更新してください。${String(e)}`; });
}
