import type { DualScreenMessage } from "./messages";

export interface DualScreenTransport {
  post(message: DualScreenMessage): void;
  subscribe(listener: (message: DualScreenMessage) => void): () => void;
  close(): void;
}
