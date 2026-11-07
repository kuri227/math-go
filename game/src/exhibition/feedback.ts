import type { Snapshot } from "./Session";
import type { Role } from "./view";

export type JudgementFeedback = {
  tone: "correct" | "wrong" | "timeout" | "skip";
  title: string;
  message: string;
  streakLabel?: string;
};

export function resultFeedback(snapshot: Snapshot, role: Role): JudgementFeedback | null {
  const lastLifeSkipped = snapshot.phase === "finished" && snapshot.endReason === "skip";
  if (snapshot.phase !== "result" && !lastLifeSkipped) return null;
  if (snapshot.skipped) {
    return {
      tone: "skip",
      title: snapshot.mode === "exhibition" ? "スキップ · 残機 −1" : "スキップ",
      message: lastLifeSkipped ? "残機が0になり、チャレンジ終了です。"
        : role === "controller" ? "モニターで正答と解説を確認してください。" : "正答と解説を確認して、次へ進みましょう。",
    };
  }
  if (snapshot.timedOut) {
    return {
      tone: "timeout",
      title: snapshot.mode === "test" ? "時間切れ" : "時間切れ · 残機 −1",
      message: role === "controller"
        ? "モニターで正答と解説を確認してください。"
        : snapshot.mode === "test"
          ? "正答を確認し、再テストまたは次の問題へ進めます。"
          : "正答を確認して、次の問題へ進みましょう。",
    };
  }
  if (!snapshot.judgement) return null;
  if (snapshot.judgement.correct) {
    const streakLabel = snapshot.streak >= 3
      ? `${(snapshot.question?.difficulty ?? 0) >= 4 ? "難問連続正解中" : "連続正解中"} · ${snapshot.streak}問`
      : undefined;
    return {
      tone: "correct",
      title: "正解！",
      streakLabel,
      message: role === "controller" ? "正解です！ モニターで解説を確認してください。" : "お見事！ 正答と解説を確認できます。",
    };
  }
  return {
    tone: "wrong",
    title: "不正解",
    message: role === "controller" ? "モニターで正答と解説を確認してください。" : "正答候補とは一致しませんでした。",
  };
}

export function retryFeedback(): JudgementFeedback {
  return {
    tone: "wrong",
    title: "不正解",
    message: "残機は減りません。時間内なら何度でも挑戦できます！",
  };
}
