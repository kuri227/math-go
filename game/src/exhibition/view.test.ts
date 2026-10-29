import { describe, expect, it } from "vitest";
import { appMarkup } from "./view";

describe("solo game layout contract", () => {
  it.each(["single", "display", "controller"] as const)("keeps optional tools collapsed for %s", role => {
    const markup = appMarkup(role);
    expect(markup).toContain('id="homeTitle"');
    expect(markup).toContain('id="startGame"');
    expect(markup).toContain('id="showRules"');
    expect(markup).toContain('id="volume"');
    expect(markup).toContain('aria-label="効果音の音量"');
    expect(markup).toContain("白い用紙に答えを書く");
    expect(markup).toContain(role === "controller" ? "回答とメモはこの液タブ" : "問題はモニター、回答用紙とメモ用紙は液タブ");
    expect(markup).toContain('id="openStaffTools"');
    expect(markup).toContain('id="staffTools"');
    expect(markup).toContain('id="selectAllQuestions"');
    expect(markup).toContain('id="restart"');
    expect(markup).toContain('id="backHome"');
    expect(markup).toContain('<details id="collectionDetails">');
    expect(markup).toContain('<details id="reviewDetails">');
    expect(markup).toContain('id="recognitionProgress"');
    expect(markup).toContain('id="activityTitle"');
    expect(markup).toContain('id="countdownTitle"');
    expect(markup).toContain('id="replicaPad"');
    expect(markup).toContain('id="resultPrompt"');
    expect(markup).toContain('id="resultRecognized"');
    expect(markup).toContain('class="result-body"');
    expect(markup).toContain('id="memoPad"');
    expect(markup).toContain("このメモはモニターへ送られず、採点・保存にも使いません");
    expect(markup).toContain("スタッフ用：認識の詳細");
    expect(markup.match(/class="drawing-pad"/g)).toHaveLength(2);
    expect(markup.match(/class="pad-hint(?: [^"]+)?"/g)).toHaveLength(2);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers screen creation only on the single-screen title", () => {
    const single = appMarkup("single");
    expect(single).toContain('id="startDualScreen"');
    expect(single).toContain('id="staffDualScreen"');

    for (const role of ["display", "controller"] as const) {
      const markup = appMarkup(role);
      expect(markup).not.toContain('id="startDualScreen"');
      expect(markup).not.toContain('id="staffDualScreen"');
      expect(markup).not.toContain("2画面でスタート");
      expect(markup).not.toContain("2画面テストを開く");
    }
    expect(appMarkup("controller")).toContain(">難易度をえらぶ</button>");
    expect(appMarkup("controller")).toContain("回答とメモはこの液タブ");
  });
});
