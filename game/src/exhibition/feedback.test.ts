import { describe, expect, it } from "vitest";
import type { Snapshot } from "./Session";
import { resultFeedback, retryFeedback } from "./feedback";

const snapshot = (overrides: Partial<Snapshot>): Snapshot => ({
  phase: "result",
  timedOut: false,
  skipped: false,
  judgement: { correct: true },
  ...overrides,
} as Snapshot);

describe("judgement feedback", () => {
  it("uses explicit text for a correct answer", () => {
    expect(resultFeedback(snapshot({}), "display")).toMatchObject({ tone: "correct", title: "正解！" });
  });

  it("highlights three or more correct answers and distinguishes harder questions", () => {
    const question = { difficulty: 4 } as Snapshot["question"];
    expect(resultFeedback(snapshot({ question, streak: 2 }), "display")?.streakLabel).toBeUndefined();
    expect(resultFeedback(snapshot({ question, streak: 3 }), "display")?.streakLabel).toBe("難問連続正解中 · 3問");
    expect(resultFeedback(snapshot({ streak: 3 }), "controller")?.streakLabel).toBe("連続正解中 · 3問");
  });

  it("distinguishes wrong answers and timeouts without relying on color", () => {
    expect(resultFeedback(snapshot({ judgement: { correct: false } as Snapshot["judgement"] }), "display")).toMatchObject({ tone: "wrong", title: "不正解" });
    expect(resultFeedback(snapshot({ mode: "exhibition", timedOut: true, judgement: null }), "display")).toMatchObject({ tone: "timeout", title: "時間切れ · 残機 −1" });
    expect(resultFeedback(snapshot({ mode: "test", timedOut: true, judgement: null }), "display")).toMatchObject({ tone: "timeout", title: "時間切れ" });
  });

  it("labels skipped questions separately from wrong answers", () => {
    expect(resultFeedback(snapshot({ mode: "test", skipped: true, judgement: null }), "display")).toMatchObject({ tone: "skip", title: "スキップ" });
    expect(resultFeedback(snapshot({ mode: "exhibition", skipped: true }), "display")).toMatchObject({ tone: "skip", title: "スキップ · 残機 −1" });
    expect(resultFeedback(snapshot({ mode: "exhibition", phase: "finished", endReason: "skip", skipped: true }), "controller")?.message).toContain("残機が0");
  });

  it("explains that exhibition wrong answers can be retried", () => {
    expect(retryFeedback().message).toContain("何度でも挑戦");
  });
});
