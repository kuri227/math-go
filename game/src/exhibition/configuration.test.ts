import { describe, expect, it } from "vitest";
import type { Question } from "../domain/types";
import { configuredQuestions } from "./configuration";

const question = (id: string): Question => ({ id, difficulty: 1, exhibition_enabled: true, review_status: "approved" } as Question);

describe("configuredQuestions", () => {
  const bank = Array.from({ length: 10 }, (_, index) => question(`q-${index}`));

  it("resolves a complete exhibition without depending on model state", () => {
    expect(configuredQuestions(bank, { mode: "exhibition", difficulty: 1, questionCount: 10, questionIds: [] }, () => 0)).toHaveLength(10);
  });

  it("rejects missing test questions", () => {
    expect(() => configuredQuestions(bank, { mode: "test", difficulty: 1, questionCount: 1, questionIds: ["missing"] })).toThrow("確認できません");
  });

  it("rejects duplicate test question ids", () => {
    expect(() => configuredQuestions(bank, { mode: "test", difficulty: 1, questionCount: 2, questionIds: ["q-1", "q-1"] })).toThrow("正しくありません");
  });
});
