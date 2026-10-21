import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketTransport } from "./WebSocketTransport";
import { DualScreenChannel } from "./DualScreenChannel";

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  constructor(readonly url: string) { super(); Socket.instances.push(this); }
  send(data: string): void { this.sent.push(JSON.parse(data)); }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  close(): void { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  receive(data: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); Socket.instances = []; });

describe("server-owned pairing lifetime", () => {
  it("does not expire a background tab and never replays offline actions", () => {
    vi.useFakeTimers(); vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:8000" });
    const transport = new WebSocketTransport("s", "controller");
    const channel = new DualScreenChannel(transport, "s", "controller");
    let connected = false; channel.subscribeConnection(s => { connected = s.connected; });
    channel.start(); const first = Socket.instances[0]!; first.open();
    first.receive({ type: "hello", role: "display", sender: "display", sessionId: "s", connectionId: "d", protocolVersion: 3, sequence: 1, sentAt: 1 });
    expect(connected).toBe(true);
    vi.advanceTimersByTime(300_000); expect(connected).toBe(true); expect(vi.getTimerCount()).toBe(0);
    first.close(); expect(connected).toBe(false);
    channel.send({ type: "exhibition-action", action: "confirm", runId: "r", questionId: "q" });
    vi.advanceTimersByTime(2000);
    const second = Socket.instances[1]!; second.open();
    expect(second.sent).toHaveLength(1); expect(second.sent[0]).toMatchObject({ type: "hello" });
    second.receive({ type: "hello", role: "display", sender: "display", sessionId: "s", connectionId: "d", protocolVersion: 3, sequence: 1, sentAt: 1 });
    expect(connected).toBe(true);
    second.receive({ type: "pair-status", connected: false }); expect(connected).toBe(false);
    channel.close(); expect(vi.getTimerCount()).toBe(0);
  });
});
