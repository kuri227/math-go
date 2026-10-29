import { describe, expect, it } from "vitest";
import { isSafeInkSnapshot, MAX_INK_POINTS } from "./messages";

describe("ink relay validation", () => {
  const point = { x: 0.5, y: 0.25, pressure: 0.7 };
  it("accepts finite normalized points and a bounded aspect ratio", () => {
    expect(isSafeInkSnapshot({ version: 1, revision: 2, aspectRatio: 16 / 9, strokes: [[point]] })).toBe(true);
  });
  it.each([
    { x: -0.1, y: 0, pressure: 0.5 },
    { x: 0, y: 1.1, pressure: 0.5 },
    { x: 0, y: 0, pressure: Number.NaN },
  ])("rejects unsafe point $x/$y/$pressure", unsafe => {
    expect(isSafeInkSnapshot({ version: 1, revision: 1, aspectRatio: 2, strokes: [[unsafe]] })).toBe(false);
  });
  it("rejects snapshots over the point cap", () => {
    expect(isSafeInkSnapshot({ version: 1, revision: 1, aspectRatio: 2, strokes: [Array.from({ length: MAX_INK_POINTS + 1 }, () => point)] })).toBe(false);
  });
});
