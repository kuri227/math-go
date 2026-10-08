import type { GameEndReason, GameState, GameStats, Question } from "./types";

export class GameSession {
  private index = 0;
  private currentState: GameState = "loading";
  private answered = 0;
  private correct = 0;
  private feedbackTotal = 0;
  private feedbackCount = 0;
  private currentEndReason: GameEndReason | null = null;
  private lives: number;
  private streak = 0;

  constructor(
    private readonly questions: readonly Question[],
    private readonly initialLives = 3,
  ) {
    if (questions.length === 0) throw new Error("At least one question is required");
    if (initialLives < 1) throw new Error("At least one life is required");
    this.lives = initialLives;
  }

  get question(): Question {
    return this.questions[this.index]!;
  }

  get progress(): { current: number; total: number } {
    return { current: this.index + 1, total: this.questions.length };
  }

  get state(): GameState {
    return this.currentState;
  }

  get stats(): GameStats {
    return {
      lives: this.lives,
      streak: this.streak,
      correct: this.correct,
      answered: this.answered,
      averageFeedbackMs: this.feedbackCount === 0 ? 0 : this.feedbackTotal / this.feedbackCount,
    };
  }

  get endReason(): GameEndReason | null {
    return this.currentEndReason;
  }

  setState(state: GameState): void {
    this.currentState = state;
  }

  commit(correct: boolean, feedbackMs: number): boolean {
    if (this.currentEndReason !== null) return true;
    this.answered += 1;
    if (feedbackMs > 0) {
      this.feedbackTotal += feedbackMs;
      this.feedbackCount += 1;
    }
    if (correct) {
      this.correct += 1;
      this.streak += 1;
    } else {
      this.lives = Math.max(0, this.lives - 1);
      this.streak = 0;
    }

    // Completing the final question takes precedence if both conditions apply.
    this.currentEndReason = this.index >= this.questions.length - 1
      ? "all-questions-completed"
      : this.lives === 0 ? "lives-exhausted" : null;
    if (this.currentEndReason !== null) {
      this.currentState = "finished";
      return true;
    }
    this.index += 1;
    this.currentState = "writing";
    return false;
  }

  restart(): Question {
    this.index = 0;
    this.answered = 0;
    this.correct = 0;
    this.feedbackTotal = 0;
    this.feedbackCount = 0;
    this.currentEndReason = null;
    this.lives = this.initialLives;
    this.streak = 0;
    this.currentState = "writing";
    return this.question;
  }
}

