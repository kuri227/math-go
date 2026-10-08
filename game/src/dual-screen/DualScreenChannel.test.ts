import { afterEach, describe, expect, it, vi } from "vitest";
import { DualScreenChannel } from "./DualScreenChannel";
import { InMemoryTransport } from "./InMemoryTransport";
import type { DualScreenMessage } from "./messages";

afterEach(() => vi.useRealTimers());

describe("DualScreenChannel", () => {
  it("connects both roles after hello", () => {
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => 1);
    const controller = new DualScreenChannel(controllerTransport, "session", "controller", () => 1);
    let connected = false;
    display.subscribeConnection((state) => { connected = state.connected; });
    display.start();
    controller.start();
    expect(connected).toBe(true);
    display.close();
    controller.close();
  });

  it("ignores old or duplicated sequences", () => {
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => 1);
    const received: DualScreenMessage[] = [];
    display.subscribe((message) => received.push(message));
    display.start();
    const message: DualScreenMessage = {
      type: "advance-requested",
      sessionId: "session",
      connectionId: "controller-instance",
      protocolVersion: 1,
      sequence: 4,
      sender: "controller",
      sentAt: 1,
    };
    controllerTransport.post(message);
    controllerTransport.post(message);
    controllerTransport.post({ ...message, sequence: 3 });
    expect(received.filter((item) => item.type === "advance-requested")).toHaveLength(1);
    display.close();
    controllerTransport.close();
  });

  it("reports a heartbeat timeout", () => {
    vi.useFakeTimers();
    let now = 0;
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => now);
    const controller = new DualScreenChannel(controllerTransport, "session", "controller", () => now);
    const states: boolean[] = [];
    display.subscribeConnection((state) => states.push(state.connected));
    display.start();
    controller.start();
    controller.close();
    now = 5_000;
    vi.advanceTimersByTime(4_000);
    expect(states.at(-1)).toBe(false);
    display.close();
  });

  it("rejects an incompatible protocol version", () => {
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => 1);
    let incompatible = false;
    display.subscribeConnection((state) => { incompatible = state.incompatible; });
    display.start();
    controllerTransport.post({
      type: "hello",
      role: "controller",
      sessionId: "session",
      connectionId: "old-controller",
      protocolVersion: 99,
      sequence: 1,
      sender: "controller",
      sentAt: 1,
    });
    expect(incompatible).toBe(true);
    display.close();
    controllerTransport.close();
  });

  it("keeps the first live controller and ignores a second connection", () => {
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => 1);
    const connectionIds: string[] = [];
    const rejectedTargets: string[] = [];
    controllerTransport.subscribe((message) => {
      if (message.type === "connection-rejected") rejectedTargets.push(message.targetConnectionId);
    });
    display.subscribe((message) => connectionIds.push(message.connectionId));
    display.start();
    const hello = (connectionId: string): DualScreenMessage => ({
      type: "hello",
      role: "controller",
      sessionId: "session",
      connectionId,
      protocolVersion: 1,
      sequence: 1,
      sender: "controller",
      sentAt: 1,
    });
    controllerTransport.post(hello("first-controller"));
    controllerTransport.post(hello("second-controller"));
    expect(connectionIds).toEqual(["first-controller"]);
    expect(rejectedTargets).toEqual(["second-controller"]);
    display.close();
    controllerTransport.close();
  });

  it("retries a rejected controller and reconnects when the display accepts it", () => {
    vi.useFakeTimers();
    const [controllerTransport, displayTransport] = InMemoryTransport.pair();
    const controller = new DualScreenChannel(controllerTransport, "session", "controller", () => 1);
    const states: boolean[] = [];
    const sentTypes: string[] = [];
    displayTransport.subscribe((message) => sentTypes.push(message.type));
    controller.subscribeConnection((state) => states.push(state.connected));
    controller.start();
    displayTransport.post({
      type: "connection-rejected",
      targetConnectionId: controller.connectionId,
      reason: "role-already-connected",
      sessionId: "session",
      connectionId: "display-instance",
      protocolVersion: 1,
      sequence: 1,
      sender: "display",
      sentAt: 1,
    });
    vi.advanceTimersByTime(1_000);
    expect(sentTypes.at(-1)).toBe("hello");
    displayTransport.post({
      type: "hello",
      role: "display",
      sessionId: "session",
      connectionId: "display-instance",
      protocolVersion: 1,
      sequence: 2,
      sender: "display",
      sentAt: 1,
    });
    expect(states.at(-1)).toBe(true);
    controller.close();
    displayTransport.close();
  });

  it("accepts a replacement controller after the previous heartbeat expires", () => {
    vi.useFakeTimers();
    let now = 1;
    const [displayTransport, controllerTransport] = InMemoryTransport.pair();
    const display = new DualScreenChannel(displayTransport, "session", "display", () => now);
    const acceptedConnections: string[] = [];
    display.subscribe((message) => {
      if (message.type === "hello") acceptedConnections.push(message.connectionId);
    });
    display.start();
    const hello = (connectionId: string, sequence: number): DualScreenMessage => ({
      type: "hello",
      role: "controller",
      sessionId: "session",
      connectionId,
      protocolVersion: 1,
      sequence,
      sender: "controller",
      sentAt: now,
    });
    controllerTransport.post(hello("old-controller", 1));
    controllerTransport.post(hello("new-controller", 1));
    expect(acceptedConnections).toEqual(["old-controller"]);

    now = 5_000;
    vi.advanceTimersByTime(4_000);
    controllerTransport.post(hello("new-controller", 2));
    expect(acceptedConnections).toEqual(["old-controller", "new-controller"]);

    display.close();
    controllerTransport.close();
  });
});
