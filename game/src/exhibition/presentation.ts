import type { Phase, Snapshot } from "./Session";
import type { Role } from "./view";

export type Paper = "answer" | "memo";

const ANSWER_REPLICA_PHASES = new Set<Phase>(["writing", "recognizing", "preview", "judging"]);

/** Show a whole remaining second until it has completely elapsed. */
export function remainingSeconds(remainingMs: number): number {
  if (!Number.isFinite(remainingMs)) return 0;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** The live ink replica is useful while answering, but becomes stale result-page content afterwards. */
export function answerReplicaVisible(role: Role, phase: Phase): boolean {
  return role === "display" && ANSWER_REPLICA_PHASES.has(phase);
}

/** The result card owns result messaging wherever the problem and solution share one screen. */
export function playNoticeVisible(role: Role, phase: Phase): boolean {
  return role === "controller" || phase !== "result";
}

/** Keep problem content and solutions on the Display while preserving progress state. */
export function toControllerSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    question: snapshot.question
      ? { ...snapshot.question, instruction: "", display: "", display_latex: "", prompt: null }
      : null,
    judgement: snapshot.judgement
      ? { ...snapshot.judgement, expected_latex: "", explanation: "" }
      : null,
  };
}

export function playNotice(
  snapshot: Snapshot,
  role: Role,
  connected: boolean,
  activePaper: Paper,
): string {
  if (!connected) return "もう一方の画面との接続が切れました。再接続まで時計を止めています。";
  if (snapshot.phase === "countdown") return snapshot.notice;
  if (snapshot.paused) return "入力画面を再接続してください。時計を止めています。";
  if (snapshot.notice) return snapshot.notice;
  if (role === "display") return "入力画面に答えを書き、読み取りを確認してから回答してください。";
  if (snapshot.phase === "writing" && activePaper === "memo") {
    return "このメモは採点・保存・モニター同期の対象外です。回答は回答用紙に書いてください。";
  }
  return "答えを書いて「読み取りを確認」を押してください。";
}
