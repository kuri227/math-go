import "@fontsource-variable/m-plus-1";
import "../dual-screen.css";

import { RecognitionClient } from "../api/RecognitionClient";
import { gameEndMessage } from "../domain/gameEndMessage";
import { BroadcastChannelTransport } from "../dual-screen/BroadcastChannelTransport";
import { DualScreenChannel } from "../dual-screen/DualScreenChannel";
import type { DualScreenMessage } from "../dual-screen/messages";
import { HandwritingPad } from "../ui/HandwritingPad";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const sessionId = new URLSearchParams(window.location.search).get("session");
const connection = required<HTMLElement>("#controllerConnection");
const connectionText = connection.querySelector("strong")!;
const stateText = required<HTMLElement>("#controllerState");
const roundText = required<HTMLElement>("#controllerRound");
const submitButton = required<HTMLButtonElement>("#controllerSubmit");
const undoButton = required<HTMLButtonElement>("#controllerUndo");
const clearButton = required<HTMLButtonElement>("#controllerClear");
const skipButton = required<HTMLButtonElement>("#controllerSkip");
const resultActions = required<HTMLElement>("#controllerResultActions");
const retryButton = required<HTMLButtonElement>("#controllerRetry");
const advanceButton = required<HTMLButtonElement>("#controllerAdvance");
const pad = new HandwritingPad(
  required<HTMLCanvasElement>("#controllerCanvas"),
  required<HTMLElement>("#controllerCanvasHint"),
  required<HTMLElement>("#controllerPointer"),
);
const client = new RecognitionClient();
const fullscreenButton = required<HTMLButtonElement>("#controllerFullscreen");
const fullscreenMessage = required<HTMLElement>("#controllerFullscreenMessage");

function syncFullscreen(): void {
  const active = document.fullscreenElement !== null;
  fullscreenButton.textContent = active ? "全画面を終了" : "全画面にする";
}

fullscreenButton.addEventListener("click", async () => {
  fullscreenMessage.hidden = true;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreenMessage.textContent = "全画面にできませんでした。ブラウザーの全画面機能（F11）も利用できます。";
    fullscreenMessage.hidden = false;
  }
  syncFullscreen();
});
document.addEventListener("fullscreenchange", syncFullscreen);
if (!document.fullscreenEnabled) {
  fullscreenButton.disabled = true;
  fullscreenMessage.textContent = "このブラウザーでは全画面ボタンを利用できません。ブラウザーの全画面機能（F11）をお試しください。";
  fullscreenMessage.hidden = false;
}
syncFullscreen();

let connected = false;
let phase: "waiting" | "writing" | "recognizing" | "result" | "finished" = "waiting";
let channel: DualScreenChannel | null = null;
let currentRound = 0;

if (!sessionId) {
  connection.dataset.state = "error";
  connectionText.textContent = "接続情報がありません";
  stateText.textContent = "モニター画面の「液タブ画面を開く」から開き直してください。";
  syncControls();
} else {
  channel = new DualScreenChannel(
    new BroadcastChannelTransport(`math-go:v1:${sessionId}`),
    sessionId,
    "controller",
  );
  channel.subscribe(handleMessage);
  channel.subscribeConnection((state) => {
    connected = state.connected && !state.incompatible;
    connection.dataset.state = connected ? "ready" : state.incompatible ? "error" : "waiting";
    connectionText.textContent = connected ? "モニター接続済み" : state.incompatible ? "画面の版が一致しません" : "モニターへ再接続中";
    if (!connected) stateText.textContent = "接続が切れました。書いた回答はこの画面に残っています。";
    else if (phase === "waiting") stateText.textContent = "モニターでゲームを開始してください。";
    syncControls();
  });
  channel.start();
}

