import type { DualScreenMessage } from "./messages";

export interface DualScreenTransport {
  readonly managedLiveness?: boolean;
  subscribeDisconnect?(listener: () => void): () => void;
  post(message: DualScreenMessage): void;
  subscribe(listener: (message: DualScreenMessage) => void): () => void;
  close(): void;
}
