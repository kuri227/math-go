import { describe, expect, it } from "vitest";
import bank from "../../../config/game_questions.json";
import { Session, type Snapshot } from "./Session";
import {
  answerReplicaVisible,
  playNotice,
  playNoticeVisible,
  remainingSeconds,
  toControllerSnapshot,
} from "./presentation";
import type { Question } from "../domain/types";

const question = {
  ...bank.questions[0]!,
  review_status: bank.questions[0]!.review_status as Question["review_status"],
  display: bank.questions[0]!.question,
  display_latex: bank.questions[0]!.question_latex,
  difficulty_label: String(bank.questions[0]!.difficulty),
} as Question;

function writingSnapshot(): Snapshot {
  const session = new Session([question], "test");
  session.start();
  return session.snapshot;
}

describe("controller presentation", () => {
  it("removes problem and solution content from Controller snapshots", () => {
    const source = writingSnapshot();
    const projected = toControllerSnapshot({
      ...source,
      judgement: {
        question_id: question.id,
        correct: true,
        recognized_latex: "3",
        recognized_normalized: "3",
        expected_latex: "3",
        explanation: "1+2=3",
        judge_method: "normalized_alias",
        message: "correct",
      },
    });

    expect(projected.question).toMatchObject({ instruction: "", display: "", display_latex: "", prompt: null });
    expect(projected.judgement).toMatchObject({ expected_latex: "", explanation: "" });
    expect(source.question?.display).not.toBe("");
  });

  it("explains that memo ink is isolated from judging and sync", () => {
    expect(playNotice(writingSnapshot(), "controller", true, "memo"))
      .toBe("このメモは採点・保存・モニター同期の対象外です。回答は回答用紙に書いてください。");
  });

  it("keeps connection recovery and server notices higher priority than paper help", () => {
    const snapshot = writingSnapshot();
    expect(playNotice(snapshot, "controller", false, "memo")).toContain("接続が切れました");
    expect(playNotice({ ...snapshot, notice: "判定中です。" }, "controller", true, "memo"))
      .toBe("判定中です。");
  });
});

describe("time and result presentation", () => {
  it("shows whole remaining seconds without exposing timer fractions", () => {
    expect(remainingSeconds(7_500)).toBe(8);
    expect(remainingSeconds(7_001)).toBe(8);
    expect(remainingSeconds(7_000)).toBe(7);
    expect(remainingSeconds(-1)).toBe(0);
  });

  it("keeps the live answer replica only in active answering phases", () => {
    expect(answerReplicaVisible("display", "writing")).toBe(true);
    expect(answerReplicaVisible("display", "preview")).toBe(true);
    expect(answerReplicaVisible("display", "result")).toBe(false);
    expect(answerReplicaVisible("controller", "writing")).toBe(false);
  });

  it("lets the consolidated result card own result messaging", () => {
    expect(playNoticeVisible("display", "result")).toBe(false);
    expect(playNoticeVisible("single", "result")).toBe(false);
    expect(playNoticeVisible("display", "writing")).toBe(true);
    expect(playNoticeVisible("controller", "result")).toBe(true);
  });
});
