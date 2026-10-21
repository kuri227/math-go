/** Heartbeats belong to the channel; unchanged game snapshots need no replay. */
export class StatePublisher<T> {
  private previous: string | undefined;
  constructor(private readonly send: (value: T) => void) {}
  publish(value: T, force = false): boolean {
    const serialized = JSON.stringify(value);
    if (!force && serialized === this.previous) return false;
    this.send(value);
    this.previous = serialized;
    return true;
  }
}
