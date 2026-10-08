import { describe, expect, it } from "vitest";
import { courses } from "../domain/courses";
import type { PerformanceSample, Question } from "../domain/types";
import { GameCoordinator } from "./GameCoordinator";

const questions: Question[] = [
  { id: "a", instruction: "A", display: "x", display_latex: "x", category: "式", difficulty: 1, difficulty_label: "小学校" },
  { id: "b", instruction: "B", display: "y", display_latex: "y", category: "式", difficulty: 1, difficulty_label: "小学校" },
];

function sample(correct: boolean): PerformanceSample {
  return {
    encodeMs: 1,
    requestMs: 2,
    judgementMs: 3,
    feedbackMs: 6,
    response: {
      request_id: "request-1",
      model: "texteller",
      model_variant: "3.0",
      device: "cpu",
      raw_latex: "x",
      normalized_latex: "x",
      timing: { preprocessing_ms: 0, queue_ms: 0, inference_ms: 1, total_ms: 1 },
      image: { width: 1, height: 1, bytes: 1 },
      initialization_ms: null,
      peak_vram_mb: null,
    },
    judgement: {
      question_id: "a",
      correct,
      recognized_latex: "x",
      recognized_normalized: "x",
      expected_latex: "x",
      explanation: "説明",
      judge_method: "normalized_alias",
      message: "判定",
    },
  };
}

describe("GameCoordinator", () => {
  it("broadcasts the early finish reason after lives run out", () => {
    const coordinator = new GameCoordinator(questions, { ...courses.practice, initialLives: 1 }, () => 0);
    coordinator.beginWriting();
    coordinator.beginForcedResult();
    coordinator.completeForcedResult("skip", { question_id: "a", expected_latex: "x", explanation: "説明" });
    expect(coordinator.advance()).toBe("finished");
    expect(coordinator.snapshot.endReason).toBe("lives-exhausted");
    expect(coordinator.snapshot.stats).toMatchObject({ answered: 1, lives: 0 });
  });
  it("keeps untimed practice at the normal question ratio", () => {
    let now = 0;
    const coordinator = new GameCoordinator(questions, courses.practice, () => now);
    coordinator.beginWriting();
    now = 60_000;
    expect(coordinator.tick()).toBeNull();
    expect(coordinator.snapshot.timer).toEqual({ remainingMs: 0, ratio: 1, running: false });
  });

  it("includes the final answer in the finished correct count", () => {
    const coordinator = new GameCoordinator(questions, courses.practice, () => 0);
    coordinator.beginWriting();
    coordinator.beginSubmission("first");
    coordinator.completeRecognition(sample(true), "first");
    expect(coordinator.advance()).toBe("next");
    coordinator.beginSubmission("last");
    coordinator.completeRecognition(sample(true), "last");
    expect(coordinator.advance()).toBe("finished");
    expect(coordinator.snapshot.endReason).toBe("all-questions-completed");
    expect(coordinator.snapshot.stats).toMatchObject({ correct: 2, answered: 2, streak: 2 });
  });
  it("stops the timer as soon as a submission starts and rejects duplicates", () => {
    let now = 0;
    const coordinator = new GameCoordinator(questions, courses.challenge, () => now);
    coordinator.beginWriting();
    now = 4_000;
    expect(coordinator.beginSubmission("same-request")).toBe(true);
    expect(coordinator.snapshot.timer.remainingMs).toBe(16_000);
    now = 10_000;
    expect(coordinator.snapshot.timer.remainingMs).toBe(16_000);
    expect(coordinator.beginSubmission("same-request")).toBe(false);
  });

  it("keeps a failed recognition on the same round", () => {
    const coordinator = new GameCoordinator(questions, courses.challenge, () => 0);
    coordinator.beginWriting();
    coordinator.beginSubmission("request");
    coordinator.failRecognition();
    expect(coordinator.snapshot.state).toBe("writing");
    expect(coordinator.snapshot.question.id).toBe("a");
  });

  it("commits a result only when advance is requested", () => {
    const coordinator = new GameCoordinator(questions, courses.challenge, () => 0);
    coordinator.beginWriting();
    coordinator.beginSubmission("request");
    coordinator.completeRecognition(sample(true), "request");
    expect(coordinator.snapshot.stats.answered).toBe(0);
    expect(coordinator.advance()).toBe("next");
    expect(coordinator.snapshot.stats.answered).toBe(1);
    expect(coordinator.snapshot.question.id).toBe("b");
  });

  it("ignores a delayed result from an older request", () => {
    const coordinator = new GameCoordinator(questions, courses.challenge, () => 0);
    coordinator.beginWriting();
    coordinator.beginSubmission("old-request");
    coordinator.failRecognition("old-request");
    coordinator.beginSubmission("new-request");
    expect(coordinator.completeRecognition(sample(true), "old-request")).toBe(false);
    expect(coordinator.snapshot.state).toBe("recognizing");
    expect(coordinator.completeRecognition(sample(true), "new-request")).toBe(true);
    expect(coordinator.snapshot.state).toBe("result");
  });

  it("recovers an interrupted submission as writing while keeping the timer paused", () => {
    const coordinator = new GameCoordinator(questions, courses.challenge, () => 0);
    coordinator.beginWriting();
    coordinator.beginSubmission("request");
    expect(coordinator.pauseForDisconnect()).toBe(true);
    expect(coordinator.snapshot.state).toBe("writing");
    expect(coordinator.snapshot.timer.running).toBe(false);
    coordinator.resumeAfterReconnect();
    expect(coordinator.snapshot.timer.running).toBe(true);
  });
});
