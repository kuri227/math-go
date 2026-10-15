import type { RecognitionResponse } from "../domain/types";
import type { Snapshot } from "../exhibition/Session";

export const DUAL_SCREEN_PROTOCOL_VERSION = 2 as const;
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
