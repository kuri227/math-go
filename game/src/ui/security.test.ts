import { describe, expect, it } from "vitest";
import katex from "katex";

describe("untrusted LaTeX rendering", () => {
  it.each([
    String.raw`\href{javascript:alert(1)}{click}`,
    String.raw`\htmlClass{danger}{x}`,
    String.raw`\includegraphics{https://evil.example/x.png}`,
    String.raw`<img src=x onerror=alert(1)>`,
  ])("does not create trusted HTML for %s", source => {
    const html = katex.renderToString(source, {
      displayMode: true,
      throwOnError: false,
      trust: false,
      strict: "ignore",
    });
    expect(html).not.toMatch(/<(?:a|img)\b[^>]*(?:href|src)\s*=/i);
    expect(html).not.toMatch(/<[^>]+\sonerror\s*=/i);
  });
});
