import { describe, expect, it } from "vitest";
import { activity, clockRunning } from "./activity";
import { Session, type Phase } from "./Session";

const base = new Session([{ id: "q" } as never], "exhibition").snapshot;
describe("visible processing and clock contract", () => {
  it.each(["recognizing", "preview", "judging"] as Phase[])("marks %s as stopped and describes next action", phase => {
    const s = { ...base, phase };
    expect(clockRunning(s)).toBe(false);
    expect(activity(s)?.title).toContain("時計停止中");
    expect(activity(s)?.busy).toBe(phase !== "preview");
  });
  it("only advances while writing, not disconnected or untimed", () => {
    expect(clockRunning({ ...base, phase: "writing" })).toBe(true);
    expect(clockRunning({ ...base, phase: "writing", paused: true })).toBe(false);
    expect(clockRunning({ ...base, phase: "writing", mode: "test" })).toBe(false);
    expect(activity({ ...base, phase: "preview", mode: "test" })?.description).not.toContain("再開");
    expect(activity({ ...base, paused: true })?.title).toContain("接続待ち");
  });
});
