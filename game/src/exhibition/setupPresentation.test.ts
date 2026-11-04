import { describe, expect, it } from "vitest";
import { displaySetupPresentation } from "./setupPresentation";

describe("displaySetupPresentation", () => {
  it("shows pairing guidance until the controller connects", () => {
    const view = displaySetupPresentation(false, { view: "difficulty", difficulty: 7 });
    expect(view.title).toBe("モニター画面の準備完了");
    expect(view.showActions).toBe(true);
    expect(view.showDifficulty).toBe(false);
  });

  it("mirrors the rules step on the monitor", () => {
    const view = displaySetupPresentation(true, { view: "rules", difficulty: 1 });
    expect(view.title).toBe("あそびかた");
    expect(view.showRules).toBe(true);
  });

  it("describes the selected difficulty and its real time limit", () => {
    const view = displaySetupPresentation(true, { view: "difficulty", difficulty: 5 });
    expect(view.title).toBe("難易度を選択中");
    expect(view.lead).toContain("1問75秒");
    expect(view.difficulty).toBe(5);
    expect(view.showDifficulty).toBe(true);
  });

  it("uses staff-facing copy during problem selection", () => {
    expect(displaySetupPresentation(true, { view: "staff", difficulty: 3 }).title).toBe("問題を選択中");
  });
});
