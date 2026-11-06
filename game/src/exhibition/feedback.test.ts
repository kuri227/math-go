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

  it("distinguishes wrong answers and timeouts without relying on color", () => {
    expect(resultFeedback(snapshot({ judgement: { correct: false } as Snapshot["judgement"] }), "display")).toMatchObject({ tone: "wrong", title: "不正解" });
    expect(resultFeedback(snapshot({ mode: "exhibition", timedOut: true, judgement: null }), "display")).toMatchObject({ tone: "timeout", title: "時間切れ · 残機 −1" });
    expect(resultFeedback(snapshot({ mode: "test", timedOut: true, judgement: null }), "display")).toMatchObject({ tone: "timeout", title: "時間切れ" });
  });

  it("labels skipped questions separately from wrong answers", () => {
    expect(resultFeedback(snapshot({ skipped: true, judgement: null }), "display")).toMatchObject({ tone: "skip", title: "スキップ" });
  });

  it("explains that exhibition wrong answers can be retried", () => {
    expect(retryFeedback().message).toContain("何度でも挑戦");
  });
});
