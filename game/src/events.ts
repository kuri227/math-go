import type { Question } from "./domain/types";

export const gameEvents = new EventTarget();

export function showQuestion(question: Question, current: number, total: number): void {
  gameEvents.dispatchEvent(
    new CustomEvent("question", { detail: { question, current, total } }),
  );
}

export function pulseSubmission(): void {
  gameEvents.dispatchEvent(new Event("submitted"));
}

export function updateUrgency(ratio: number, urgent: boolean): void {
  gameEvents.dispatchEvent(new CustomEvent("urgency", { detail: { ratio, urgent } }));
}

