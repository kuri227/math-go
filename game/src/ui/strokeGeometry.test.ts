import { describe, expect, it } from "vitest";
import { isPointStroke } from "./strokeGeometry";

describe("point stroke", () => {
  it("handles taps and repeated identical pointer events", () => {
    expect(isPointStroke([{ x: 3, y: 4 }])).toBe(true);
    expect(isPointStroke([{ x: 3, y: 4 }, { x: 3, y: 4 }])).toBe(true);
  });
  it("does not classify a short line or empty stroke as a tap", () => {
    expect(isPointStroke([])).toBe(false);
    expect(isPointStroke([{ x: 3, y: 4 }, { x: 3.01, y: 4 }])).toBe(false);
  });
});
