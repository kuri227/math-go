import "@fontsource-variable/m-plus-1";
import "katex/dist/katex.min.css";
import "./styles.css";

import { RecognitionClient } from "./api/RecognitionClient";
import { courses, type CourseConfig, type CourseId } from "./domain/courses";
import { difficulties, difficultyById } from "./domain/difficulties";
import { GameSession } from "./domain/GameSession";
import { CourseGuide } from "./ui/CourseGuide";
import { gameEndMessage } from "./domain/gameEndMessage";
import { selectQuestions } from "./domain/questionSelection";
import { questions as fallbackQuestions } from "./domain/questions";
import { URGENCY_SECONDS } from "./domain/timing";
import type { PerformanceSample, Question, SolutionResponse } from "./domain/types";
import { gameEvents, pulseSubmission, showQuestion, updateUrgency } from "./events";
import { required, ui } from "./ui/dom";
import { HandwritingPad } from "./ui/HandwritingPad";
import { renderMath } from "./ui/renderMath";
import { UrgencySound } from "./ui/UrgencySound";

declare global {
  interface Window {
    mathGoBootTimer?: number;
  }
}

document.documentElement.dataset.mathGoBooted = "true";
if (window.mathGoBootTimer !== undefined) {
  window.clearTimeout(window.mathGoBootTimer);
  delete window.mathGoBootTimer;
}

const client = new RecognitionClient();
const pad = new HandwritingPad(
  required<HTMLCanvasElement>("#handwritingCanvas"),
  required<HTMLElement>("#canvasHint"),
  required<HTMLElement>("#pointerPreview"),
);
const {
  startScreen,
  gameShell,
  startButton,
  courseButtons,
  difficultyList,
  difficultyPrevious,
  difficultyNext,
  difficultyPageLabel,
  selectedDifficultyLabel,
  gameStage,
  answerPanel,
  actionStatus,
  submitButton,
  undoButton,
  clearButton,
  skipButton,
  retryButton,
  nextButton,
  restartButton,
  backToTitleButton,
  titleButton,
  resultSection,
  endScreen,
  stageFeedback,
  stageIntro,
  timerTrack,
  timerFill,
  timeStat,
  soundButton,
  explanationText,
  answerPreview,
  answerPreviewEmpty,
} = ui;
const urgencySound = new UrgencySound();
const guide = new CourseGuide(required<HTMLElement>("#app"), false, () => void startSelectedCourse(), () => {
  guide.hide();
  startScreen.hidden = false;
  startButton.focus();
});

let loadedQuestions: Question[] = fallbackQuestions;
let questionsReady = false;
let modelReady = false;
let modelFailed = false;
let gameCreated = false;
let sceneReady = false;
let selectedCourseId: CourseId = "challenge";
let selectedDifficultyId = 3;
let difficultyPage = 0;
let currentCourse = courses[selectedCourseId];
let session = createSession(currentCourse);
let pendingSample: PerformanceSample | null = null;
let pendingForced: { reason: "timeout" | "skip"; solution: SolutionResponse } | null = null;
let timerRemainingMs = 0;
let timerEndsAt = 0;
let timerHandle: number | null = null;
let flowToken = 0;
let lastCueSecond: number | null = null;
let answerPreviewUrl: string | null = null;

gameEvents.addEventListener("scene-ready", () => {
  sceneReady = true;
  if (!gameShell.hidden) void launchCourse();
}, { once: true });

void preloadModel();
void loadQuestions();
renderDifficultyPage();
renderSoundButton();

function createSession(course: CourseConfig): GameSession {
  const questionSet = selectQuestions(
    loadedQuestions,
    selectedDifficultyId,
    course.questionCount,
  );
  return new GameSession(
    questionSet,
    course.initialLives,
  );
}

async function loadQuestions(): Promise<void> {
  try {
    const remoteQuestions = await client.fetchQuestions();
    if (remoteQuestions.length > 0) loadedQuestions = remoteQuestions;
  } catch {
    // The bundled problem set keeps the game playable when the question endpoint is unavailable.
  } finally {
    questionsReady = true;
    syncStartButton();
  }
}

