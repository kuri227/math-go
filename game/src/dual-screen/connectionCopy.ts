import type { DualScreenConnectionState } from "./DualScreenChannel";
import type { DualScreenRole } from "./messages";

export function connectionCopy(state: DualScreenConnectionState, role: DualScreenRole = "controller"): string {
  if (state.incompatible) return "画面のバージョンが違います。両画面を更新してください。";
  if (state.rejectionReason) return `別の${role === "display" ? "問題表示" : "入力"}画面が接続済みです。そちらを使うか閉じてください。この画面は自動で再接続します。`;
  return state.connected ? "2画面接続済み" : "もう一方の画面を待っています";
}
