import type { CoordinatorSnapshot } from "../application/GameCoordinator";
import type { RecognitionResponse } from "../domain/types";

export const DUAL_SCREEN_PROTOCOL_VERSION = 1 as const;
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
  | { type: "hello"; role: DualScreenRole }
  | { type: "heartbeat" }
  | { type: "connection-rejected"; targetConnectionId: string; reason: "role-already-connected" }
  | { type: "round-ready"; round: number; total: number; inputEnabled: boolean }
  | { type: "submission-started"; requestId: string }
  | {
      type: "recognition-completed";
      requestId: string;
      response: RecognitionResponse;
      encodeMs: number;
      requestMs: number;
      feedbackStartedAt: number;
    }
  | { type: "recognition-failed"; requestId: string; message: string }
  | { type: "skip-requested" }
  | { type: "retry-requested" }
  | { type: "advance-requested" }
  | { type: "game-state"; snapshot: CoordinatorSnapshot }
  | { type: "session-ended"; reason: "finished" | "title" };

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
