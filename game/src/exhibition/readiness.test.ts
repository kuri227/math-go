import { describe, expect, it } from "vitest";
import { requiresRecognitionModel, resourceStatusCopy, setupAvailability } from "./readiness";

it("loads TexTeller only where handwriting recognition runs", () => {
  expect(requiresRecognitionModel("display")).toBe(false);
  expect(requiresRecognitionModel("controller")).toBe(true);
  expect(requiresRecognitionModel("single")).toBe(true);
});

describe("setupAvailability", () => {
  const ready = { questions: "ready", recognition: "ready", connected: true, mode: "exhibition", selectedCount: 0, eligibleCount: 10, requiredQuestions: 10 } as const;

  it("does not confuse a disconnected monitor with model loading", () => {
    expect(setupAvailability({ ...ready, connected: false }).message).toBe("モニター画面との接続を待っています。");
  });

  it("reports question and recognition failures separately", () => {
    expect(setupAvailability({ ...ready, questions: "error" }).message).toContain("問題を取得");
    expect(setupAvailability({ ...ready, recognition: "error" }).message).toContain("認識モデル");
  });

  it("allows a fully prepared exhibition", () => {
    expect(setupAvailability(ready)).toEqual({ ready: true, message: "準備OK！" });
  });
});

describe("resourceStatusCopy", () => {
  it("never claims that the monitor is loading the recognition model", () => {
    expect(resourceStatusCopy({ role: "display", questions: "ready", recognition: "skipped", connected: true, remoteRecognitionReady: false })).toBe("液タブで認識準備中");
    expect(resourceStatusCopy({ role: "display", questions: "ready", recognition: "skipped", connected: true, remoteRecognitionReady: true })).toBe("準備OK");
  });
});
