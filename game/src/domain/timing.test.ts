import { describe, expect, it } from "vitest";
import { QUESTION_MAX_SCALE, questionScaleForRatio } from "./timing";

describe("questionScaleForRatio", () => {
  it("starts at the normal size and reaches the configured maximum", () => {
    expect(questionScaleForRatio(1)).toBe(1);
    expect(questionScaleForRatio(0)).toBe(QUESTION_MAX_SCALE);
  });

  it("creates visible growth by the halfway point", () => {
    expect(questionScaleForRatio(0.5)).toBeGreaterThan(1.2);
  });

  it("clamps unexpected timer ratios", () => {
    expect(questionScaleForRatio(2)).toBe(1);
    expect(questionScaleForRatio(-1)).toBe(QUESTION_MAX_SCALE);
  });

  it("supports a lower visual ceiling for tall structured formulas", () => {
    expect(questionScaleForRatio(0, 1.4)).toBe(1.4);
    expect(questionScaleForRatio(0.5, 1.4)).toBeGreaterThan(1.1);
    expect(questionScaleForRatio(0.5, 1.4)).toBeLessThan(1.4);
  });
});
