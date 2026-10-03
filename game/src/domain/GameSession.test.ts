import { describe, expect, it } from "vitest";
import { GameSession } from "./GameSession";

const sample = [
  { id: "a", instruction: "A", display: "x", category: "A", difficulty: "easy" },
  { id: "b", instruction: "B", display: "y", category: "B", difficulty: "easy" },
];

describe("GameSession", () => {
  it("scores a correct answer and finishes at the end", () => {
    const session = new GameSession(sample);
    expect(session.question.id).toBe("a");
    expect(session.commit(true, 800)).toBe(false);
    expect(session.question.id).toBe("b");
    expect(session.stats.score).toBe(100);
    expect(session.stats.streak).toBe(1);
    expect(session.commit(false, 1200)).toBe(true);
    expect(session.state).toBe("finished");
    expect(session.stats.lives).toBe(2);
    expect(session.stats.averageFeedbackMs).toBe(1000);
  });

  it("rejects an empty question set", () => {
    expect(() => new GameSession([])).toThrow("At least one question");
  });

  it("restarts with a clean score and three lives", () => {
    const session = new GameSession(sample);
    session.commit(false, 500, true);
    session.restart();
    expect(session.question.id).toBe("a");
    expect(session.stats).toEqual({
      score: 0,
      lives: 3,
      streak: 0,
      correct: 0,
      answered: 0,
      averageFeedbackMs: 0,
    });
  });

  it("supports course lives and a speed bonus", () => {
    const session = new GameSession(sample, 2);
    session.commit(true, 300, false, 45);
    expect(session.stats.score).toBe(145);
    session.commit(false, 0);
    expect(session.stats.lives).toBe(1);
    session.restart();
    expect(session.stats.lives).toBe(2);
  });
});

