import { describe, expect, it } from "vitest";
import { gameEndMessage } from "./gameEndMessage";

describe("gameEndMessage", () => {
  it("explains completion of the course", () => {
    expect(gameEndMessage("all-questions-completed", 5, 5)).toBe("全5問を終えたため終了しました。");
  });
  it("explains an early finish and the configured question total", () => {
    expect(gameEndMessage("lives-exhausted", 4, 5)).toBe("残機が0になったため、4問目で終了しました（全5問）。");
  });
});
