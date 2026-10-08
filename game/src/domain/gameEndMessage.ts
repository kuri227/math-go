import type { GameEndReason } from "./types";

export function gameEndMessage(reason: GameEndReason | null, answered: number, total: number): string {
  switch (reason) {
    case "all-questions-completed":
      return `全${total}問を終えたため終了しました。`;
    case "lives-exhausted":
      return `残機が0になったため、${answered}問目で終了しました（全${total}問）。`;
    default:
      return "ゲームが終了しました。";
  }
}
