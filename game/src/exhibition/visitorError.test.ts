import { describe, expect, it } from "vitest";
import { visitorErrorMessage } from "./visitorError";

describe("visitorErrorMessage", () => {
  it("replaces model implementation terms", () => {
    expect(visitorErrorMessage(new Error("TexTeller model failed"))).toContain("手書きの読み取り");
    expect(visitorErrorMessage(new Error("TexTeller model failed"))).not.toContain("TexTeller");
  });

  it("replaces transport details", () => {
    expect(visitorErrorMessage(new Error("HTTP 500 fetch failed"))).toContain("通信に失敗");
  });

  it("keeps actionable Japanese messages", () => {
    expect(visitorErrorMessage(new Error("問題を選択してください。"))).toBe("問題を選択してください。");
  });
});
