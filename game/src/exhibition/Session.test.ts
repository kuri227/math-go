import { describe, it, expect } from "vitest";
import bank from "../../../config/game_questions.json";
import katex from "katex";
import { Session, chooseExhibition } from "./Session";
import { splitMath } from "./richText";
import type { Question, RecognitionResponse, JudgementResponse } from "../domain/types";

const questions: Question[] = bank.questions.map(q => ({ ...q, review_status: q.review_status as Question["review_status"], display: q.question, display_latex: q.question_latex, difficulty_label: String(q.difficulty) }));
const recognized = (id: string, raw = "3"): RecognitionResponse => ({ request_id: id, model: "texteller", model_variant: "3", device: "cpu", raw_latex: raw, normalized_latex: raw, timing: { inference_ms: 1, preprocessing_ms: 1, queue_ms: 0, total_ms: 2 }, image: { width: 10, height: 10, bytes: 1 }, initialization_ms: null, peak_vram_mb: null });
const judged = (correct: boolean, id = questions[0]!.id): JudgementResponse => ({ question_id: id, correct, recognized_latex: "3", recognized_normalized: "3", expected_latex: "3", explanation: "説明", judge_method: "normalized_alias", message: "" });
function submit(session: Session, correct: boolean, id = crypto.randomUUID()): void {
  expect(session.beginRecognition(id)).toBe(true); expect(session.recognized(id, recognized(id))).toBe(true);
  expect(session.snapshot.judgement).toBeNull(); // preview is not a submission
  expect(session.beginJudge(id)).toBe(true); expect(session.judged(id, judged(correct, session.snapshot.question!.id))).toBe(true);
}