undoButton.addEventListener("click", () => pad.undo());
clearButton.addEventListener("click", () => pad.clear());
skipButton.addEventListener("click", () => channel?.send({ type: "skip-requested" }));
submitButton.addEventListener("click", () => void submit());
retryButton.addEventListener("click", () => {
  pad.clear();
  channel?.send({ type: "retry-requested" });
});
advanceButton.addEventListener("click", () => channel?.send({ type: "advance-requested" }));
window.addEventListener("beforeunload", () => channel?.close());
syncControls();

async function submit(): Promise<void> {
  if (!channel || !connected || phase !== "writing") return;
  if (!pad.hasInk) {
    stateText.textContent = "回答を書いてから提出してください。";
    required<HTMLElement>("#controllerCanvasWrap").focus({ preventScroll: true });
    return;
  }
  const requestId = crypto.randomUUID();
  const feedbackStartedAt = Date.now();
  phase = "recognizing";
  channel.send({ type: "submission-started", requestId });
  stateText.textContent = "手書きを数式へ変換しています。";
  syncControls();
  try {
    const encodeStarted = performance.now();
    const image = await pad.toCroppedPng();
    const encodeMs = performance.now() - encodeStarted;
    const requestStarted = performance.now();
    const response = await client.recognize(image.blob, requestId);
    const requestMs = performance.now() - requestStarted;
    channel.send({
      type: "recognition-completed",
      requestId,
      response,
      encodeMs,
      requestMs,
      feedbackStartedAt,
    });
    stateText.textContent = "判定結果をモニターへ送信しました。";
  } catch (error) {
    phase = "writing";
    const message = error instanceof Error ? error.message : "認識に失敗しました。";
    channel.send({ type: "recognition-failed", requestId, message });
    stateText.textContent = `${message} 回答は消していません。`;
    syncControls();
  }
}

function handleMessage(message: DualScreenMessage): void {
  if (message.type === "connection-rejected") {
    phase = "waiting";
    connection.dataset.state = "waiting";
    connectionText.textContent = "前の液タブ接続を終了中";
    stateText.textContent = "先の画面が閉じていれば、数秒で自動接続します。再読み込みは不要です。";
    syncControls();
    return;
  }
  if (message.type === "round-ready") {
    if (message.round !== currentRound) {
      currentRound = message.round;
      pad.clear();
    }
    phase = message.inputEnabled ? "writing" : "waiting";
    roundText.textContent = `ROUND ${message.round} / ${message.total}`;
    if (message.inputEnabled) stateText.textContent = "答えを書いて提出してください。";
    resultActions.hidden = true;
    syncControls();
    return;
  }
  if (message.type === "game-state") {
    const state = message.snapshot.state;
    if (state === "result") {
      phase = "result";
      resultActions.hidden = false;
      retryButton.hidden = message.snapshot.result?.kind === "forced";
      stateText.textContent = "結果をモニターで確認し、次の操作を選んでください。";
    } else if (state === "recognizing") {
      phase = "recognizing";
      stateText.textContent = "認識・判定中です。";
    } else if (state === "finished") {
      phase = "finished";
      resultActions.hidden = true;
      const { endReason, stats, progress } = message.snapshot;
      stateText.textContent = `${gameEndMessage(endReason, stats.answered, progress.total)} モニターで結果を確認してください。`;
    }
    syncControls();
    return;
  }
  if (message.type === "session-ended") {
    phase = "finished";
    resultActions.hidden = true;
    if (message.reason === "title") stateText.textContent = "モニターがタイトルへ戻りました。";
    syncControls();
  }
}

function syncControls(): void {
  const writing = connected && phase === "writing";
  undoButton.disabled = !writing;
  clearButton.disabled = !writing;
  skipButton.disabled = !writing;
  submitButton.disabled = !writing;
  retryButton.disabled = !connected || phase !== "result";
  advanceButton.disabled = !connected || phase !== "result";
  pad.setDisabled(!writing);
  submitButton.textContent = phase === "recognizing" ? "認識・判定中…" : "回答を提出";
}
