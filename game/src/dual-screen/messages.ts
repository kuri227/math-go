import type { RecognitionResponse } from "../domain/types";
import type { Snapshot } from "../exhibition/Session";
import type { InkSnapshot } from "../ui/HandwritingPad";

export const DUAL_SCREEN_PROTOCOL_VERSION = 4 as const;
export type DualScreenRole = "display" | "controller";

interface MessageBase {
  sessionId: string;
  connectionId: string;
  protocolVersion: number;
  sequence: number;
  sender: DualScreenRole;
  sentAt: number;
}

export type DualScreenPayload =
  | { type: "exhibition-state"; snapshot: Snapshot | null }
  | { type: "exhibition-action"; action: "recognize" | "confirm" | "rewrite" | "next" | "retry-test" | "stop"; runId: string; questionId: string; requestId?: string; response?: RecognitionResponse; error?: string }
  | { type: "exhibition-control"; action: "configure"; mode: "exhibition" | "test"; difficulty: number; questionIds: string[] }
  | { type: "exhibition-control"; action: "back-to-setup" | "begin-countdown" | "controller-ready"; runId?: string; questionId?: string }
  | { type: "setup-error"; message: string }
  | { type: "ink-snapshot"; runId: string; questionId: string; generation: number; ink: InkSnapshot }
  | { type: "hello"; role: DualScreenRole }
  | { type: "heartbeat" }
  | { type: "connection-rejected"; targetConnectionId: string; reason: "role-already-connected" }
  ;

export type DualScreenMessage = MessageBase & DualScreenPayload;

export function isDualScreenMessage(value: unknown): value is DualScreenMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DualScreenMessage>;
  return typeof candidate.type === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.connectionId === "string"
    && typeof candidate.protocolVersion === "number"
    && typeof candidate.sequence === "number"
    && (candidate.sender === "display" || candidate.sender === "controller")
    && typeof candidate.sentAt === "number";
}

export const MAX_INK_POINTS = 12_000;

export function isSafeInkSnapshot(value: unknown): value is InkSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<InkSnapshot>;
  if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision! < 0 || typeof snapshot.aspectRatio !== "number" || !Number.isFinite(snapshot.aspectRatio) || snapshot.aspectRatio < 0.05 || snapshot.aspectRatio > 20 || !Array.isArray(snapshot.strokes)) return false;
  let points = 0;
  for (const stroke of snapshot.strokes) {
    if (!Array.isArray(stroke) || stroke.length > MAX_INK_POINTS) return false;
    points += stroke.length;
    if (points > MAX_INK_POINTS) return false;
    for (const point of stroke) {
      if (!point || typeof point !== "object") return false;
      const candidate = point as { x?: unknown; y?: unknown; pressure?: unknown };
      if (![candidate.x, candidate.y, candidate.pressure].every(number => typeof number === "number" && Number.isFinite(number))) return false;
      if ((candidate.x as number) < 0 || (candidate.x as number) > 1 || (candidate.y as number) < 0 || (candidate.y as number) > 1 || (candidate.pressure as number) < 0 || (candidate.pressure as number) > 1) return false;
    }
  }
  return true;
}
