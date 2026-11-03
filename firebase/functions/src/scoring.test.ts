import { describe, expect, it } from "vitest";
import { normalizeRun, scoreRun } from "./scoring.js";

const run = (remainingMs = 10_000) => ({
  runId: "11111111-1111-4111-8111-111111111111",
  deviceId: "22222222-2222-4222-8222-222222222222",
  displayName: "プレイヤー",
  difficulty: 1,
  ruleVersion: 1,
  rounds: Array.from({ length: 10 }, (_, i) => ({ questionId: `q-${i}`, correct: true, remainingMs, limitMs: 15_000, wrongAttempts: 0 })),
});

describe("ranking score validation", () => {
  it("recomputes the documented maximum without trusting a client score", () => {
    expect(scoreRun(normalizeRun(run()))).toMatchObject({ score: 16_000, correct: 10, gold: 10 });
  });
  it("rejects extra fields, duplicate questions and impossible time", () => {
    expect(() => normalizeRun({ ...run(), score: 999_999 })).toThrow("UNKNOWN_FIELD");
    const duplicate = run(); duplicate.rounds[1]!.questionId = "q-0";
    expect(() => normalizeRun(duplicate)).toThrow("INVALID_QUESTION_ID");
    const impossible = run(); impossible.rounds[0]!.remainingMs = 15_001;
    expect(() => normalizeRun(impossible)).toThrow("INVALID_TIME");
  });
  it("rejects controls in display names", () => {
    expect(() => normalizeRun({ ...run(), displayName: "name\nadmin" })).toThrow("INVALID_DISPLAY_NAME");
  });
});
