import { afterEach, expect, it, vi } from "vitest";
import { byId, text } from "./dom";

afterEach(() => vi.unstubAllGlobals());
it("queries a static HUD element once and never rewrites an equal live status", () => {
  let value = "残機 3 / 3", writes = 0;
  const element = { get textContent() { return value; }, set textContent(next: string) { writes++; value = next; } };
  const lookup = vi.fn(() => element);
  vi.stubGlobal("document", { getElementById: lookup });
  for (let i = 0; i < 100; i++) text("test-live-status", "残機 3 / 3");
  expect(lookup).toHaveBeenCalledTimes(1); expect(writes).toBe(0);
  text("test-live-status", "残機 2 / 3"); expect(writes).toBe(1);
});
it("reports missing structural elements clearly", () => {
  vi.stubGlobal("document", { getElementById: () => null });
  expect(() => byId("missing-test-element")).toThrow("Missing missing-test-element");
});
