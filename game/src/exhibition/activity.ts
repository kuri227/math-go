import type { Snapshot } from "./Session";

/** One source for the clock label, warning sound and visible activity state. */
export function clockRunning(s: Snapshot): boolean {
  return s.mode === "exhibition" && !s.paused && s.phase === "writing";
}

export function activity(s: Snapshot): { title: string; description: string; busy: boolean } | null {
  const clock = s.mode === "test" ? "時間制限なし" : "時計停止中";
  if (s.paused) return { title: `接続待ち · ${clock}`, description: "2つの画面が接続すると再開します。書いた内容は残っています。", busy: false };
  if (s.phase === "recognizing") return { title: `手書きを認識しています · ${clock}`, description: "画像から数式を読み取っています。CPUでは数秒かかる場合があります。そのままお待ちください。", busy: true };
  if (s.phase === "preview") return { title: `認識内容を確認中 · ${clock}`, description: "画像と数式を見比べてください。合っていれば回答、違う場合は書き直せます。" + (s.mode === "exhibition" ? "書き直し中は時計が再開します。" : "時間を気にせず確認できます。"), busy: false };
  if (s.phase === "judging") return { title: `回答を判定しています · ${clock}`, description: "送信した内容を確認しています。そのままお待ちください。", busy: true };
  return null;
}
