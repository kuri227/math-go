import type { Question, RecognitionResponse, JudgementResponse } from "../domain/types";

export type Mode = "exhibition" | "test";
export type Phase = "setup" | "guide" | "writing" | "recognizing" | "preview" | "judging" | "result" | "finished";
export const EXHIBITION = { questions: 7, seconds: 20 } as const;
export interface Snapshot {
  runId: string;
  mode: Mode;
  phase: Phase;
  question: Question | null;
  round: number;
  total: number;
  correct: number;
  streak: number;
  attempts: number;
  wrongAttempts: number;
  remainingMs: number;
  paused: boolean;
  endReason: "completed" | "timeout" | "stopped" | null;
  recognition: RecognitionResponse | null;
  judgement: JudgementResponse | null;
  notice: string;
}

/** One authoritative state machine for single-screen and paired-screen play. */
export class Session {
  private index = 0;
  private lastTick = 0;
  private requestId: string | null = null;
  private outcomes = new Map<string, boolean>();
  readonly snapshot: Snapshot;
  constructor(private questions: Question[], mode: Mode, private now = () => performance.now()) {
    if (!questions.length) throw new Error("出題できる問題がありません。");
    this.snapshot = {
      runId: crypto.randomUUID(), mode, phase: "guide", question: questions[0]!,
      round: 1, total: questions.length, correct: 0, streak: 0, attempts: 0, wrongAttempts: 0,
      remainingMs: EXHIBITION.seconds * 1000, paused: false, endReason: null,
      recognition: null, judgement: null, notice: "",
    };
  }
  start(): void { if (this.snapshot.phase === "guide") { this.snapshot.phase = "writing"; this.lastTick = this.now(); } }
  tick(): boolean {
    const s = this.snapshot, now = this.now();
    if (s.mode === "exhibition" && !s.paused && ["writing", "preview"].includes(s.phase)) {
      s.remainingMs = Math.max(0, s.remainingMs - Math.max(0, now - this.lastTick));
      if (s.remainingMs === 0) { this.finish("timeout"); this.lastTick = now; return true; }
    }
    this.lastTick = now;
    return false;
  }
  pause(paused: boolean): void { this.tick(); this.snapshot.paused = paused; this.lastTick = this.now(); }
  beginRecognition(id: string): boolean {
    this.tick();
    if (this.snapshot.phase !== "writing" || this.snapshot.paused) return false;
    this.requestId = id; this.snapshot.recognition = null; this.snapshot.judgement = null;
    this.snapshot.phase = "recognizing"; this.snapshot.notice = "手書き画像を読み取っています。処理待ちの間は時計を止めています。";
    return true;
  }
  recognized(id: string, response: RecognitionResponse): boolean {
    if (this.snapshot.phase !== "recognizing" || id !== this.requestId || response.request_id !== id) return false;
    this.snapshot.recognition = response; this.snapshot.phase = "preview"; this.requestId = null;
    this.snapshot.notice = "書いた内容と合っていますか？ 合っていれば「この内容で回答」。違う場合は書き直してください。";
    this.lastTick = this.now(); return true;
  }
  fail(id: string, message: string): boolean {
    if (this.requestId !== id || !["recognizing", "judging"].includes(this.snapshot.phase)) return false;
    this.snapshot.phase = this.snapshot.recognition ? "preview" : "writing";
    this.snapshot.notice = message; this.requestId = null; this.lastTick = this.now(); return true;
  }
  cancelRecognition(): void {
    if (this.snapshot.phase !== "recognizing") return;
    this.requestId = null; this.snapshot.phase = "writing";
    this.snapshot.notice = "接続が切れたため読み取りを取り消しました。再接続後にもう一度読み取ってください。";
  }
  rewrite(): boolean {
    this.tick();
    if (this.snapshot.phase !== "preview") return false;
    this.snapshot.phase = "writing"; this.snapshot.recognition = null;
    this.snapshot.notice = "書き直してから、もう一度「読み取りを確認」を押してください。"; return true;
  }
  beginJudge(id: string): boolean {
    this.tick();
    if (this.snapshot.phase !== "preview" || !this.snapshot.recognition || this.snapshot.paused) return false;
    this.requestId = id; this.snapshot.phase = "judging"; return true;
  }
  judged(id: string, result: JudgementResponse): boolean {
    const s = this.snapshot;
    if (s.phase !== "judging" || id !== this.requestId || result.question_id !== s.question?.id) return false;
    this.requestId = null; s.attempts++; s.judgement = result;
    if (result.correct || s.mode === "test") {
      const alreadyAnswered = this.outcomes.has(s.question!.id);
      this.outcomes.set(s.question!.id, result.correct);
      s.correct = [...this.outcomes.values()].filter(Boolean).length;
      if (result.correct) { s.streak = alreadyAnswered ? Math.max(1, s.streak) : s.streak + 1; } else { s.streak = 0; s.wrongAttempts++; }
      s.phase = "result"; s.notice = result.correct ? "正解です。" : "登録された正答候補とは一致しませんでした。";
    } else {
      s.wrongAttempts++; s.streak = 0; s.phase = "writing"; s.recognition = null;
      // Do not expose the answer/explanation while the timed question is live.
      s.judgement = null; s.notice = "不正解です。時間内なら何度でも回答できます。書き直してもう一度！";
    }
    this.lastTick = this.now(); return true;
  }
  next(): boolean {
    const s = this.snapshot;
    if (s.phase !== "result") return false;
    if (this.index + 1 === this.questions.length) { this.finish("completed"); return true; }
    s.question = this.questions[++this.index]!; s.round = this.index + 1;
    s.phase = "writing"; s.recognition = null; s.judgement = null; s.notice = "";
    s.remainingMs = EXHIBITION.seconds * 1000; this.lastTick = this.now(); return true;
  }
  retryTest(): boolean {
    if (this.snapshot.mode !== "test" || this.snapshot.phase !== "result") return false;
    this.snapshot.phase = "writing"; this.snapshot.judgement = null; this.snapshot.recognition = null; return true;
  }
  finish(reason: Snapshot["endReason"]): void {
    this.requestId = null; this.snapshot.phase = "finished"; this.snapshot.endReason = reason;
    this.snapshot.recognition = null; this.snapshot.notice = reason === "timeout" ? "制限時間に達したため終了しました。" : reason === "completed" ? "選んだ問題をすべて回答しました。" : "プレイを終了しました。";
  }
}

export function chooseExhibition(bank: readonly Question[], difficulty: number, random = Math.random): Question[] {
  const pool = bank.filter(q => q.difficulty === difficulty && q.exhibition_enabled && q.review_status === "approved");
  // Randomize within groups, then round-robin categories to avoid runs of variants.
  const shuffle = <T>(items: T[]): T[] => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j]!, items[i]!]; } return items; };
  const groups = new Map<string, Question[]>();
  for (const q of shuffle([...pool])) { const key = `${q.sublevel ?? 1}:${q.category}`; groups.set(key, [...(groups.get(key) ?? []), q]); }
  const buckets = shuffle([...groups.values()]), selected: Question[] = [];
  while (selected.length < EXHIBITION.questions && buckets.some(b => b.length)) {
    for (const b of buckets) { const q = b.pop(); if (q) selected.push(q); if (selected.length === EXHIBITION.questions) break; }
  }
  return selected.sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1));
}
