import { expect, it } from "vitest";
import { mathFontSize } from "./mathFit";

it("keeps single digits and short formulas at the same preferred size", () => {
  expect(mathFontSize(25, 48, 400, 150)).toBe(48);
  expect(mathFontSize(250, 65, 400, 150)).toBe(48);
});
it("fits both width and height for fractions and matrices", () => {
  expect(mathFontSize(600, 80, 400, 150)).toBe(32);
  expect(mathFontSize(200, 240, 400, 150)).toBe(30);
});
it("never shrinks long formulas below the readable scrollable minimum", () => {
  expect(mathFontSize(3000, 500, 240, 130)).toBe(24);
});
it("restores the full size after widening and tolerates hidden frames", () => {
  expect(mathFontSize(600, 80, 900, 160)).toBe(48);
  expect(mathFontSize(0, 0, 0, 0)).toBe(48);
  expect(mathFontSize(NaN, 40, 300, 160)).toBe(48);
});
