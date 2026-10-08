import katex from "katex";

export function renderMath(latex: string, target: HTMLElement): void {
  delete target.dataset.renderStatus;
  target.removeAttribute("title");
  try {
    katex.render(latex, target, {
      throwOnError: true,
      displayMode: true,
      trust: false,
      strict: "ignore",
    });
  } catch {
    target.textContent = latex;
    target.dataset.renderStatus = "fallback";
    target.title = "数式として表示できないため、文字列をそのまま表示しています";
  }
}
