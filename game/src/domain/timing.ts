export const CHALLENGE_SECONDS = 20;
export const URGENCY_SECONDS = 8;
export const QUESTION_MAX_SCALE = 1.6;

export function questionScaleForRatio(
  remainingRatio: number,
  maxScale = QUESTION_MAX_SCALE,
): number {
  const ratio = Math.max(0, Math.min(1, remainingRatio));
  const elapsedRatio = 1 - ratio;
  const safeMaxScale = Math.max(1, maxScale);
  return 1 + Math.pow(elapsedRatio, 1.35) * (safeMaxScale - 1);
}
