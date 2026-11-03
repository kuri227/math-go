export const QUESTION_SECONDS = { 1: 15, 2: 25, 3: 40, 4: 55, 5: 75, 6: 100, 7: 120 } as const;
export const RULE_VERSION = 1;
export const ROUNDS_PER_RUN = 10;

export interface RoundInput {
  questionId: string;
  correct: boolean;
  remainingMs: number;
  limitMs: number;
  wrongAttempts: number;
}

export interface RunInput {
  runId: string;
  deviceId: string;
  displayName?: string;
  difficulty: number;
  ruleVersion: number;
  rounds: RoundInput[];
}

export interface ScoreBreakdown {
  score: number;
  correct: number;
  gold: number;
  silver: number;
  bronze: number;
  timeRatioMillis: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

export function normalizeRun(value: unknown): RunInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_RUN");
  const raw = value as Record<string, unknown>;
  const allowed = new Set(["runId", "deviceId", "displayName", "difficulty", "ruleVersion", "rounds"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new Error("UNKNOWN_FIELD");
  if (typeof raw.runId !== "string" || !UUID.test(raw.runId)) throw new Error("INVALID_RUN_ID");
  if (typeof raw.deviceId !== "string" || !UUID.test(raw.deviceId)) throw new Error("INVALID_DEVICE_ID");
  if (!Number.isInteger(raw.difficulty) || (raw.difficulty as number) < 1 || (raw.difficulty as number) > 7) throw new Error("INVALID_DIFFICULTY");
  if (raw.ruleVersion !== RULE_VERSION) throw new Error("INVALID_RULE_VERSION");
  const displayName = raw.displayName === undefined ? undefined : String(raw.displayName).trim();
  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 20 || CONTROL.test(displayName))) throw new Error("INVALID_DISPLAY_NAME");
  if (!Array.isArray(raw.rounds) || raw.rounds.length !== ROUNDS_PER_RUN) throw new Error("INVALID_ROUNDS");
  const expectedLimit = QUESTION_SECONDS[raw.difficulty as keyof typeof QUESTION_SECONDS] * 1000;
  const ids = new Set<string>();
  const rounds = raw.rounds.map((round) => {
    if (!round || typeof round !== "object" || Array.isArray(round)) throw new Error("INVALID_ROUND");
    const item = round as Record<string, unknown>;
    const roundAllowed = new Set(["questionId", "correct", "remainingMs", "limitMs", "wrongAttempts"]);
    if (Object.keys(item).some((key) => !roundAllowed.has(key))) throw new Error("UNKNOWN_ROUND_FIELD");
    if (typeof item.questionId !== "string" || item.questionId.length < 1 || item.questionId.length > 100 || ids.has(item.questionId)) throw new Error("INVALID_QUESTION_ID");
    ids.add(item.questionId);
    if (typeof item.correct !== "boolean") throw new Error("INVALID_CORRECT");
    if (item.limitMs !== expectedLimit || !Number.isInteger(item.remainingMs) || (item.remainingMs as number) < 0 || (item.remainingMs as number) > expectedLimit) throw new Error("INVALID_TIME");
    if (!Number.isInteger(item.wrongAttempts) || (item.wrongAttempts as number) < 0 || (item.wrongAttempts as number) > 100) throw new Error("INVALID_ATTEMPTS");
    return item as unknown as RoundInput;
  });
  return { runId: raw.runId, deviceId: raw.deviceId, displayName, difficulty: raw.difficulty as number, ruleVersion: RULE_VERSION, rounds };
}

export function scoreRun(run: RunInput): ScoreBreakdown {
  let score = 0, correct = 0, gold = 0, silver = 0, bronze = 0, timeRatioMillis = 0;
  for (const round of run.rounds) {
    timeRatioMillis += Math.round(((round.limitMs - round.remainingMs) / round.limitMs) * 1000);
    if (!round.correct) continue;
    correct += 1;
    score += 1_000;
    const ratio = round.remainingMs / round.limitMs;
    if (ratio >= 2 / 3) { gold += 1; score += 500; }
    else if (ratio >= 1 / 3) { silver += 1; score += 300; }
    else { bronze += 1; score += 100; }
  }
  if (correct === ROUNDS_PER_RUN) score += 1_000;
  return { score, correct, gold, silver, bronze, timeRatioMillis };
}
