import type { DualScreenConnectionState } from "./DualScreenChannel";

export function connectionCopy(state: DualScreenConnectionState): string {
  if (state.incompatible) return "画面のバージョンが違います。両画面を更新してください。";
  if (state.rejectionReason) return "別の入力画面が接続済みです。そちらを使うか閉じてください。この画面は自動で再接続します。";
  return state.connected ? "2画面接続済み" : "相手の画面を待っています";
}
