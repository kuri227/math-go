import type { Question } from "../domain/types";
import { chooseExhibition, EXHIBITION, type Mode } from "./Session";

export type ConfigurationRequest = {
  mode: Mode;
  difficulty: number;
  questionCount: number;
  questionIds: string[];
};

const isMode = (value: unknown): value is Mode => value === "exhibition" || value === "test";

/** Validates an untrusted controller request and resolves its question list. */
export function configuredQuestions(
  bank: Question[],
  request: ConfigurationRequest,
  random: () => number = Math.random,
): Question[] {
  if (!isMode(request.mode)
    || !Number.isInteger(request.difficulty) || request.difficulty < 1 || request.difficulty > 7
    || !Array.isArray(request.questionIds) || request.questionIds.length > bank.length
    || request.questionIds.some(id => typeof id !== "string")
    || new Set(request.questionIds).size !== request.questionIds.length) {
    throw new Error("設定内容が正しくありません。入力画面を再読み込みしてください。");
  }
  const maximumQuestions = request.mode === "test" ? bank.length : EXHIBITION.questions;
  if (!Number.isInteger(request.questionCount) || request.questionCount < 1 || request.questionCount > maximumQuestions
    || request.mode === "exhibition" && request.questionCount !== EXHIBITION.questions) {
    throw new Error(request.mode === "exhibition" ? `通常ゲームは${EXHIBITION.questions}問です。` : `問題数は1〜${maximumQuestions}問で選んでください。`);
  }
  const questionById = new Map(bank.map(question => [question.id, question]));
  const questions = request.mode === "test"
    ? request.questionIds.map(id => questionById.get(id)).filter((question): question is Question => Boolean(question))
    : chooseExhibition(bank, Math.trunc(request.difficulty), random, request.questionCount);
  if (request.mode === "test" && (questions.length !== request.questionIds.length || questions.length !== request.questionCount)) {
    throw new Error("選択した問題を確認できませんでした。問題データを再読み込みしてください。");
  }
  if (request.mode === "exhibition" && questions.length !== request.questionCount) {
    throw new Error(`レベル${Math.trunc(request.difficulty)}の通常ゲーム候補が${request.questionCount}問必要です。`);
  }
  if (!questions.length) throw new Error("出題する問題を選んでください。");
  return questions;
}
