import { describe, expect, it } from "vitest";
import { appMarkup } from "./view";

describe("solo game layout contract", () => {
  it.each(["single", "display", "controller"] as const)("keeps optional tools collapsed for %s", role => {
    const markup = appMarkup(role);
    expect(markup).toContain("ソロプレイ");
    expect(markup).toContain('<details id="collectionDetails">');
    expect(markup).toContain('<details id="reviewDetails">');
    expect(markup).toContain('id="recognitionProgress"');
    expect(markup).toContain('id="activityTitle"');
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
