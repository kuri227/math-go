import { isDualScreenMessage, type DualScreenMessage, type DualScreenRole } from "./messages";
import type { DualScreenTransport } from "./Transport";

/** Reconnect only the transport. Never replay a recognition/confirm/save action. */
export class WebSocketTransport implements DualScreenTransport {
  readonly managedLiveness = true;
  private socket: WebSocket | null = null;
  private hello: DualScreenMessage | null = null;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(message: DualScreenMessage) => void>();
  private disconnectListeners = new Set<() => void>();

  constructor(private sessionId: string, private role: DualScreenRole) {}

  post(message: DualScreenMessage): void {
    if (this.closed) return;
    if (message.type === "hello") this.hello = message;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else if (!this.socket && !this.retry) this.connect();
  }

  private connect(): void {
    if (this.closed || this.socket) return;
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${location.host}/api/v1/pair/${encodeURIComponent(this.sessionId)}/${this.role}`);
    this.socket = socket;
    socket.addEventListener("open", () => { if (this.socket === socket && !this.closed && this.hello) socket.send(JSON.stringify(this.hello)); });
    socket.addEventListener("message", event => {
      if (this.socket !== socket || this.closed) return;
      let message: unknown;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message && typeof message === "object" && "type" in message && message.type === "pair-status") {
        for (const listener of this.disconnectListeners) listener();
      } else if (isDualScreenMessage(message)) for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const listener of this.disconnectListeners) listener();
      if (!this.closed) this.retry = setTimeout(() => { this.retry = null; this.connect(); }, 2000);
    });
  }

  subscribe(listener: (message: DualScreenMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeDisconnect(listener: () => void): () => void { this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener); }
  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null; this.socket?.close(); this.socket = null;
    this.listeners.clear(); this.disconnectListeners.clear();
  }
}
