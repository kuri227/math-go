export function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export const ui = {
  startScreen: required<HTMLElement>("#startScreen"),
  gameShell: required<HTMLElement>("#gameShell"),
  startButton: required<HTMLButtonElement>("#startButton"),
  courseButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-course]")],
  difficultyList: required<HTMLElement>("#difficultyList"),
  difficultyPrevious: required<HTMLButtonElement>("#difficultyPrevious"),
  difficultyNext: required<HTMLButtonElement>("#difficultyNext"),
  difficultyPageLabel: required<HTMLElement>("#difficultyPageLabel"),
  selectedDifficultyLabel: required<HTMLElement>("#selectedDifficultyLabel"),
  gameStage: required<HTMLElement>(".game-stage"),
  answerPanel: required<HTMLElement>("#answerPanel"),
  actionStatus: required<HTMLElement>("#actionStatus"),
  submitButton: required<HTMLButtonElement>("#submitButton"),
  undoButton: required<HTMLButtonElement>("#undoButton"),
  clearButton: required<HTMLButtonElement>("#clearButton"),
  skipButton: required<HTMLButtonElement>("#skipButton"),
  retryButton: required<HTMLButtonElement>("#retryButton"),
  nextButton: required<HTMLButtonElement>("#nextButton"),
  restartButton: required<HTMLButtonElement>("#restartButton"),
  backToTitleButton: required<HTMLButtonElement>("#backToTitleButton"),
  titleButton: required<HTMLButtonElement>("#titleButton"),
  resultSection: required<HTMLElement>("#recognitionResult"),
  endScreen: required<HTMLElement>("#endScreen"),
  stageFeedback: required<HTMLElement>("#stageFeedback"),
  stageIntro: required<HTMLElement>("#stageIntro"),
  timerTrack: required<HTMLElement>("#timerTrack"),
  timerFill: required<HTMLElement>("#timerFill"),
  timeStat: required<HTMLElement>(".time-stat"),
  soundButton: required<HTMLButtonElement>("#soundButton"),
  explanationText: required<HTMLElement>("#explanationText"),
  answerPreview: required<HTMLImageElement>("#answerPreview"),
  answerPreviewEmpty: required<HTMLElement>("#answerPreviewEmpty"),
};
