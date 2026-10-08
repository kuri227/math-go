import { describe, expect, it } from "vitest";
import type { Question } from "./types";
import { selectQuestions } from "./questionSelection";

function question(id: string, difficulty: number): Question {
  return {
    id,
    difficulty,
    difficulty_label: `level-${difficulty}`,
    instruction: "solve",
    display: id,
    display_latex: id,
    category: "test",
  };
}

describe("selectQuestions", () => {
  const bank = [question("easy", 1), question("hard", 4), question("middle", 3)];

  it("prioritizes the selected range from hardest to easiest", () => {
    expect(selectQuestions(bank, 3, 2).map(({ id }) => id)).toEqual(["middle", "easy"]);
  });

  it("cycles eligible questions without leaking a higher difficulty", () => {
    expect(selectQuestions(bank, 1, 3).map(({ id }) => id)).toEqual(["easy", "easy", "easy"]);
  });

  it("does not mutate the source bank", () => {
    selectQuestions(bank, 4, 3);
    expect(bank.map(({ id }) => id)).toEqual(["easy", "hard", "middle"]);
  });
});
