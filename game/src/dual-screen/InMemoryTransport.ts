import type { DualScreenMessage } from "./messages";
import type { DualScreenTransport } from "./Transport";

export class InMemoryTransport implements DualScreenTransport {
  private listeners = new Set<(message: DualScreenMessage) => void>();
  private peer: InMemoryTransport | null = null;
  private closed = false;

  static pair(): [InMemoryTransport, InMemoryTransport] {
    const left = new InMemoryTransport();
    const right = new InMemoryTransport();
    left.peer = right;
    right.peer = left;
    return [left, right];
  }

  post(message: DualScreenMessage): void {
    if (this.closed || !this.peer || this.peer.closed) return;
    for (const listener of this.peer.listeners) listener(message);
  }

  subscribe(listener: (message: DualScreenMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}
