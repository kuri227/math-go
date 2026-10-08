import { describe, expect, it } from "vitest";
import katex from "katex";
import bank from "../../../config/game_questions.json";
import { courses } from "../domain/courses";
import { selectQuestions } from "../domain/questionSelection";
import type { Question, PerformanceSample } from "../domain/types";
import { GameCoordinator } from "./GameCoordinator";
import { formulaScale } from "../game/formulaLayout";

const questions: Question[] = bank.questions.map(q => ({ id: q.id, instruction: q.instruction, display: q.question, display_latex: q.question_latex, category: q.category, difficulty: q.difficulty, difficulty_label: String(q.difficulty) }));

function sample(id: string, correct: boolean): PerformanceSample {
  return {
    encodeMs: 1, requestMs: 2, judgementMs: 1, feedbackMs: 4,
    response: { request_id: id, model: "test", model_variant: "test", device: "cpu", raw_latex: "x", normalized_latex: "x", timing: { preprocessing_ms: 0, queue_ms: 0, inference_ms: 1, total_ms: 1 }, image: { width: 1, height: 1, bytes: 1 }, initialization_ms: 0, peak_vram_mb: null },
    judgement: { question_id: id, correct, recognized_latex: "x", recognized_normalized: "x", expected_latex: "x", explanation: "test", judge_method: "test", message: "test" },
  };
}

describe("exhibition bank rendering", () => {
  it.each(bank.questions)("renders $id prompt and every answer without a KaTeX error", q => {
    for (const latex of [q.question_latex, ...q.answer]) {
      expect(() => katex.renderToString(latex, { throwOnError: true, strict: "ignore" })).not.toThrow();
    }
  });
});

describe("exhibition session stress", () => {
  for (const course of Object.values(courses)) {
    for (let difficulty = 1; difficulty <= 7; difficulty++) {
      it(`${course.id}/level ${difficulty}: 100 full and early-finish sessions`, () => {
        const selected = selectQuestions(questions, difficulty, course.questionCount);
        expect(selected).toHaveLength(course.questionCount);
        expect(selected.every(q => q.difficulty <= difficulty)).toBe(true);
        for (let run = 0; run < 100; run++) {
          const coordinator = new GameCoordinator(selected, course, () => 0);
          coordinator.beginWriting();
          const correct = run % 2 === 0;
          const expectedRounds = correct ? course.questionCount : Math.min(course.initialLives, course.questionCount);
          for (let round = 0; round < expectedRounds; round++) {
            const id = `${run}-${round}`;
            expect(coordinator.beginSubmission(id)).toBe(true);
            expect(coordinator.beginSubmission(id)).toBe(false);
            expect(coordinator.completeRecognition(sample(id, correct), id)).toBe(true);
            expect(coordinator.advance()).toBe(round + 1 === expectedRounds ? "finished" : "next");
          }
          expect(coordinator.snapshot.stats.answered).toBe(expectedRounds);
          expect(coordinator.snapshot.stats.correct).toBe(correct ? expectedRounds : 0);
          expect(coordinator.snapshot.endReason).toBe(correct ? "all-questions-completed" : "lives-exhausted");
          expect(coordinator.advance()).toBeNull();
        }
      });
    }
  }
  it("fits 20,000 formula dimensions/time/viewport combinations", () => {
    for (const width of [320, 390, 640, 957, 1280]) {
      for (const height of [40, 70, 145, 170]) {
        for (let size = 1; size <= 50; size++) {
          for (let tick = 0; tick < 20; tick++) {
            const formulaWidth = size * 24, formulaHeight = size * 4;
            const scale = formulaScale(formulaWidth, formulaHeight, width - 44, height, tick / 19);
            expect(Number.isFinite(scale)).toBe(true);
            expect(scale).toBeGreaterThan(0);
            expect(formulaWidth * scale).toBeLessThanOrEqual(width - 44 + 1e-6);
            expect(formulaHeight * scale).toBeLessThanOrEqual(height + 1e-6);
          }
        }
      }
    }
  });
});
