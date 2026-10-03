import "@fontsource-variable/m-plus-1";
import "katex/dist/katex.min.css";
import katex from "katex";
import "./styles.css";

import { RecognitionClient } from "./api/RecognitionClient";
import { GameSession } from "./domain/GameSession";
import { questions as fallbackQuestions } from "./domain/questions";
import type { PerformanceSample, Question } from "./domain/types";
import { gameEvents, pulseSubmission, showQuestion } from "./events";
import { HandwritingPad } from "./ui/HandwritingPad";

type CourseId = "practice" | "challenge";

interface CourseConfig {
  id: CourseId;
  name: string;
  intro: string;
  questionCount: number;
  timeLimitSeconds: number | null;
  initialLives: number;
  speedBonusPerSecond: number;
}

// Pre-play rules live here so the next UX specification can change course
// wording, pacing and scoring without rewriting the game loop.
const courses: Record<CourseId, CourseConfig> = {
  practice: {
    id: "practice",
    name: "じっくり練習",
    intro: "時間を気にせず、認識の感触を確かめよう",
    questionCount: 5,
    timeLimitSeconds: null,
    initialLives: 3,
    speedBonusPerSecond: 0,
  },
  challenge: {
    id: "challenge",
    name: "30秒チャレンジ",
    intro: "1問30秒。テンポよく全問突破しよう",
    questionCount: 7,
    timeLimitSeconds: 30,
    initialLives: 3,
    speedBonusPerSecond: 2,
  },
};

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const client = new RecognitionClient();
const pad = new HandwritingPad(
  required<HTMLCanvasElement>("#handwritingCanvas"),
  required<HTMLElement>("#canvasHint"),
  required<HTMLElement>("#pointerPreview"),
);

const startScreen = required<HTMLElement>("#startScreen");
const gameShell = required<HTMLElement>("#gameShell");
const startButton = required<HTMLButtonElement>("#startButton");
const courseButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-course]")];
const gameStage = required<HTMLElement>(".game-stage");
const answerPanel = required<HTMLElement>("#answerPanel");
const actionStatus = required<HTMLElement>("#actionStatus");
const submitButton = required<HTMLButtonElement>("#submitButton");
const undoButton = required<HTMLButtonElement>("#undoButton");
const clearButton = required<HTMLButtonElement>("#clearButton");
const skipButton = required<HTMLButtonElement>("#skipButton");
const retryButton = required<HTMLButtonElement>("#retryButton");
const nextButton = required<HTMLButtonElement>("#nextButton");
const restartButton = required<HTMLButtonElement>("#restartButton");
const backToTitleButton = required<HTMLButtonElement>("#backToTitleButton");
const titleButton = required<HTMLButtonElement>("#titleButton");
const resultSection = required<HTMLElement>("#recognitionResult");
const endScreen = required<HTMLElement>("#endScreen");
const stageFeedback = required<HTMLElement>("#stageFeedback");
const stageIntro = required<HTMLElement>("#stageIntro");
const timerTrack = required<HTMLElement>("#timerTrack");
const timerFill = required<HTMLElement>("#timerFill");
const timeStat = required<HTMLElement>(".time-stat");

let loadedQuestions: Question[] = fallbackQuestions;
let questionsReady = false;
let modelReady = false;
let modelFailed = false;
let gameCreated = false;
let sceneReady = false;
let selectedCourseId: CourseId = "challenge";
let currentCourse = courses[selectedCourseId];
let session = createSession(currentCourse);
let pendingSample: PerformanceSample | null = null;
let pendingBonus = 0;
let timerRemainingMs = 0;
let timerEndsAt = 0;
let timerHandle: number | null = null;
let flowToken = 0;

gameEvents.addEventListener("scene-ready", () => {
  sceneReady = true;
  if (!gameShell.hidden) void launchCourse();
}, { once: true });

void preloadModel();
void loadQuestions();

