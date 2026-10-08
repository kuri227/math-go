import type { CourseConfig } from "../domain/courses";
import { GameSession } from "../domain/GameSession";
import type {
  GameState,
  GameEndReason,
  GameStats,
  JudgementResponse,
  PerformanceSample,
  Question,
  SolutionResponse,
} from "../domain/types";

export type ForcedResultReason = "timeout" | "skip";

export interface CoordinatorSnapshot {
  state: GameState;
  endReason: GameEndReason | null;
  question: Question;
  progress: { current: number; total: number };
  stats: GameStats;
  timer: {
    remainingMs: number;
    ratio: number;
    running: boolean;
  };
  result: CoordinatorResult | null;
}

export type CoordinatorResult =
  | {
      kind: "recognized";
      sample: PerformanceSample;
    }
  | {
      kind: "forced";
      reason: ForcedResultReason;
      solution: SolutionResponse;
    };

export class GameCoordinator {
  private readonly session: GameSession;
  private readonly processedRequestIds = new Set<string>();
  private remainingMs: number;
  private timerEndsAt = 0;
  private timerRunning = false;
  private currentResult: CoordinatorResult | null = null;
  private activeRequestId: string | null = null;

  constructor(
    questions: readonly Question[],
    readonly course: CourseConfig,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.session = new GameSession(questions, course.initialLives);
    this.remainingMs = this.roundDurationMs;
  }

  get snapshot(): CoordinatorSnapshot {
    this.refreshTimer();
    const duration = this.roundDurationMs;
    return {
      state: this.session.state,
      endReason: this.session.endReason,
      question: this.session.question,
      progress: this.session.progress,
      stats: this.session.stats,
      timer: {
        remainingMs: this.remainingMs,
        ratio: duration === 0 ? 1 : Math.max(0, Math.min(1, this.remainingMs / duration)),
        running: this.timerRunning,
      },
      result: this.currentResult,
    };
  }

  beginIntro(): void {
    this.pauseTimer();
    this.session.setState("loading");
    this.currentResult = null;
    this.remainingMs = this.roundDurationMs;
  }

  beginWriting(): void {
    this.session.setState("writing");
    this.resumeTimer();
  }

  tick(): "timeout" | null {
    this.refreshTimer();
    if (this.timerRunning && this.remainingMs === 0 && this.session.state === "writing") {
      this.pauseTimer();
      this.session.setState("recognizing");
      return "timeout";
    }
    return null;
  }

  beginSubmission(requestId: string): boolean {
    if (this.session.state !== "writing" || this.processedRequestIds.has(requestId)) return false;
    this.processedRequestIds.add(requestId);
    this.activeRequestId = requestId;
    this.pauseTimer();
    this.session.setState("recognizing");
    return true;
  }

  completeRecognition(sample: PerformanceSample, requestId = sample.response.request_id): boolean {
    if (this.session.state !== "recognizing" || requestId !== this.activeRequestId) return false;
    this.currentResult = { kind: "recognized", sample };
    this.activeRequestId = null;
    this.session.setState("result");
    return true;
  }

  failRecognition(requestId?: string): boolean {
    if (this.session.state !== "recognizing") return false;
    if (requestId !== undefined && requestId !== this.activeRequestId) return false;
    this.activeRequestId = null;
    this.session.setState("writing");
    this.resumeTimer();
    return true;
  }

  beginForcedResult(): boolean {
    if (this.session.state !== "writing" && this.session.state !== "recognizing") return false;
    this.pauseTimer();
    this.activeRequestId = null;
    this.session.setState("recognizing");
    return true;
  }

  completeForcedResult(reason: ForcedResultReason, solution: SolutionResponse): void {
    if (this.session.state !== "recognizing") return;
    this.currentResult = { kind: "forced", reason, solution };
    this.session.setState("result");
  }

  retry(): boolean {
    if (this.session.state !== "result") return false;
    this.currentResult = null;
    this.activeRequestId = null;
    this.session.setState("writing");
    this.resumeTimer();
    return true;
  }

  advance(): "next" | "finished" | null {
    if (this.session.state !== "result" || !this.currentResult) return null;
    const finished = this.currentResult.kind === "recognized"
      ? this.commitRecognized(this.currentResult.sample.judgement, this.currentResult.sample.feedbackMs)
      : this.session.commit(false, 0);
    this.currentResult = null;
    if (finished) {
      this.pauseTimer();
      return "finished";
    }
    this.remainingMs = this.roundDurationMs;
    this.session.setState("writing");
    this.resumeTimer();
    return "next";
  }

  pauseForDisconnect(): boolean {
    this.pauseTimer();
    if (this.session.state === "recognizing" && this.activeRequestId !== null) {
      this.activeRequestId = null;
      this.session.setState("writing");
      return true;
    }
    return false;
  }

  resumeAfterReconnect(): void {
    if (this.session.state === "writing") this.resumeTimer();
  }

  private commitRecognized(judgement: JudgementResponse, feedbackMs: number): boolean {
    return this.session.commit(judgement.correct, feedbackMs);
  }

  private get roundDurationMs(): number {
    return (this.course.timeLimitSeconds ?? 0) * 1_000;
  }

  private resumeTimer(): void {
    if (this.course.timeLimitSeconds === null || this.remainingMs <= 0 || this.timerRunning) return;
    this.timerEndsAt = this.now() + this.remainingMs;
    this.timerRunning = true;
  }

  private pauseTimer(): void {
    this.refreshTimer();
    this.timerRunning = false;
  }

  private refreshTimer(): void {
    if (!this.timerRunning) return;
    this.remainingMs = Math.max(0, this.timerEndsAt - this.now());
  }
}
