import type { Question, RecognitionResponse, JudgementResponse } from "../domain/types";

export type Mode = "exhibition" | "test";
export type Phase = "setup" | "guide" | "countdown" | "writing" | "recognizing" | "preview" | "judging" | "result" | "finished";
export const EXHIBITION = { questions: 7, seconds: 20, lives: 3 } as const;
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
  lives: number | null;
  timedOut: boolean;
  remainingMs: number;
  countdownRemainingMs: number;
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
      lives: mode === "exhibition" ? EXHIBITION.lives : null, timedOut: false,
      remainingMs: EXHIBITION.seconds * 1000, paused: false, endReason: null,
      countdownRemainingMs: 0,
      recognition: null, judgement: null, notice: "",
    };
  }
  start(): void { if (this.snapshot.phase === "guide") { this.snapshot.phase = "writing"; this.lastTick = this.now(); } }
  beginCountdown(durationMs = 3_000): boolean {
    if (this.snapshot.phase !== "guide") return false;
    this.snapshot.phase = "countdown";
    this.snapshot.countdownRemainingMs = Math.max(0, durationMs);
    this.snapshot.paused = true;
    this.snapshot.notice = "入力画面の準備を待っています。問題と時計はまだ開始しません。";
    return true;
  }
  readyForCountdown(): boolean {
    if (this.snapshot.phase !== "countdown" || !this.snapshot.paused) return false;
    this.snapshot.paused = false;
    this.lastTick = this.now();
    this.snapshot.notice = this.snapshot.countdownRemainingMs > 0 ? "まもなく問題を表示します。" : "問題を開始します。";
    if (this.snapshot.countdownRemainingMs === 0) this.startPreparedQuestion();
    return true;
  }
  cancelCountdown(): boolean {
    if (this.snapshot.phase !== "countdown") return false;
    this.snapshot.phase = "guide";
    this.snapshot.countdownRemainingMs = 0;
    this.snapshot.paused = false;
    this.snapshot.notice = "接続が切れたため開始を取り消しました。再接続後にもう一度始めてください。";
    return true;
  }
  tick(): boolean {
    const s = this.snapshot, now = this.now();
    if (s.phase === "countdown" && !s.paused) {
      s.countdownRemainingMs = Math.max(0, s.countdownRemainingMs - Math.max(0, now - this.lastTick));
      if (s.countdownRemainingMs === 0) this.startPreparedQuestion();
      this.lastTick = now;
      return false;
    }
    if (s.mode === "exhibition" && !s.paused && s.phase === "writing") {
      s.remainingMs = Math.max(0, s.remainingMs - Math.max(0, now - this.lastTick));
      if (s.remainingMs === 0) {
        s.lives = Math.max(0, (s.lives ?? EXHIBITION.lives) - 1); s.timedOut = true; s.streak = 0;
        this.requestId = null; s.recognition = null; s.judgement = null;
        if (s.lives === 0) this.finish("timeout");
        else { s.phase = "result"; s.notice = `時間切れで残機が1減りました。残り${s.lives}。正答を確認して次へ進んでください。`; }
        this.lastTick = now; return true;
      }
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
  next(prepare = false): boolean {
    const s = this.snapshot;
    if (s.phase !== "result") return false;
    if (this.index + 1 === this.questions.length) { this.finish("completed"); return true; }
    s.question = this.questions[++this.index]!; s.round = this.index + 1;
    s.phase = prepare ? "countdown" : "writing"; s.recognition = null; s.judgement = null; s.notice = prepare ? "次の問題を準備しています。" : ""; s.timedOut = false;
    s.countdownRemainingMs = 0; s.paused = prepare;
    s.remainingMs = EXHIBITION.seconds * 1000; this.lastTick = this.now(); return true;
  }
  retryTest(prepare = false): boolean {
    if (this.snapshot.mode !== "test" || this.snapshot.phase !== "result") return false;
    this.snapshot.phase = prepare ? "countdown" : "writing"; this.snapshot.judgement = null; this.snapshot.recognition = null;
    this.snapshot.countdownRemainingMs = 0; this.snapshot.paused = prepare; this.snapshot.notice = prepare ? "用紙を準備しています。" : ""; return true;
  }
  finish(reason: Snapshot["endReason"]): void {
    if (this.snapshot.phase === "finished") return;
    this.requestId = null; this.snapshot.phase = "finished"; this.snapshot.endReason = reason;
    this.snapshot.recognition = null; this.snapshot.notice = reason === "timeout" ? "時間切れが3回となり、残機が0になったため終了しました。" : reason === "completed" ? "選んだ問題をすべて終えました。" : "プレイを終了しました。";
  }

  private startPreparedQuestion(): void {
    const s = this.snapshot;
    s.phase = "writing";
    s.paused = false;
    s.countdownRemainingMs = 0;
    s.notice = "";
    this.lastTick = this.now();
  }
}

export function chooseExhibition(bank: readonly Question[], difficulty: number, random = Math.random, questionCount: number = EXHIBITION.questions): Question[] {
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > EXHIBITION.questions) {
    throw new RangeError(`問題数は1〜${EXHIBITION.questions}問で指定してください。`);
  }
  const pool = bank.filter(q => q.difficulty === difficulty && q.exhibition_enabled && q.review_status === "approved");
  // Randomize within groups, then round-robin categories to avoid runs of variants.
  const shuffle = <T>(items: T[]): T[] => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j]!, items[i]!]; } return items; };
  const groups = new Map<string, Question[]>();
  for (const q of shuffle([...pool])) { const key = `${q.sublevel ?? 1}:${q.category}`; groups.set(key, [...(groups.get(key) ?? []), q]); }
  const buckets = shuffle([...groups.values()]), selected: Question[] = [];
  while (selected.length < questionCount && buckets.some(b => b.length)) {
    for (const b of buckets) { const q = b.pop(); if (q) selected.push(q); if (selected.length === questionCount) break; }
  }
  return selected.sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1));
}
