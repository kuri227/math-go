import { CircleCheckBig, CircleX, Clock3, SkipForward, createElement } from "lucide";
import type { JudgementFeedback } from "./feedback";

const iconByTone = {
  correct: CircleCheckBig,
  wrong: CircleX,
  timeout: Clock3,
  skip: SkipForward,
} satisfies Record<JudgementFeedback["tone"], typeof CircleCheckBig>;

/** Replaces the decorative verdict mark with a real, library-sourced SVG. */
export function renderJudgementIcon(target: HTMLElement, tone: JudgementFeedback["tone"]): void {
  const icon = createElement(iconByTone[tone], {
    "aria-hidden": "true",
    class: "lucide-verdict-icon",
    focusable: "false",
    "stroke-width": 2.25,
  });
  target.replaceChildren(icon);
}
