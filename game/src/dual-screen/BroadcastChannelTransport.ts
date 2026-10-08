import { isDualScreenMessage, type DualScreenMessage } from "./messages";
import type { DualScreenTransport } from "./Transport";

export class BroadcastChannelTransport implements DualScreenTransport {
  private readonly channel: BroadcastChannel;
  private readonly listeners = new Set<(message: DualScreenMessage) => void>();

  constructor(channelName: string) {
    this.channel = new BroadcastChannel(channelName);
    this.channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isDualScreenMessage(event.data)) return;
      for (const listener of this.listeners) listener(event.data);
    });
  }

  post(message: DualScreenMessage): void {
    this.channel.postMessage(message);
  }

  subscribe(listener: (message: DualScreenMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.channel.close();
  }
}