describe("two-mode game rules", () => {
  it("waits for controller readiness, counts down three seconds, then starts the clock", () => {
    let now = 0; const session = new Session(questions.slice(0, 1), "exhibition", () => now);
    expect(session.beginCountdown()).toBe(true);
    now = 60_000; session.tick();
    expect(session.snapshot.phase).toBe("countdown");
    expect(session.snapshot.remainingMs).toBe(20_000);
    expect(session.readyForCountdown()).toBe(true);
    now += 2_999; session.tick(); expect(session.snapshot.phase).toBe("countdown");
    now += 1; session.tick(); expect(session.snapshot.phase).toBe("writing");
    expect(session.snapshot.remainingMs).toBe(20_000);
    now += 1_000; session.tick(); expect(session.snapshot.remainingMs).toBe(19_000);
  });
  it("cancels a disconnected countdown without revealing the problem", () => {
    const session = new Session(questions.slice(0, 1), "exhibition");
    session.beginCountdown(); expect(session.cancelCountdown()).toBe(true);
    expect(session.snapshot.phase).toBe("guide"); expect(session.snapshot.countdownRemainingMs).toBe(0);
  });
  it("prepares the next question without charging time before readiness", () => {
    const session = new Session(questions.slice(0, 2), "test"); session.start(); submit(session, true);
    expect(session.next(true)).toBe(true); expect(session.snapshot.phase).toBe("countdown"); expect(session.snapshot.paused).toBe(true);
    expect(session.readyForCountdown()).toBe(true); expect(session.snapshot.phase).toBe("writing");
  });
  it("keeps the first terminal reason when an old stop action arrives again", () => {
    const session = new Session(questions.slice(0, 1), "test"); session.start(); submit(session, true); session.next();
    session.finish("stopped"); expect(session.snapshot.endReason).toBe("completed");
  });
  it("allows unlimited wrong answers without leaving the question or resetting time", () => {
    let now = 0; const session = new Session(questions.slice(0, 7), "exhibition", () => now); session.start();
    for (let i = 0; i < 50; i++) { now += 100; submit(session, false); expect(session.snapshot.phase).toBe("writing"); expect(session.snapshot.round).toBe(1); }
    expect(session.snapshot.wrongAttempts).toBe(50); expect(session.snapshot.remainingMs).toBe(15000);
    expect(session.snapshot.lives).toBe(3);
    expect(session.snapshot.judgement).toBeNull();
  });
  it("charges only writing time, not recognition, preview or judgement time", () => {
    let now = 0; const session = new Session(questions.slice(0, 1), "exhibition", () => now); session.start();
    now = 5000; session.beginRecognition("a"); now = 100000; session.tick(); expect(session.snapshot.remainingMs).toBe(15000);
    session.recognized("a", recognized("a")); now += 2000; session.tick(); expect(session.snapshot.remainingMs).toBe(15000);
    session.beginJudge("a"); now += 50000; session.tick(); expect(session.snapshot.remainingMs).toBe(15000);
    session.judged("a", judged(false)); now += 1000; session.tick(); expect(session.snapshot.remainingMs).toBe(14000);
  });
  it("preserves time during preview, resumes on rewrite, and rejects late operations after writing timeout", () => {
    let now = 0; const session = new Session(questions.slice(0, 1), "exhibition", () => now); session.start();
    session.beginRecognition("a"); session.recognized("a", recognized("a")); now = 20001;
    session.tick(); expect(session.snapshot.remainingMs).toBe(20000); expect(session.snapshot.lives).toBe(3);
    expect(session.rewrite()).toBe(true); now += 20001; session.tick();
    expect(session.beginJudge("late")).toBe(false); expect(session.snapshot.phase).toBe("result"); expect(session.snapshot.lives).toBe(2); expect(session.rewrite()).toBe(false);
    session.tick(); session.tick(); expect(session.snapshot.lives).toBe(2);
    session.next(); expect(session.snapshot.endReason).toBe("completed");
  });
  it("resets time on the next question and ends on the third timeout only", () => {
    let now = 0; const session = new Session(questions.slice(0, 7), "exhibition", () => now); session.start();
    for (let loss = 1; loss <= 3; loss++) {
      now += 20001; expect(session.tick()).toBe(true); expect(session.snapshot.lives).toBe(3 - loss);
      expect(session.snapshot.round).toBe(loss); expect(session.snapshot.attempts).toBe(0);
      if (loss < 3) { expect(session.snapshot.phase).toBe("result"); session.next(); expect(session.snapshot.remainingMs).toBe(20000); expect(session.snapshot.timedOut).toBe(false); }
    }
    expect(session.snapshot.endReason).toBe("timeout"); expect(session.next()).toBe(false);
  });
  it("finishes after the final question with lives remaining, but prioritizes life zero on final timeout", () => {
    let now = 0; const session = new Session(questions.slice(0, 3), "exhibition", () => now); session.start();
    for (let i = 0; i < 3; i++) { now += 20001; session.tick(); if (i < 2) session.next(); }
    expect(session.snapshot.round).toBe(3); expect(session.snapshot.endReason).toBe("timeout");
    const other = new Session(questions.slice(0, 2), "exhibition", () => now); other.start();
    now += 20001; other.tick(); other.next(); submit(other, true); other.next();
    expect(other.snapshot.endReason).toBe("completed"); expect(other.snapshot.lives).toBe(2);
  });
  it("never times out in test mode, and retesting cannot inflate unique correct count", () => {
    let now = 0; const session = new Session(questions.slice(0, 1), "test", () => now); session.start();
    now = 10e10; expect(session.tick()).toBe(false);
    expect(session.snapshot.lives).toBeNull();
    for (let i = 0; i < 5; i++) { submit(session, true); if (i < 4) session.retryTest(); }
    expect(session.snapshot.correct).toBe(1); expect(session.snapshot.attempts).toBe(5);
    session.next(); expect(session.snapshot.endReason).toBe("completed");
  });
  it("requires confirmation, rejects duplicate and out-of-order responses", () => {
    const s = new Session(questions.slice(0, 1), "test"); s.start();
    expect(s.beginJudge("x")).toBe(false); s.beginRecognition("a");
    expect(s.beginRecognition("duplicate")).toBe(false); expect(s.recognized("old", recognized("old"))).toBe(false);
    expect(s.recognized("a", recognized("other"))).toBe(false); s.recognized("a", recognized("a"));
    expect(s.judged("a", judged(true))).toBe(false); s.beginJudge("judge");
    expect(s.judged("judge", judged(true, "wrong-question"))).toBe(false); s.judged("judge", judged(true));
    expect(s.judged("judge", judged(true))).toBe(false); expect(s.snapshot.attempts).toBe(1);
  });
  it("pauses on disconnect and cancels a missing controller's in-flight recognition", () => {
    let now = 0; const s = new Session(questions.slice(0, 1), "exhibition", () => now); s.start();
    now += 1000; s.beginRecognition("a"); s.pause(true); s.cancelRecognition(); now += 100000; s.tick(); expect(s.snapshot.remainingMs).toBe(19000);
    s.pause(false); expect(s.recognized("a", recognized("a"))).toBe(false); now += 1000; s.tick(); expect(s.snapshot.remainingMs).toBe(18000);
  });
  it("errors preserve the original time and allow retry", () => {
    const s = new Session(questions.slice(0, 1), "test"); s.start(); s.beginRecognition("a");
    expect(s.fail("stale", "error")).toBe(false); s.fail("a", "retry"); expect(s.snapshot.phase).toBe("writing");
    s.beginRecognition("b"); s.recognized("b", recognized("b")); s.beginJudge("j"); s.fail("j", "retry"); expect(s.snapshot.phase).toBe("preview");
  });
  for (let d = 1; d <= 7; d++) {
    it(`level ${d}: seven distinct approved questions and 100 complete game runs`, () => {
      for (let i = 0; i < 100; i++) {
        const chosen = chooseExhibition(questions, d); expect(chosen).toHaveLength(7); expect(new Set(chosen.map(q => q.id)).size).toBe(7);
        expect(chosen.every(q => q.difficulty === d && q.exhibition_enabled && q.review_status === "approved")).toBe(true);
        const session = new Session(chosen, "exhibition", () => 0); session.start();
        for (let j = 0; j < 7; j++) { submit(session, false); submit(session, true); session.next(); }
        expect(session.snapshot.correct).toBe(7); expect(session.snapshot.endReason).toBe("completed"); expect(session.snapshot.attempts).toBe(14);
      }
    });
  }
  it("excludes pending/disabled questions even if their ranks are easier", () => {
    const copy = questions.map(q => ({ ...q, exhibition_enabled: false })); expect(chooseExhibition(copy, 1)).toEqual([]);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 15])("selects the configured %i-question game length", count => {
    const chosen = chooseExhibition(questions, 1, () => 0.5, count);
    expect(chosen).toHaveLength(count);
    expect(new Set(chosen.map(question => question.id)).size).toBe(count);
  });
  it.each([0, 16, 1.5])("rejects invalid game length %s", count => {
    expect(() => chooseExhibition(questions, 1, Math.random, count)).toThrow("問題数は1〜15問");
  });
});

describe("all imported mixed prompts, explanations and answers", () => {
  it.each(bank.questions)("renders $id without an invalid LaTeX fragment", q => {
    const math = [q.question_latex, ...q.answer, ...[q.prompt, q.description].flatMap(text => splitMath(text ?? "").filter(p => p.math).map(p => p.text))];
    for (const latex of math) expect(() => katex.renderToString(latex, { throwOnError: true, trust: false, strict: "ignore" })).not.toThrow();
  });
  it("does not classify plain HTML as math", () => { expect(splitMath("<script>bad</script>")[0]).toEqual({ math: false, text: "<script>bad</script>" }); });
});
