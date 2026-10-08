import { describe, expect, it } from "vitest";
import { formulaScale } from "./formulaLayout";

describe("formulaScale", () => {
  it("keeps untimed questions at normal size when they fit", () => {
    expect(formulaScale(200, 60, 800, 170, 1)).toBe(1);
  });
  it("shrinks long questions even in untimed mode", () => {
    expect(formulaScale(900, 60, 300, 145, 1)).toBeCloseTo(1 / 3);
  });
  it("caps timed enlargement by available width and height", () => {
    expect(formulaScale(200, 60, 800, 170, 0)).toBe(1.6);
    expect(formulaScale(200, 60, 250, 170, 0)).toBe(1.25);
    expect(formulaScale(200, 100, 800, 120, 0)).toBe(1.2);
  });
  it("recomputes scale after resizing without retaining an oversized scale", () => {
    const wide = formulaScale(400, 80, 1000, 170, 0.1);
    const narrow = formulaScale(250, 50, 220, 100, 0.1);
    expect(wide).toBeGreaterThan(1);
    expect(narrow * 250).toBeCloseTo(220);
  });
});
