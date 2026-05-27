import { describe, expect, it } from "vitest";
import { MockGvgRealtimeClient } from "./mockRealtimeClient";
import { createGuildBattleSubscription } from "./realtimeClientTypes";

describe("MockGvgRealtimeClient", () => {
  it("emits connection state and payload events", async () => {
    const client = new MockGvgRealtimeClient();
    const events: string[] = [];

    client.addEventListener((event) => {
      events.push(event.type);
    });

    await client.connect();
    client.emitPayload([1, 2, 3]);
    client.disconnect("done");

    expect(events).toEqual([
      "stateChanged",
      "stateChanged",
      "connected",
      "payloadReceived",
      "stateChanged",
      "disconnected"
    ]);
  });

  it("records subscribe and unsubscribe calls", () => {
    const client = new MockGvgRealtimeClient();
    const subscription = createGuildBattleSubscription("1001");

    client.subscribe(subscription);
    client.unsubscribe(subscription);

    expect(client.subscriptions).toEqual([subscription]);
    expect(client.sentUnsubscriptions).toEqual([subscription]);
  });

  it("can remove event listeners", () => {
    const client = new MockGvgRealtimeClient();
    const events: string[] = [];
    const removeListener = client.addEventListener((event) => {
      events.push(event.type);
    });

    removeListener();
    client.emitPayload([1]);

    expect(events).toEqual([]);
  });
});
