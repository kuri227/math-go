export type GameState =
  | "loading"
  | "writing"
  | "recognizing"
  | "result"
  | "finished"
  | "error";

export type GameEndReason = "all-questions-completed" | "lives-exhausted";

export interface Question {
  id: string;
  instruction: string;
  display: string;
  display_latex: string;
  category: string;
  difficulty: number;
  difficulty_label: string;
}

export interface RecognitionTiming {
  preprocessing_ms: number;
  queue_ms: number;
  inference_ms: number;
  total_ms: number;
}

export interface RecognitionResponse {
  request_id: string;
  model: string;
  model_variant: string;
  device: string;
  raw_latex: string;
  normalized_latex: string;
  timing: RecognitionTiming;
  image: { width: number; height: number; bytes: number };
  initialization_ms: number | null;
  peak_vram_mb: number | null;
}

export interface PerformanceSample {
  encodeMs: number;
  requestMs: number;
  judgementMs: number;
  feedbackMs: number;
  response: RecognitionResponse;
  judgement: JudgementResponse;
}

export interface JudgementResponse {
  question_id: string;
  correct: boolean;
  recognized_latex: string;
  recognized_normalized: string;
  expected_latex: string;
  explanation: string;
  judge_method: "normalized_alias" | string;
  message: string;
}

export interface SolutionResponse {
  question_id: string;
  expected_latex: string;
  explanation: string;
}

export interface RoundOutcome {
  questionId: string;
  correct: boolean;
  skipped: boolean;
  feedbackMs: number;
}

export interface GameStats {
  lives: number;
  streak: number;
  correct: number;
  answered: number;
  averageFeedbackMs: number;
}