function createSession(course: CourseConfig): GameSession {
  return new GameSession(
    loadedQuestions.slice(0, Math.min(course.questionCount, loadedQuestions.length)),
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

function setModelState(state: "loading" | "ready" | "error", label: string): void {
  document.querySelectorAll<HTMLElement>("[data-model-state]").forEach((element) => {
    element.dataset.state = state;
  });
  document.querySelectorAll<HTMLElement>("[data-model-state-text]").forEach((element) => {
    element.textContent = label;
  });
}

function syncStartButton(): void {
  if (modelFailed) {
    startButton.disabled = false;
    startButton.textContent = "モデル読込を再試行";
    return;
  }
  startButton.disabled = !(modelReady && questionsReady);
  startButton.textContent = modelReady && questionsReady
    ? `${currentCourse.name}を開始`
    : "モデル準備中…";
}

async function preloadModel(): Promise<void> {
  setModelState("loading", "TexTellerを準備中");
  try {
    await client.beginPreload();
    await client.waitUntilReady((status) => {
      setModelState(
        status.status === "ready" ? "ready" : "loading",
        status.status === "ready" ? "TexTeller 準備完了" : "TexTellerを読み込み中",
      );
    });
    modelReady = true;
    modelFailed = false;
    setModelState("ready", "TexTeller 準備完了");
  } catch (error) {
    modelFailed = true;
    setModelState("error", "モデル準備エラー");
    actionStatus.textContent = error instanceof Error ? error.message : "モデルを準備できませんでした。";
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

  flowToken += 1;
  currentCourse = courses[selectedCourseId];
  session = createSession(currentCourse);
  pendingSample = null;
  pendingBonus = 0;
  startScreen.hidden = true;
  gameShell.hidden = false;
  answerPanel.hidden = false;
  resultSection.hidden = true;
  endScreen.hidden = true;
  gameStage.classList.remove("is-finished");
  required<HTMLElement>("#courseName").textContent = currentCourse.name;
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
    `${session.question.difficulty} · ${session.question.category}`;
  gameStage.style.setProperty("--progress", String(current / total));
}

function updateHud(): void {
  const stats = session.stats;
  required<HTMLElement>("#scoreValue").textContent = stats.score.toLocaleString("ja-JP");
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
    return;
  }
  const seconds = timerRemainingMs / 1_000;
  const ratio = Math.max(0, seconds / currentCourse.timeLimitSeconds);
  required<HTMLElement>("#timeValue").textContent = seconds.toFixed(1);
  timerFill.style.width = `${ratio * 100}%`;
  timerTrack.dataset.urgent = String(seconds <= 10);
}

function handleTimeout(): void {
  if (session.state !== "writing") return;
  pauseTimer();
  session.setState("result");
  setBusy(true);
  showStageFeedback(false, "時間切れ");
  actionStatus.textContent = "時間切れです。次の問題へ進みます。";
  const finished = session.commit(false, 0);
  updateHud();
  const token = flowToken;
  window.setTimeout(() => {
    if (token !== flowToken) return;
    if (finished) showEndScreen();
    else beginNextQuestion("時間切れ。気持ちを切り替えて次の問題へ。");
  }, 850);
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
    const encodeMs = performance.now() - encodeStarted;
    const requestStarted = performance.now();
    const response = await client.recognize(image.blob);
    const requestMs = performance.now() - requestStarted;
    const judgementStarted = performance.now();
    const judgement = await client.judge(session.question.id, response.normalized_latex);
    const judgementMs = performance.now() - judgementStarted;
    const feedbackMs = performance.now() - feedbackStarted;
    pendingSample = { encodeMs, requestMs, judgementMs, feedbackMs, response, judgement };
    pendingBonus = judgement.correct
      ? Math.floor(timerRemainingMs / 1_000) * currentCourse.speedBonusPerSecond
      : 0;
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

function renderMath(latex: string, target: HTMLElement): void {
  try {
    katex.render(latex, target, {
      throwOnError: false,
      displayMode: true,
      trust: false,
    });
  } catch {
    target.textContent = latex;
  }
}

function renderResult(sample: PerformanceSample): void {
  const { response, judgement } = sample;
  const verdictLine = required<HTMLElement>("#verdictLine");
  verdictLine.dataset.result = judgement.correct ? "correct" : "incorrect";
  required<HTMLElement>("#verdictTitle").textContent = judgement.correct ? "正解！" : "おしい！";
  required<HTMLElement>("#verdictMessage").textContent = judgement.correct
    ? pendingBonus > 0
      ? `認識成功。残り時間ボーナス +${pendingBonus}点を獲得します。`
      : "手書き回答を正しく数式として認識できました。"
    : "認識結果と正答を比べてください。認識違いなら書き直せます。";
  required<HTMLElement>("#rawLatex").textContent = response.raw_latex;
  renderMath(response.normalized_latex, required<HTMLElement>("#renderedMath"));
  renderMath(judgement.expected_latex, required<HTMLElement>("#expectedMath"));
  required<HTMLElement>("#encodeTime").textContent = `${sample.encodeMs.toFixed(1)} ms`;
  required<HTMLElement>("#inferenceTime").textContent = `${response.timing.inference_ms.toFixed(1)} ms`;
  required<HTMLElement>("#judgementTime").textContent = `${sample.judgementMs.toFixed(1)} ms`;
  required<HTMLElement>("#feedbackTime").textContent = `${sample.feedbackMs.toFixed(1)} ms`;
  required<HTMLElement>("#imageSize").textContent = `${(response.image.bytes / 1_024).toFixed(1)} KB`;
  nextButton.textContent = judgement.correct ? "次の問題へ" : "次へ（ミスを確定）";
  showStageFeedback(judgement.correct);
  resultSection.hidden = false;
  window.setTimeout(() => {
    resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 820);
}

function showStageFeedback(correct: boolean, label?: string): void {
  stageFeedback.dataset.result = correct ? "correct" : "incorrect";
  required<HTMLElement>("#stageFeedbackTitle").textContent = label ?? (correct ? "正解！" : "もう一度確認");
  stageFeedback.hidden = false;
  window.setTimeout(() => { stageFeedback.hidden = true; }, 780);
}

function beginNextQuestion(message = "回答を書いて提出してください。"): void {
  pendingSample = null;
  pendingBonus = 0;
  pad.clear();
  resultSection.hidden = true;
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
  pendingBonus = 0;
  pad.clear();
  resultSection.hidden = true;
  session.setState("writing");
  actionStatus.textContent = "失点は確定していません。もう一度書いてください。";
  submitButton.textContent = "回答を提出";
  setBusy(false);
  resumeTimer();
}

function advanceFromResult(): void {
  if (!pendingSample || session.state !== "result") return;
  const finished = session.commit(
    pendingSample.judgement.correct,
    pendingSample.feedbackMs,
    false,
    pendingBonus,
  );
  updateHud();
  if (finished) {
    showEndScreen();
    return;
  }
  beginNextQuestion();
}

function skipQuestion(): void {
  if (session.state !== "writing") return;
  pauseTimer();
  const finished = session.commit(false, 0, true);
  updateHud();
  showStageFeedback(false, "スキップ");
  if (finished) {
    window.setTimeout(showEndScreen, 650);
    return;
  }
  window.setTimeout(() => beginNextQuestion("1問スキップしました。次の問題に挑戦してください。"), 650);
}

function showEndScreen(): void {
  pauseTimer();
  const stats = session.stats;
  pendingSample = null;
  answerPanel.hidden = true;
  resultSection.hidden = true;
  endScreen.hidden = false;
  gameStage.classList.add("is-finished");
  gameStage.style.setProperty("--progress", "1");
  required<HTMLElement>("#finalScore").textContent = stats.score.toLocaleString("ja-JP");
  required<HTMLElement>("#finalCorrect").textContent = `${stats.correct} / ${stats.answered}`;
  required<HTMLElement>("#finalLatency").textContent = stats.averageFeedbackMs > 0
    ? `${stats.averageFeedbackMs.toFixed(0)} ms`
    : "—";
  required<HTMLElement>("#finalLives").textContent = String(stats.lives);
  required<HTMLElement>("#finalMessage").textContent = stats.correct === stats.answered
    ? "全問正解。すばらしいテンポでした！"
    : "認識結果を見返しながら、同じコースへすぐ再挑戦できます。";
  endScreen.scrollIntoView({ behavior: "smooth", block: "center" });
}

function restartGame(): void {
  flowToken += 1;
  pauseTimer();
  session = createSession(currentCourse);
  pendingSample = null;
  answerPanel.hidden = false;
  endScreen.hidden = true;
  gameStage.classList.remove("is-finished");
  void launchCourse();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function returnToTitle(): void {
  flowToken += 1;
  pauseTimer();
  pendingSample = null;
  pad.clear();
  gameShell.hidden = true;
  startScreen.hidden = false;
  stageIntro.hidden = true;
  stageFeedback.hidden = true;
  resultSection.hidden = true;
  endScreen.hidden = true;
  syncStartButton();
  window.scrollTo({ top: 0 });
}

courseButtons.forEach((button) => {
  button.addEventListener("click", () => selectCourse(button.dataset.course as CourseId));
});
startButton.addEventListener("click", () => void startSelectedCourse());
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
