const STORAGE_PREFIX = "math-go-recent-questions-v1";
const HISTORY_LIMIT = 30;

const storageKey = (difficulty: number): string => `${STORAGE_PREFIX}:${difficulty}`;

export function recentQuestionIds(difficulty: number, storage: Storage = window.localStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey(difficulty)) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberQuestions(difficulty: number, questionIds: readonly string[], storage: Storage = window.localStorage): void {
  const merged = [...new Set([...questionIds, ...recentQuestionIds(difficulty, storage)])].slice(0, HISTORY_LIMIT);
  try { storage.setItem(storageKey(difficulty), JSON.stringify(merged)); } catch { /* A private browser may deny storage; random selection still works. */ }
}