function renderDifficultyPage(): void {
  const pageSize = 3;
  const pageCount = Math.ceil(difficulties.length / pageSize);
  difficultyPage = Math.max(0, Math.min(pageCount - 1, difficultyPage));
  const pageItems = difficulties.slice(difficultyPage * pageSize, difficultyPage * pageSize + pageSize);
  difficultyList.replaceChildren(...pageItems.map((difficulty) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "difficulty-option";
    button.dataset.difficulty = String(difficulty.id);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(difficulty.id === selectedDifficultyId));
    if (difficulty.id === selectedDifficultyId) button.classList.add("is-selected");

    const level = document.createElement("span");
    level.className = "difficulty-level";
    level.textContent = difficulty.audience;
    const label = document.createElement("strong");
    label.textContent = difficulty.label;
    const description = document.createElement("small");
    description.textContent = difficulty.description;
    button.append(level, label, description);
    button.addEventListener("click", () => selectDifficulty(difficulty.id));
    return button;
  }));
  difficultyPageLabel.textContent = `${difficultyPage + 1} / ${pageCount}`;
  difficultyPrevious.disabled = difficultyPage === 0;
  difficultyNext.disabled = difficultyPage === pageCount - 1;
  selectedDifficultyLabel.textContent = `${difficultyById(selectedDifficultyId).label}までを出題`;
}

function selectDifficulty(id: number): void {
  selectedDifficultyId = difficultyById(id).id;
  const selectedIndex = difficulties.findIndex((difficulty) => difficulty.id === selectedDifficultyId);
  difficultyPage = Math.floor(selectedIndex / 3);
  renderDifficultyPage();
  syncStartButton();
}

function renderSoundButton(): void {
  soundButton.textContent = urgencySound.isEnabled ? "警告音 ON" : "警告音 OFF";
  soundButton.setAttribute("aria-pressed", String(urgencySound.isEnabled));
}

function toggleSound(): void {
  urgencySound.toggle();
  renderSoundButton();
}

function setModelState(state: "loading" | "ready" | "error", label: string): void {
  document.querySelectorAll<HTMLElement>("[data-model-state]").forEach((element) => {
    element.dataset.state = state;
  });
  document.querySelectorAll<HTMLElement>("[data-model-state-text]").forEach((element) => {
    element.textContent = label;
  });
}

function syncStartButton(): void {
  guide.setReadiness(modelReady && questionsReady, modelFailed ? "ゲームを準備できませんでした。設定に戻り、準備をやり直してください。" : modelReady && questionsReady ? "準備完了。開始を押すまで、時計は進みません。" : "認識モデルと問題を準備中です。");
  if (modelFailed) {
    startButton.disabled = false;
    startButton.textContent = "準備をやり直す";
    return;
  }
  startButton.disabled = false;
  startButton.textContent = "このモードの説明へ";
  startButton.setAttribute("aria-label", `${difficultyById(selectedDifficultyId).label}・${currentCourse.name}の説明へ`);
}

async function preloadModel(): Promise<void> {
  setModelState("loading", "ゲームを準備中");
  try {
    await client.beginPreload();
    await client.waitUntilReady((status) => {
      setModelState(
        status.status === "ready" ? "ready" : "loading",
        status.status === "ready" ? "準備完了" : "ゲームを準備中",
      );
    });
    modelReady = true;
    modelFailed = false;
    setModelState("ready", "準備完了");
  } catch (error) {
    modelFailed = true;
    setModelState("error", "ゲームを準備できませんでした");
    actionStatus.textContent = error instanceof Error ? error.message : "ゲームを準備できませんでした。";
  } finally {
    syncStartButton();
  }
}

