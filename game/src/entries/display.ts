import "@fontsource-variable/m-plus-1";
import "katex/dist/katex.min.css";
import "../dual-screen.css";

import { GameCoordinator } from "../application/GameCoordinator";
import { gameEndMessage } from "../domain/gameEndMessage";
import { RecognitionClient } from "../api/RecognitionClient";
import { courses, type CourseId } from "../domain/courses";
import { difficulties, difficultyById } from "../domain/difficulties";
import { selectQuestions } from "../domain/questionSelection";
import { questions as fallbackQuestions } from "../domain/questions";
import type { PerformanceSample, Question, RecognitionResponse } from "../domain/types";
import { BroadcastChannelTransport } from "../dual-screen/BroadcastChannelTransport";
import { DualScreenChannel } from "../dual-screen/DualScreenChannel";
import type { DualScreenMessage } from "../dual-screen/messages";
import { showQuestion, updateUrgency } from "../events";
import { renderMath } from "../ui/renderMath";
import { CourseGuide } from "../ui/CourseGuide";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const client = new RecognitionClient();
const sessionId = new URLSearchParams(window.location.search).get("session") ?? crypto.randomUUID();
const channel = new DualScreenChannel(
  new BroadcastChannelTransport(`math-go:v1:${sessionId}`),
  sessionId,
  "display",
);

const setupView = required<HTMLElement>("#setupView");
const gameView = required<HTMLElement>("#gameView");
const connectionBadge = required<HTMLElement>("#connectionBadge");
const connectionText = required<HTMLElement>("#connectionText");
const gameConnectionBadge = required<HTMLElement>("#gameConnectionBadge");
const difficultySelect = required<HTMLSelectElement>("#difficultySelect");
const courseSelect = required<HTMLSelectElement>("#courseSelect");
const readinessText = required<HTMLElement>("#readinessText");
const startButton = required<HTMLButtonElement>("#startDualButton");
const openControllerButton = required<HTMLButtonElement>("#openControllerButton");
const displayStatus = required<HTMLElement>("#displayStatus");
const displayResult = required<HTMLElement>("#displayResult");
const displayFinished = required<HTMLElement>("#displayFinished");
const displayQuestion = required<HTMLElement>(".display-question");
const displayPhaser = required<HTMLElement>("#displayPhaser");
const timerBlock = required<HTMLElement>("#displayTimeBlock");
const timerTrack = required<HTMLElement>("#displayTimer");
const timerFill = required<HTMLElement>("#displayTimerFill");
const guide = new CourseGuide(required<HTMLElement>(".display-shell"), true, () => void startGame(), () => {
  guide.hide();
  setupView.hidden = false;
  startButton.focus();
});

let questions: Question[] = fallbackQuestions;
let questionsReady = false;
let modelReady = false;
let controllerConnected = false;
let coordinator: GameCoordinator | null = null;
let timerHandle: number | null = null;
let sceneReady = false;
let gameCreated = false;

difficultySelect.replaceChildren(...difficulties.map((difficulty) => {
  const option = document.createElement("option");
  option.value = String(difficulty.id);
  option.textContent = `${difficulty.label} — ${difficulty.description}`;
  option.selected = difficulty.id === 3;
  return option;
}));

channel.subscribe(handleMessage);
channel.subscribeConnection(({ connected, incompatible }) => {
  controllerConnected = connected && !incompatible;
  const label = incompatible ? "画面の版が一致しません" : connected ? "液タブ接続済み" : "液タブを待っています";
  setConnection(connectionBadge, connectionText, connected ? "ready" : incompatible ? "error" : "waiting", label);
  const gameLabel = gameConnectionBadge.querySelector("strong");
  if (gameLabel) gameLabel.textContent = label;
  gameConnectionBadge.dataset.state = connected ? "ready" : incompatible ? "error" : "waiting";
  if (coordinator) {
    if (connected) {
      coordinator.resumeAfterReconnect();
      broadcastRound();
    } else {
      const submissionInterrupted = coordinator.pauseForDisconnect();
      displayStatus.textContent = submissionInterrupted
        ? "認識中に接続が切れました。回答は液タブに残っています。再接続後にもう一度提出してください。"
        : "液タブとの接続が切れました。再接続すると続行できます。";
    }
  }
  syncReadiness();
});
channel.start();

