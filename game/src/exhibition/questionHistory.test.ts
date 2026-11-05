import { describe, expect, it } from "vitest";
import { recentQuestionIds, rememberQuestions } from "./questionHistory";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("question history", () => {
  it("keeps each difficulty independent and puts the newest questions first", () => {
    const storage = new MemoryStorage();
    rememberQuestions(1, ["a", "b"], storage);
    rememberQuestions(1, ["c", "a"], storage);
    rememberQuestions(2, ["other"], storage);

    expect(recentQuestionIds(1, storage)).toEqual(["c", "a", "b"]);
    expect(recentQuestionIds(2, storage)).toEqual(["other"]);
  });

  it("limits history and safely ignores malformed storage", () => {
    const storage = new MemoryStorage();
    rememberQuestions(3, Array.from({ length: 40 }, (_, index) => `q-${index}`), storage);
    expect(recentQuestionIds(3, storage)).toHaveLength(30);

    storage.setItem("math-go-recent-questions-v1:4", "not-json");
    expect(recentQuestionIds(4, storage)).toEqual([]);
  });
});
