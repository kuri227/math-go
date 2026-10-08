import type { Question } from "./types";

/**
 * Use only questions at or below the selected difficulty, hardest first.
 * Long courses cycle the eligible bank instead of leaking harder questions.
 */
export function selectQuestions(
  questions: readonly Question[],
  maximumDifficulty: number,
  questionCount: number,
): Question[] {
  const eligible = questions
    .filter((question) => question.difficulty <= maximumDifficulty)
    .sort((left, right) => right.difficulty - left.difficulty);
  if (eligible.length === 0 || questionCount <= 0) return [];
  return Array.from(
    { length: questionCount },
    (_, index) => eligible[index % eligible.length]!,
  );
}
