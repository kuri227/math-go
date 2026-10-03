import type { GameState, GameStats, Question, RoundOutcome } from "./types";

export class GameSession {
  private index = 0;
  private currentState: GameState = "loading";
  private outcomes: RoundOutcome[] = [];
  private score = 0;
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
    const measured = this.outcomes.filter((outcome) => outcome.feedbackMs > 0);
    const feedbackTotal = measured.reduce((sum, outcome) => sum + outcome.feedbackMs, 0);
    return {
      score: this.score,
      lives: this.lives,
      streak: this.streak,
      correct: this.outcomes.filter((outcome) => outcome.correct).length,
      answered: this.outcomes.length,
      averageFeedbackMs: measured.length === 0 ? 0 : feedbackTotal / measured.length,
    };
  }

  setState(state: GameState): void {
    this.currentState = state;
  }

  commit(correct: boolean, feedbackMs: number, skipped = false, bonus = 0): boolean {
    this.outcomes.push({
      questionId: this.question.id,
      correct,
      skipped,
      feedbackMs,
    });
    if (correct) {
      this.score += 100 + Math.min(this.streak, 5) * 20 + Math.max(0, Math.round(bonus));
      this.streak += 1;
    } else {
      this.lives = Math.max(0, this.lives - 1);
      this.streak = 0;
    }

    const finished = this.lives === 0 || this.index >= this.questions.length - 1;
    if (finished) {
      this.currentState = "finished";
      return true;
    }
    this.index += 1;
    this.currentState = "writing";
    return false;
  }

  restart(): Question {
    this.index = 0;
    this.outcomes = [];
    this.score = 0;
    this.lives = this.initialLives;
    this.streak = 0;
    this.currentState = "writing";
    return this.question;
  }
}

