import katex from "katex";

export function mathExpression(latex: string): string {
  // Recognition models may include an outer math environment. KaTeX's render
  // API already enters math mode, so passing these delimiters causes a fallback.
  let expression = latex.trim();
  for (const [start, end] of [["\\[", "\\]"], ["\\(", "\\)"], ["$$", "$$"], ["$", "$"]]) {
    if (expression.startsWith(start!) && expression.endsWith(end!)) {
      expression = expression.slice(start!.length, -end!.length).trim(); break;
    }
  }
  return expression;
}

export function renderMath(latex: string, target: HTMLElement): void {
  const expression = mathExpression(latex);
  delete target.dataset.renderStatus;
  target.removeAttribute("title");
  try {
    katex.render(expression, target, {
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
