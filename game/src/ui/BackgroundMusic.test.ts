import { describe, expect, it } from "vitest";
import { musicFadeProgress } from "./BackgroundMusic";

describe("music crossfade", () => {
  it("clamps timestamps from either side of the fade window", () => {
    expect(musicFadeProgress(90, 100, 20)).toBe(0);
    expect(musicFadeProgress(110, 100, 20)).toBe(0.5);
    expect(musicFadeProgress(130, 100, 20)).toBe(1);
  });
});
