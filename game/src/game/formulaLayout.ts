import { QUESTION_MAX_SCALE, questionScaleForRatio } from "../domain/timing";

/** Fit the untransformed formula, then grow only within the available space. */
export function formulaScale(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
  remainingRatio: number,
): number {
  const fit = Math.min(Math.max(1, availableWidth) / Math.max(1, width), Math.max(1, availableHeight) / Math.max(1, height));
  const base = Math.min(1, fit);
  const maximum = Math.min(QUESTION_MAX_SCALE, fit);
  return base * questionScaleForRatio(remainingRatio, maximum / base);
}
