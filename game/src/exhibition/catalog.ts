import type { Question } from "../domain/types";

export const DIFFICULTY_LABELS = ["小学校低学年", "小学校高学年", "中学校", "高校", "大学・理工系", "大学院", "超上級・専門数学"] as const;
export const REVIEW_LABELS = { pending: "未確認", approved: "確認済み", needs_revision: "要修正" } as const;
export type ReviewFilter = "all" | keyof typeof REVIEW_LABELS;
export type CandidateFilter = "all" | "enabled" | "disabled";

/** Build search strings and lookup indexes only when the bank changes. */
export class QuestionCatalog {
  private byId: Map<string, Question>;
  private entries: { question: Question; text: string }[];
  constructor(readonly questions: readonly Question[]) {
    this.byId = new Map(questions.map(question => [question.id, question]));
    this.entries = questions.map(question => ({ question, text: `${question.id} ${question.prompt ?? ""} ${question.display} ${question.category}`.toLocaleLowerCase() }));
  }
  search(query: string, difficulty: number, allLevels: boolean, pendingOnly: boolean): Question[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.entries.filter(({ question: q, text }) => (allLevels || q.difficulty === difficulty)
      && (!pendingOnly || q.review_status !== "approved") && text.includes(normalized)).map(entry => entry.question);
  }
  filter(query: string, difficulty: number, review: ReviewFilter, candidate: CandidateFilter): Question[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.entries.filter(({ question: q, text }) => (difficulty === 0 || q.difficulty === difficulty)
      && (review === "all" || (q.review_status ?? "pending") === review)
      && (candidate === "all" || (candidate === "enabled" ? q.exhibition_enabled === true : q.exhibition_enabled !== true))
      && text.includes(normalized)).map(entry => entry.question);
  }
  selected(ids: Iterable<string>): Question[] {
    return [...ids].map(id => this.byId.get(id)).filter((q): q is Question => q !== undefined);
  }
}

export function visibleSelectionState(visibleIds: readonly string[], selected: ReadonlySet<string>): { selectedVisible: number; allSelected: boolean } {
  const selectedVisible = visibleIds.filter(id => selected.has(id)).length;
  return { selectedVisible, allSelected: visibleIds.length > 0 && selectedVisible === visibleIds.length };
}
