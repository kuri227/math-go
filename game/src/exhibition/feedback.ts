import type { Snapshot } from "./Session";
import type { Role } from "./view";

export type JudgementFeedback = {
  tone: "correct" | "wrong" | "timeout";
  icon: "✓" | "×" | "⌛";
  label: string;
  title: string;
  message: string;
};

export function resultFeedback(snapshot: Snapshot, role: Role): JudgementFeedback | null {
  if (snapshot.phase !== "result") return null;
  if (snapshot.timedOut) {
    return {
      tone: "timeout",
      icon: "⌛",
      label: "TIME UP",
      title: "時間切れ · 残機 −1",
      message: role === "controller" ? "モニターで正答と解説を確認してください。" : "正答を確認して、次の問題へ進みましょう。",
    };
  }
  if (!snapshot.judgement) return null;
  if (snapshot.judgement.correct) {
    return {
      tone: "correct",
      icon: "✓",
      label: "CORRECT",
      title: "正解！",
      message: role === "controller" ? "正解です！ モニターで解説を確認してください。" : "お見事！ 正答と解説を確認できます。",
    };
  }
  return {
    tone: "wrong",
    icon: "×",
    label: "INCORRECT",
    title: "不正解",
    message: role === "controller" ? "モニターで正答と解説を確認してください。" : "正答候補とは一致しませんでした。",
  };
}

export function retryFeedback(): JudgementFeedback {
  return {
    tone: "wrong",
    icon: "×",
    label: "TRY AGAIN",
    title: "不正解",
    message: "残機は減りません。時間内なら何度でも挑戦できます！",
  };
}
