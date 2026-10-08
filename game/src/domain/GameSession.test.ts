import { describe, expect, it } from "vitest";
import { GameSession } from "./GameSession";

const sample = [
  { id: "a", instruction: "A", display: "x", display_latex: "x", category: "A", difficulty: 1, difficulty_label: "小学校低学年" },
  { id: "b", instruction: "B", display: "y", display_latex: "y", category: "B", difficulty: 1, difficulty_label: "小学校低学年" },
];

describe("GameSession", () => {
  it("counts correct answers and finishes at the end", () => {
    const session = new GameSession(sample);
    expect(session.question.id).toBe("a");
    expect(session.commit(true, 800)).toBe(false);
    expect(session.question.id).toBe("b");
    expect(session.stats.correct).toBe(1);
    expect(session.stats.streak).toBe(1);
    expect(session.commit(false, 1200)).toBe(true);
    expect(session.state).toBe("finished");
    expect(session.endReason).toBe("all-questions-completed");
    expect(session.stats.lives).toBe(2);
    expect(session.stats.averageFeedbackMs).toBe(1000);
  });

  it("rejects an empty question set", () => {
    expect(() => new GameSession([])).toThrow("At least one question");
  });

  it("restarts with clean counts and three lives", () => {
    const session = new GameSession(sample);
    session.commit(false, 500);
    session.restart();
    expect(session.question.id).toBe("a");
    expect(session.stats).toEqual({
      lives: 3,
      streak: 0,
      correct: 0,
      answered: 0,
      averageFeedbackMs: 0,
    });
  });

  it("supports course lives and counts answers without weighted scores", () => {
    const session = new GameSession(sample, 2);
    session.commit(true, 300);
    expect(session.stats.correct).toBe(1);
    session.commit(false, 0);
    expect(session.stats.lives).toBe(1);
    session.restart();
    expect(session.stats.lives).toBe(2);
  });

  it("reports depleted lives before the final question and resets the reason on restart", () => {
    const session = new GameSession(sample, 1);
    expect(session.endReason).toBeNull();
    expect(session.commit(false, 0)).toBe(true);
    expect(session.endReason).toBe("lives-exhausted");
    expect(session.progress).toEqual({ current: 1, total: 2 });
    session.commit(true, 200);
    expect(session.stats.answered).toBe(1);
    session.restart();
    expect(session.endReason).toBeNull();
  });

  it("prioritizes completing all questions over lives exhausted on the last question", () => {
    const session = new GameSession(sample, 2);
    expect(session.commit(false, 100)).toBe(false);
    expect(session.commit(false, 0)).toBe(true);
    expect(session.endReason).toBe("all-questions-completed");
    expect(session.stats).toMatchObject({ answered: 2, correct: 0, lives: 0, averageFeedbackMs: 100 });
  });
});

