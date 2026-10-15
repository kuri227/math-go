import katex from "katex";
import { mathFontSize } from "./mathFit";

const pending = new WeakSet<HTMLElement>();
const observed = new WeakSet<HTMLElement>();
function scheduleFit(target: HTMLElement): void {
  if (pending.has(target)) return;
  pending.add(target);
  requestAnimationFrame(() => {
    pending.delete(target);
    const content = target.firstElementChild as HTMLElement | null;
    if (!content || !target.clientWidth || !target.clientHeight) return;
    // Measure at a canonical size, never the previous (possibly reduced) size.
    content.style.fontSize = "48px";
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(target);
    const width = target.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = target.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    content.style.fontSize = `${mathFontSize(box.width, box.height, width - 2, height - 2)}px`;
    const overflow = content.offsetWidth > width + 1 || content.offsetHeight > height + 1;
    target.dataset.overflow = String(overflow);
    const note = target.nextElementSibling as HTMLElement | null;
    if (note?.classList.contains("math-overflow-note")) note.hidden = !overflow;
    if (overflow) { target.tabIndex = 0; target.title = `${target.dataset.renderStatus ? "数式として表示できないため原文を表示しています。" : ""}枠内をスクロールして全体を確認できます。`; }
    else { target.removeAttribute("tabindex"); if (!target.dataset.renderStatus) target.removeAttribute("title"); }
  });
}
const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(entries => {
  for (const entry of entries) scheduleFit(entry.target as HTMLElement);
});

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
  target.classList.add("math-output");
  const content = document.createElement("div");
  content.className = "math-content";
  target.replaceChildren(content);
  target.scrollLeft = 0; target.scrollTop = 0;
  if (!target.nextElementSibling?.classList.contains("math-overflow-note")) {
    const note = document.createElement("p");
    note.className = "math-overflow-note"; note.hidden = true;
    note.textContent = "長い数式は枠内をスクロールして確認できます。";
    target.after(note);
  }
  const expression = mathExpression(latex);
  delete target.dataset.renderStatus;
  target.removeAttribute("title");
  try {
    katex.render(expression, content, {
      throwOnError: true,
      displayMode: true,
      trust: false,
      strict: "ignore",
    });
  } catch {
    content.textContent = latex;
    target.dataset.renderStatus = "fallback";
    target.title = "数式として表示できないため、文字列をそのまま表示しています";
  }
  if (!observed.has(target)) {
    observed.add(target); observer?.observe(target);
    void document.fonts?.ready.then(() => scheduleFit(target));
  }
  scheduleFit(target);
}
