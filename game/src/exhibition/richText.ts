import katex from "katex";

export function splitMath(text: string): { math: boolean; text: string }[] {
  return text.split(/(\$[^$]+\$)/g).filter(Boolean).map(part => ({ math: part.startsWith("$") && part.endsWith("$"), text: part.startsWith("$") && part.endsWith("$") ? part.slice(1, -1) : part }));
}

/** Only text nodes and trusted=false KaTeX; source text is never HTML. */
export function richText(text: string, target: HTMLElement): void {
  target.replaceChildren();
  for (const part of splitMath(text)) {
    if (!part.math) { target.append(document.createTextNode(part.text)); continue; }
    const span = document.createElement("span");
    try { katex.render(part.text, span, { throwOnError: true, trust: false, strict: "ignore" }); }
    catch { span.textContent = part.text; span.dataset.renderStatus = "fallback"; }
    target.append(span);
  }
}