void prepare();
openControllerButton.addEventListener("click", openController);
startButton.addEventListener("click", () => {
  setupView.hidden = true;
  guide.open(courses[courseSelect.value as CourseId], difficultyById(Number(difficultySelect.value)).label);
  syncReadiness();
});
required<HTMLButtonElement>("#displayHomeButton").addEventListener("click", returnToSetup);
required<HTMLButtonElement>("#displayRestartButton").addEventListener("click", () => void startGame());
window.addEventListener("beforeunload", () => channel.close());

async function prepare(): Promise<void> {
  const questionPromise = client.fetchQuestions()
    .then((remote) => { if (remote.length > 0) questions = remote; })
    .catch(() => undefined)
    .finally(() => { questionsReady = true; syncReadiness(); });
  const modelPromise = client.beginPreload()
    .then(() => client.waitUntilReady(() => undefined))
    .then(() => { modelReady = true; })
    .catch((error: unknown) => {
      readinessText.textContent = error instanceof Error ? error.message : "認識モデルを準備できませんでした。";
    })
    .finally(syncReadiness);
  await Promise.all([questionPromise, modelPromise]);
}

function openController(): void {
  const url = new URL("/controller", window.location.origin);
  url.searchParams.set("session", sessionId);
  const opened = window.open(url, "math-go-controller", "popup=yes,width=1100,height=760");
  if (!opened) {
    readinessText.textContent = "液タブ画面を開けませんでした。ポップアップを許可してもう一度お試しください。";
  }
}

function syncReadiness(): void {
  const ready = questionsReady && modelReady && controllerConnected;
  startButton.disabled = false;
  startButton.textContent = "このモードの説明へ";
  if (ready) readinessText.textContent = "問題・認識モデル・液タブの準備が整いました。";
  else if (!controllerConnected) readinessText.textContent = "「液タブ画面を開く」で入力画面を接続してください。";
  else if (!questionsReady || !modelReady) readinessText.textContent = "問題と認識モデルを準備中です。";
  guide.setReadiness(ready, ready ? "準備完了。開始を押すまで、時計は進みません。" : !controllerConnected ? "液タブが未接続です。設定に戻り、液タブ画面を開いてください。" : readinessText.textContent ?? "準備中です。");
}

async function ensureGame(): Promise<void> {
  if (gameCreated) return;
  gameCreated = true;
  const { createGame } = await import("../game/createGame");
  createGame(required<HTMLElement>("#displayPhaser"));
  sceneReady = true;
}

async function startGame(): Promise<void> {
  if (!controllerConnected || !questionsReady || !modelReady) return;
  guide.hide();
  const course = courses[courseSelect.value as CourseId];
  const difficultyId = Number(difficultySelect.value);
  coordinator = new GameCoordinator(selectQuestions(questions, difficultyId, course.questionCount), course);
  coordinator.beginIntro();
  setupView.hidden = true;
  gameView.hidden = false;
  displayResult.hidden = true;
  displayFinished.hidden = true;
  displayQuestion.hidden = false;
  displayPhaser.hidden = false;
  timerBlock.hidden = course.timeLimitSeconds === null;
  timerTrack.hidden = course.timeLimitSeconds === null;
  displayStatus.textContent = `${difficultyById(difficultyId).label}・${course.name}を開始します。`;
  await ensureGame();
  renderSnapshot();
  window.setTimeout(() => {
    if (!coordinator) return;
    coordinator.beginWriting();
    displayStatus.textContent = "液タブに答えを書いて提出してください。";
    broadcastRound();
    renderSnapshot();
    startTimerLoop();
  }, 900);
}