function selectCourse(id: CourseId): void {
  selectedCourseId = id;
  currentCourse = courses[id];
  courseButtons.forEach((button) => {
    const selected = button.dataset.course === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  syncStartButton();
}

async function ensureGameCreated(): Promise<void> {
  if (gameCreated) return;
  gameCreated = true;
  const { createGame } = await import("./game/createGame");
  createGame(required<HTMLElement>("#phaserGame"));
}

async function startSelectedCourse(): Promise<void> {
  if (modelFailed) {
    window.location.reload();
    return;
  }
  if (!modelReady || !questionsReady) return;
  guide.hide();

  flowToken += 1;
  currentCourse = courses[selectedCourseId];
  session = createSession(currentCourse);
  pendingSample = null;
  pendingForced = null;
  startScreen.hidden = true;
  gameShell.hidden = false;
  clearAnswerPreview();
  showPlayView();
  required<HTMLElement>("#courseName").textContent =
    `${difficultyById(selectedDifficultyId).label} · ${currentCourse.name}`;
  timeStat.hidden = currentCourse.timeLimitSeconds === null;
  timerTrack.hidden = currentCourse.timeLimitSeconds === null;
  window.scrollTo({ top: 0 });

  try {
    await ensureGameCreated();
    if (sceneReady) await launchCourse();
  } catch (error) {
    actionStatus.textContent = error instanceof Error
      ? `ゲーム画面を開始できませんでした: ${error.message}`
      : "ゲーム画面を開始できませんでした。";
  }
}

async function launchCourse(): Promise<void> {
  const token = ++flowToken;
  pauseTimer();
  pad.clear();
  updateQuestion();
  updateHud();
  prepareTimer();
  session.setState("loading");
  setBusy(true);
  stageIntro.hidden = false;
  required<HTMLElement>("#stageIntroCourse").textContent = currentCourse.name;
  required<HTMLElement>("#stageIntroTitle").textContent = currentCourse.intro;
  actionStatus.textContent = "まもなく開始します。";
  await new Promise((resolve) => window.setTimeout(resolve, 1_050));
  if (token !== flowToken || gameShell.hidden) return;
  stageIntro.hidden = true;
  session.setState("writing");
  setBusy(false);
  submitButton.textContent = "回答を提出";
  actionStatus.textContent = "回答を書いて提出してください。認識中は時計が止まります。";
  resumeTimer();
}

function updateQuestion(): void {
  const { current, total } = session.progress;
  showQuestion(session.question, current, total);
  required<HTMLElement>("#questionInstruction").textContent = session.question.instruction;
  required<HTMLElement>("#questionExpression").textContent = session.question.display;
  required<HTMLElement>("#questionMeta").textContent =
    `${session.question.difficulty_label} · ${session.question.category}`;
  gameStage.style.setProperty("--progress", String(current / total));
}

function updateHud(): void {
  const stats = session.stats;
  required<HTMLElement>("#correctValue").textContent = String(stats.correct);
  required<HTMLElement>("#streakValue").textContent = String(stats.streak);
  const lives = required<HTMLElement>("#livesValue");
  lives.textContent = Array.from(
    { length: currentCourse.initialLives },
    (_, index) => index < stats.lives ? "●" : "○",
  ).join(" ");
  lives.setAttribute("aria-label", `残機${stats.lives}`);
}

function setBusy(busy: boolean): void {
  submitButton.disabled = busy;
  undoButton.disabled = busy;
  clearButton.disabled = busy;
  skipButton.disabled = busy;
  pad.setDisabled(busy);
}

function prepareTimer(): void {
  timerRemainingMs = (currentCourse.timeLimitSeconds ?? 0) * 1_000;
  lastCueSecond = null;
  updateUrgency(1, false);
  renderTimer();
}

function resumeTimer(): void {
  if (currentCourse.timeLimitSeconds === null || timerRemainingMs <= 0 || timerHandle !== null) return;
  timerEndsAt = performance.now() + timerRemainingMs;
  timerHandle = window.setInterval(tickTimer, 100);
  tickTimer();
}

function pauseTimer(): void {
  if (timerHandle === null) return;
  timerRemainingMs = Math.max(0, timerEndsAt - performance.now());
  window.clearInterval(timerHandle);
  timerHandle = null;
  renderTimer();
}

function tickTimer(): void {
  timerRemainingMs = Math.max(0, timerEndsAt - performance.now());
  renderTimer();
  if (timerRemainingMs === 0) handleTimeout();
}

function renderTimer(): void {
  if (currentCourse.timeLimitSeconds === null) {
    required<HTMLElement>("#timeValue").textContent = "∞";
    timerFill.style.width = "100%";
    updateUrgency(1, false);
    return;
  }
  const seconds = timerRemainingMs / 1_000;
  const ratio = Math.max(0, seconds / currentCourse.timeLimitSeconds);
  required<HTMLElement>("#timeValue").textContent = seconds.toFixed(1);
  timerFill.style.width = `${ratio * 100}%`;
  timerTrack.dataset.urgent = String(seconds <= URGENCY_SECONDS);
  updateUrgency(ratio, seconds <= URGENCY_SECONDS);
  const wholeSecond = Math.ceil(seconds);
  if (wholeSecond <= 5 && wholeSecond > 0 && wholeSecond !== lastCueSecond) {
    lastCueSecond = wholeSecond;
    urgencySound.play(wholeSecond);
  }
}

function handleTimeout(): void {
  if (session.state !== "writing") return;
  void revealWithoutAnswer("timeout");
}

async function revealWithoutAnswer(reason: "timeout" | "skip"): Promise<void> {
  if (session.state !== "writing") return;
  pauseTimer();
  session.setState("result");
  setBusy(true);
  showStageFeedback(false, reason === "timeout" ? "時間切れ" : "わからない");
  actionStatus.textContent = "正答と解説を読み込んでいます。";
  const questionId = session.question.id;
  let solution: SolutionResponse;
  try {
    solution = await client.fetchSolution(questionId);
  } catch {
    solution = {
      question_id: questionId,
      expected_latex: "?",
      explanation: "解説を取得できませんでした。スタッフにお知らせください。",
    };
  }
  pendingSample = null;
  pendingForced = { reason, solution };
  renderForcedResult(reason, solution);
  actionStatus.textContent = reason === "timeout"
    ? "時間切れです。正答と解説を確認してから次へ進んでください。"
    : "正答と解説を確認してから次へ進んでください。";
}

async function submitAnswer(): Promise<void> {
  if (session.state !== "writing") return;
  if (!pad.hasInk) {
    actionStatus.textContent = "入力欄に回答を書いてから提出してください。";
    required<HTMLElement>("#canvasWrap").focus({ preventScroll: true });
    return;
  }

  pauseTimer();
  session.setState("recognizing");
  setBusy(true);
  submitButton.textContent = "認識・判定中…";
  actionStatus.textContent = "手書きを数式へ変換し、正答候補と照合しています。";
  pulseSubmission();
  const feedbackStarted = performance.now();
  let succeeded = false;

  try {
    const encodeStarted = performance.now();
    const image = await pad.toCroppedPng();
    setAnswerPreview(image.blob);
    const encodeMs = performance.now() - encodeStarted;
    const requestStarted = performance.now();
    const response = await client.recognize(image.blob);
    const requestMs = performance.now() - requestStarted;
    const judgementStarted = performance.now();
    const judgement = await client.judge(session.question.id, response.normalized_latex);
    const judgementMs = performance.now() - judgementStarted;
    const feedbackMs = performance.now() - feedbackStarted;
    pendingSample = { encodeMs, requestMs, judgementMs, feedbackMs, response, judgement };
    renderResult(pendingSample);
    session.setState("result");
    succeeded = true;
    actionStatus.textContent = judgement.correct
      ? "正解です。結果を確認して次へ進んでください。"
      : "認識結果が意図と違う場合は、失点を確定せずに書き直せます。";
  } catch (error) {
    session.setState("writing");
    actionStatus.textContent = error instanceof Error
      ? `${error.message} 回答は消していないため、もう一度提出できます。`
      : "認識または判定に失敗しました。もう一度提出してください。";
    submitButton.textContent = "もう一度提出";
    resumeTimer();
  } finally {
    setBusy(false);
    if (succeeded) {
      submitButton.disabled = true;
      submitButton.textContent = "結果を確認してください";
    }
  }
}

function clearAnswerPreview(): void {
  if (answerPreviewUrl) URL.revokeObjectURL(answerPreviewUrl);
  answerPreviewUrl = null;
  answerPreview.removeAttribute("src");
  answerPreview.hidden = true;
  answerPreviewEmpty.hidden = false;
}

function setAnswerPreview(blob: Blob): void {
  clearAnswerPreview();
  answerPreviewUrl = URL.createObjectURL(blob);
  answerPreview.src = answerPreviewUrl;
  answerPreview.hidden = false;
  answerPreviewEmpty.hidden = true;
}

function showPlayView(): void {
  gameStage.classList.remove("is-result", "is-finished");
  answerPanel.hidden = false;
  resultSection.hidden = true;
  endScreen.hidden = true;
}

function showResultView(): void {
  answerPanel.hidden = true;
  endScreen.hidden = true;
  resultSection.hidden = false;
  gameStage.classList.remove("is-finished");
  gameStage.classList.add("is-result");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderResult(sample: PerformanceSample): void {
  const { response, judgement } = sample;
  const verdictLine = required<HTMLElement>("#verdictLine");
  verdictLine.dataset.result = judgement.correct ? "correct" : "incorrect";
  required<HTMLElement>("#verdictTitle").textContent = judgement.correct ? "正解！" : "おしい！";
  required<HTMLElement>("#verdictMessage").textContent = judgement.correct
    ? "手書き回答を正しく数式として認識できました。"
    : "認識結果と正答を比べてください。認識違いなら書き直せます。";
  renderMath(response.normalized_latex, required<HTMLElement>("#renderedMath"));
  renderMath(judgement.expected_latex, required<HTMLElement>("#expectedMath"));
  explanationText.textContent = judgement.explanation;
  retryButton.hidden = false;
  nextButton.textContent = judgement.correct ? "次の問題へ" : "次へ（ミスを確定）";
  showResultView();
}

function renderForcedResult(reason: "timeout" | "skip", solution: SolutionResponse): void {
  const verdictLine = required<HTMLElement>("#verdictLine");
  verdictLine.dataset.result = "incorrect";
  required<HTMLElement>("#verdictTitle").textContent = reason === "timeout" ? "時間切れ" : "ここで中断";
  required<HTMLElement>("#verdictMessage").textContent =
    "未回答として記録します。正答と考え方を確認しましょう。";
  required<HTMLElement>("#renderedMath").textContent = "未回答";
  clearAnswerPreview();
  renderMath(solution.expected_latex, required<HTMLElement>("#expectedMath"));
  explanationText.textContent = solution.explanation;
  retryButton.hidden = true;
  nextButton.textContent = "解説を確認して次へ";
  showResultView();
}

function showStageFeedback(correct: boolean, label?: string): void {
  stageFeedback.dataset.result = correct ? "correct" : "incorrect";
  required<HTMLElement>("#stageFeedbackTitle").textContent = label ?? (correct ? "正解！" : "もう一度確認");
  stageFeedback.hidden = false;
  window.setTimeout(() => { stageFeedback.hidden = true; }, 780);
}

function beginNextQuestion(message = "回答を書いて提出してください。"): void {
  pendingSample = null;
  pendingForced = null;
  pad.clear();
  clearAnswerPreview();
  showPlayView();
  session.setState("writing");
  actionStatus.textContent = message;
  submitButton.textContent = "回答を提出";
  setBusy(false);
  updateQuestion();
  prepareTimer();
  resumeTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function retryCurrentQuestion(): void {
  if (session.state !== "result") return;
  pendingSample = null;
  pendingForced = null;
  pad.clear();
  clearAnswerPreview();
  showPlayView();
  session.setState("writing");
  actionStatus.textContent = "失点は確定していません。もう一度書いてください。";
  submitButton.textContent = "回答を提出";
  setBusy(false);
  resumeTimer();
}

function advanceFromResult(): void {
  if (session.state !== "result") return;
  let finished: boolean;
  if (pendingSample) {
    finished = session.commit(
      pendingSample.judgement.correct,
      pendingSample.feedbackMs,
    );
  } else if (pendingForced) {
    finished = session.commit(false, 0);
  } else {
    return;
  }
  updateHud();
  if (finished) {
    showEndScreen();
    return;
  }
  beginNextQuestion();
}

function skipQuestion(): void {
  if (session.state !== "writing") return;
  void revealWithoutAnswer("skip");
}

function showEndScreen(): void {
  pauseTimer();
  const stats = session.stats;
  pendingSample = null;
  pendingForced = null;
  answerPanel.hidden = true;
  resultSection.hidden = true;
  endScreen.hidden = false;
  gameStage.classList.remove("is-result");
  gameStage.classList.add("is-finished");
  gameStage.style.setProperty("--progress", "1");
  const accuracy = stats.answered === 0 ? 0 : stats.correct / stats.answered * 100;
  required<HTMLElement>("#finalAccuracy").textContent = accuracy.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  required<HTMLElement>("#finalCorrect").textContent = `${stats.correct} / ${stats.answered}`;
  required<HTMLElement>("#finalMessage").textContent = gameEndMessage(session.endReason, stats.answered, session.progress.total);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restartGame(): void {
  flowToken += 1;
  pauseTimer();
  session = createSession(currentCourse);
  pendingSample = null;
  pendingForced = null;
  clearAnswerPreview();
  showPlayView();
  void launchCourse();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function returnToTitle(): void {
  flowToken += 1;
  pauseTimer();
  pendingSample = null;
  pendingForced = null;
  pad.clear();
  clearAnswerPreview();
  gameShell.hidden = true;
  startScreen.hidden = false;
  stageIntro.hidden = true;
  stageFeedback.hidden = true;
  resultSection.hidden = true;
  endScreen.hidden = true;
  gameStage.classList.remove("is-result", "is-finished");
  syncStartButton();
  window.scrollTo({ top: 0 });
}

courseButtons.forEach((button) => {
  button.addEventListener("click", () => selectCourse(button.dataset.course as CourseId));
});
difficultyPrevious.addEventListener("click", () => {
  difficultyPage -= 1;
  renderDifficultyPage();
});
difficultyNext.addEventListener("click", () => {
  difficultyPage += 1;
  renderDifficultyPage();
});
soundButton.addEventListener("click", toggleSound);
startButton.addEventListener("click", () => {
  if (modelFailed) { window.location.reload(); return; }
  startScreen.hidden = true;
  guide.open(currentCourse, difficultyById(selectedDifficultyId).label);
  syncStartButton();
});
undoButton.addEventListener("click", () => pad.undo());
clearButton.addEventListener("click", () => pad.clear());
skipButton.addEventListener("click", skipQuestion);
submitButton.addEventListener("click", () => void submitAnswer());
retryButton.addEventListener("click", retryCurrentQuestion);
nextButton.addEventListener("click", advanceFromResult);
restartButton.addEventListener("click", restartGame);
backToTitleButton.addEventListener("click", returnToTitle);
titleButton.addEventListener("click", returnToTitle);

window.addEventListener("keydown", (event) => {
  if (!startScreen.hidden && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    selectDifficulty(Math.max(1, Math.min(7, selectedDifficultyId + delta)));
    return;
  }
  if (gameShell.hidden || event.target instanceof HTMLButtonElement) return;
  if (event.key.toLowerCase() === "q" && session.state === "writing") {
    event.preventDefault();
    skipQuestion();
  }
  if (event.key === "Enter") {
    if (session.state === "writing") {
      event.preventDefault();
      void submitAnswer();
    } else if (session.state === "result") {
      event.preventDefault();
      advanceFromResult();
    }
  }
});
