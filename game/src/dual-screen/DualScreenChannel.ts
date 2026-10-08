import {
  DUAL_SCREEN_PROTOCOL_VERSION,
  type DualScreenMessage,
  type DualScreenPayload,
  type DualScreenRole,
} from "./messages";
import type { DualScreenTransport } from "./Transport";

export interface DualScreenConnectionState {
  connected: boolean;
  incompatible: boolean;
}

export class DualScreenChannel {
  private sequence = 0;
  private lastRemoteSequence = 0;
  private remoteConnectionId: string | null = null;
  readonly connectionId = crypto.randomUUID();
  private rejected = false;
  private lastSeenAt = 0;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(message: DualScreenMessage) => void>();
  private stateListeners = new Set<(state: DualScreenConnectionState) => void>();
  private unsubscribe: (() => void) | null = null;
  private state: DualScreenConnectionState = { connected: false, incompatible: false };

  constructor(
    private readonly transport: DualScreenTransport,
    readonly sessionId: string,
    readonly role: DualScreenRole,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.transport.subscribe((message) => this.receive(message));
    this.send({ type: "hello", role: this.role });
    this.heartbeatHandle = setInterval(() => {
      // A newly opened Controller can briefly collide with the final heartbeat
      // window of a tab that has just been closed. Keep asking to join so the
      // Display can accept it as soon as the stale connection times out.
      this.send(this.rejected ? { type: "hello", role: this.role } : { type: "heartbeat" });
      const connected = this.lastSeenAt > 0 && this.now() - this.lastSeenAt <= 3_500;
      this.setState({ ...this.state, connected });
    }, 1_000);
  }

  send(payload: DualScreenPayload): void {
    this.transport.post({
      ...payload,
      sessionId: this.sessionId,
      connectionId: this.connectionId,
      protocolVersion: DUAL_SCREEN_PROTOCOL_VERSION,
      sequence: ++this.sequence,
      sender: this.role,
      sentAt: this.now(),
    } as DualScreenMessage);
  }

  subscribe(listener: (message: DualScreenMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: (state: DualScreenConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  close(): void {
    if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
    this.heartbeatHandle = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport.close();
    this.setState({ connected: false, incompatible: false });
  }

  private receive(message: DualScreenMessage): void {
    if (message.sessionId !== this.sessionId || message.sender === this.role) return;
    if (message.protocolVersion !== DUAL_SCREEN_PROTOCOL_VERSION) {
      this.setState({ connected: false, incompatible: true });
      return;
    }
    if (message.type === "connection-rejected") {
      if (message.targetConnectionId !== this.connectionId) return;
      this.rejected = true;
      this.setState({ connected: false, incompatible: false });
      for (const listener of this.listeners) listener(message);
      return;
    }
    // Only an explicit hello proves that the Display has released the former
    // Controller and accepted this connection. Ordinary heartbeats from the
    // still-active Display must not make two live Controllers appear valid.
    if (this.rejected) {
      if (message.type !== "hello") return;
      this.rejected = false;
    }
    if (this.remoteConnectionId === null) {
      this.remoteConnectionId = message.connectionId;
      this.lastRemoteSequence = 0;
    } else if (message.connectionId !== this.remoteConnectionId) {
      if (this.state.connected) {
        if (message.type === "hello") {
          this.send({
            type: "connection-rejected",
            targetConnectionId: message.connectionId,
            reason: "role-already-connected",
          });
        }
        return;
      }
      this.remoteConnectionId = message.connectionId;
      this.lastRemoteSequence = 0;
    }
    if (message.connectionId !== this.remoteConnectionId || message.sequence <= this.lastRemoteSequence) return;
    const wasConnected = this.state.connected;
    this.lastRemoteSequence = message.sequence;
    this.lastSeenAt = this.now();
    this.setState({ connected: true, incompatible: false });
    if (message.type === "hello" && !wasConnected) this.send({ type: "hello", role: this.role });
    for (const listener of this.listeners) listener(message);
  }

  private setState(next: DualScreenConnectionState): void {
    if (next.connected === this.state.connected && next.incompatible === this.state.incompatible) return;
    this.state = next;
    for (const listener of this.stateListeners) listener(next);
  }
}