function startTimerLoop(): void {
  if (timerHandle !== null) window.clearInterval(timerHandle);
  timerHandle = window.setInterval(() => {
    if (!coordinator) return;
    if (coordinator.tick() === "timeout") void handleForcedResult("timeout");
    renderSnapshot();
  }, 100);
}

function renderSnapshot(): void {
  if (!coordinator) return;
  const snapshot = coordinator.snapshot;
  const { current, total } = snapshot.progress;
  const finished = snapshot.state === "finished";
  required<HTMLElement>("#displayRoundLabel").textContent = finished ? "回答数" : "ROUND";
  required<HTMLElement>("#displayRound").textContent = finished ? `${snapshot.stats.answered}問` : `${current} / ${total}`;
  required<HTMLElement>("#displayCorrect").textContent = String(snapshot.stats.correct);
  required<HTMLElement>("#displayStreak").textContent = String(snapshot.stats.streak);
  required<HTMLElement>("#displayLives").textContent = Array.from(
    { length: coordinator.course.initialLives },
    (_, index) => index < snapshot.stats.lives ? "●" : "○",
  ).join(" ");
  required<HTMLElement>("#displayInstruction").textContent = snapshot.question.instruction;
  required<HTMLElement>("#displayMeta").textContent = `${snapshot.question.difficulty_label} · ${snapshot.question.category}`;
  renderMath(snapshot.question.display_latex, required<HTMLElement>("#displayExpression"));
  required<HTMLElement>("#displayTime").textContent = (snapshot.timer.remainingMs / 1_000).toFixed(1);
  timerFill.style.width = `${snapshot.timer.ratio * 100}%`;
  timerTrack.dataset.urgent = String(snapshot.timer.ratio <= 0.4);
  if (sceneReady) showQuestion(snapshot.question, current, total);
  const timed = coordinator.course.timeLimitSeconds !== null;
  updateUrgency(timed ? snapshot.timer.ratio : 1, timed && snapshot.timer.ratio <= 0.4);
  channel.send({ type: "game-state", snapshot });
}

function broadcastRound(): void {
  if (!coordinator || !controllerConnected) return;
  const snapshot = coordinator.snapshot;
  channel.send({
    type: "round-ready",
    round: snapshot.progress.current,
    total: snapshot.progress.total,
    inputEnabled: snapshot.state === "writing",
  });
  channel.send({ type: "game-state", snapshot });
}

async function handleMessage(message: DualScreenMessage): Promise<void> {
  if (!coordinator) return;
  switch (message.type) {
    case "submission-started":
      if (coordinator.beginSubmission(message.requestId)) {
        displayStatus.textContent = "回答を受け取りました。認識・判定中です。";
        renderSnapshot();
      }
      break;
    case "recognition-completed":
      await completeRecognition(message);
      break;
    case "recognition-failed":
      if (coordinator.failRecognition(message.requestId)) {
        displayStatus.textContent = `${message.message} 液タブの回答は残っています。`;
        renderSnapshot();
        broadcastRound();
      }
      break;
    case "skip-requested":
      await handleForcedResult("skip");
      break;
    case "retry-requested":
      if (coordinator.retry()) {
        displayResult.hidden = true;
        displayStatus.textContent = "同じ問題へ戻りました。失点はまだ確定していません。";
        renderSnapshot();
        broadcastRound();
      }
      break;
    case "advance-requested":
      advance();
      break;
  }
}

async function completeRecognition(message: Extract<DualScreenMessage, { type: "recognition-completed" }>): Promise<void> {
  if (!coordinator || coordinator.snapshot.state !== "recognizing") return;
  const judgementStarted = performance.now();
  try {
    const judgement = await client.judge(coordinator.snapshot.question.id, message.response.normalized_latex);
    const sample: PerformanceSample = {
      encodeMs: message.encodeMs,
      requestMs: message.requestMs,
      judgementMs: performance.now() - judgementStarted,
      feedbackMs: Date.now() - message.feedbackStartedAt,
      response: message.response,
      judgement,
    };
    if (!coordinator.completeRecognition(sample, message.requestId)) return;
    showResult(sample.response, judgement.correct, judgement.expected_latex, judgement.explanation);
    renderSnapshot();
  } catch (error) {
    coordinator.failRecognition(message.requestId);
    displayStatus.textContent = error instanceof Error ? error.message : "判定に失敗しました。";
    renderSnapshot();
    broadcastRound();
  }
}

