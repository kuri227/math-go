import { describe, expect, it } from "vitest";
import { connectionCopy } from "./connectionCopy";

describe("connection guidance", () => {
  it("explains duplicate input and automatic recovery", () => {
    const copy = connectionCopy({ connected: false, incompatible: false, rejectionReason: "role-already-connected" });
    expect(copy).toContain("別の入力画面が接続済み");
    expect(copy).toContain("自動で再接続");
  });
  it("distinguishes waiting, ready and protocol mismatch", () => {
    expect(connectionCopy({ connected: false, incompatible: false })).toContain("待っています");
    expect(connectionCopy({ connected: true, incompatible: false })).toBe("2画面接続済み");
    expect(connectionCopy({ connected: false, incompatible: true })).toContain("更新");
  });
});
