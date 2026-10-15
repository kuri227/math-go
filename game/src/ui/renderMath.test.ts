import { it, expect } from "vitest";
import katex from "katex";
import { mathExpression } from "./renderMath";

it.each(["1", "$1$", "$$1$$", "\\[1\\]", "\\(1\\)", "  \\[1\\]  "])("renders model output with delimiters: %s", value => {
  expect(mathExpression(value)).toBe("1");
  expect(() => katex.renderToString(mathExpression(value), { throwOnError: true })).not.toThrow();
});
it("preserves actual math while removing only outer delimiters", () => {
  expect(mathExpression("\\[\\exists\\]")).toBe("\\exists");
  expect(mathExpression("x+\\frac{1}{2}")).toBe("x+\\frac{1}{2}");
});