async function handleForcedResult(reason: "timeout" | "skip"): Promise<void> {
  if (!coordinator || !coordinator.beginForcedResult()) return;
  displayStatus.textContent = reason === "timeout" ? "時間切れです。正答を確認します。" : "正答と考え方を確認します。";
  try {
    const solution = await client.fetchSolution(coordinator.snapshot.question.id);
    coordinator.completeForcedResult(reason, solution);
    showResult(null, false, solution.expected_latex, solution.explanation, reason);
    renderSnapshot();
  } catch (error) {
    coordinator.failRecognition();
    displayStatus.textContent = error instanceof Error ? error.message : "正答を取得できませんでした。";
    renderSnapshot();
    broadcastRound();
  }
}

function showResult(
  response: RecognitionResponse | null,
  correct: boolean,
  expected: string,
  explanation: string,
  reason?: "timeout" | "skip",
): void {
  displayResult.hidden = false;
  displayFinished.hidden = true;
  displayQuestion.hidden = true;
  displayPhaser.hidden = true;
  const verdict = required<HTMLElement>("#displayVerdict");
  verdict.dataset.result = correct ? "correct" : "incorrect";
  verdict.textContent = reason === "timeout" ? "時間切れ" : reason === "skip" ? "解説を確認" : correct ? "正解！" : "もう一度確認";
  if (response) renderMath(response.normalized_latex, required<HTMLElement>("#displayRecognized"));
  else required<HTMLElement>("#displayRecognized").textContent = "未回答";
  renderMath(expected, required<HTMLElement>("#displayExpected"));
  required<HTMLElement>("#displayExplanation").textContent = explanation;
  displayStatus.textContent = reason
    ? "液タブで「次の問題へ」を選んでください。"
    : "液タブで「書き直す」または「次の問題へ」を選んでください。";
}

function advance(): void {
  if (!coordinator) return;
  const outcome = coordinator.advance();
  if (!outcome) return;
  displayResult.hidden = true;
  if (outcome === "finished") {
    renderSnapshot();
    if (timerHandle !== null) window.clearInterval(timerHandle);
    timerHandle = null;
    const snapshot = coordinator.snapshot;
    displayFinished.hidden = false;
    displayQuestion.hidden = true;
    displayPhaser.hidden = true;
    required<HTMLElement>("#displayEndReason").textContent = gameEndMessage(snapshot.endReason, snapshot.stats.answered, snapshot.progress.total);
    required<HTMLElement>("#displayFinalCorrect").textContent = `${snapshot.stats.correct} / ${snapshot.stats.answered} 問正解`;
    const accuracy = snapshot.stats.answered === 0 ? 0 : snapshot.stats.correct / snapshot.stats.answered * 100;
    required<HTMLElement>("#displayFinalSummary").textContent = `正解率 ${accuracy.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;
    displayStatus.textContent = "もう一度挑戦するか、モニター上部の「数学でGO」でタイトルへ戻れます。";
    channel.send({ type: "session-ended", reason: "finished" });
  } else {
    displayQuestion.hidden = false;
    displayPhaser.hidden = false;
    displayStatus.textContent = "次の問題です。液タブに答えを書いてください。";
    renderSnapshot();
    broadcastRound();
  }
}

function returnToSetup(): void {
  if (timerHandle !== null) window.clearInterval(timerHandle);
  timerHandle = null;
  coordinator = null;
  guide.hide();
  displayQuestion.hidden = false;
  displayPhaser.hidden = false;
  gameView.hidden = true;
  setupView.hidden = false;
  channel.send({ type: "session-ended", reason: "title" });
  syncReadiness();
}

function setConnection(element: HTMLElement, text: HTMLElement, state: string, label: string): void {
  element.dataset.state = state;
  text.textContent = label;
}
