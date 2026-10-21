import { expect, it, vi } from "vitest";
import { StatePublisher } from "./StatePublisher";

it("sends one idle snapshot instead of ten per second", () => {
  const send = vi.fn(), state = { phase: "result", remainingMs: 0 };
  const publisher = new StatePublisher(send);
  for (let tick = 0; tick < 100; tick++) publisher.publish(state);
  expect(send).toHaveBeenCalledTimes(1);
  state.remainingMs = 20_000; publisher.publish(state);
  expect(send).toHaveBeenCalledTimes(2);
});
it("always resends on hello/reconnection even when the snapshot is unchanged", () => {
  const send = vi.fn(), publisher = new StatePublisher(send);
  publisher.publish(null); publisher.publish(null); publisher.publish(null, true);
  expect(send).toHaveBeenCalledTimes(2);
});
it("does not lose active timer updates", () => {
  const send = vi.fn(), publisher = new StatePublisher(send);
  for (let i = 0; i < 10; i++) publisher.publish({ remainingMs: 20_000 - i * 100 });
  expect(send).toHaveBeenCalledTimes(10);
});
