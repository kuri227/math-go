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
  it("only advances while writing and stops while disconnected", () => {
    expect(clockRunning({ ...base, phase: "writing" })).toBe(true);
    expect(clockRunning({ ...base, phase: "writing", paused: true })).toBe(false);
    expect(clockRunning({ ...base, phase: "writing", mode: "test" })).toBe(true);
    expect(activity({ ...base, phase: "preview", mode: "test" })?.description).toContain("再開");
    expect(activity({ ...base, paused: true })?.title).toContain("接続待ち");
  });
});
