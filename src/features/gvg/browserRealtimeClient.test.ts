import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserGvgRealtimeClient, GVG_REALTIME_WEBSOCKET_ENDPOINT } from "./browserRealtimeClient";
import { createGuildBattleSubscription } from "./realtimeClientTypes";
import type { GvgRealtimeClientEvent } from "./realtimeClientTypes";

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

class FakeWebSocket {
  binaryType: BinaryType = "blob";
  readyState = WS_CONNECTING;
  readonly sentPayloads: Uint8Array[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  send(payload: Uint8Array): void {
    this.sentPayloads.push(payload);
  }

  close(): void {
    this.readyState = WS_CLOSED;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  open(): void {
    this.readyState = WS_OPEN;
    this.dispatch("open", {});
  }

  receive(data: unknown): void {
    this.dispatch("message", { data });
  }

  serverClose(): void {
    this.readyState = WS_CLOSED;
    this.dispatch("close", {});
  }

  fail(): void {
    this.dispatch("error", {});
  }

  private dispatch(type: string, event: object): void {
    const listeners = this.listeners.get(type) ?? new Set();

    for (const listener of listeners) {
      listener(event as Event);
    }
  }
}

describe("BrowserGvgRealtimeClient", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", {
      CONNECTING: WS_CONNECTING,
      OPEN: WS_OPEN,
      CLOSED: WS_CLOSED
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects and emits state changes", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = new BrowserGvgRealtimeClient({
      createWebSocket: (endpoint) => {
        expect(endpoint).toBe(GVG_REALTIME_WEBSOCKET_ENDPOINT);
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      }
    });
    const events: GvgRealtimeClientEvent["type"][] = [];
    client.addEventListener((event) => events.push(event.type));

    const connectPromise = client.connect();
    sockets[0].open();
    await connectPromise;

    expect(client.state).toEqual({ status: "connected" });
    expect(sockets[0].binaryType).toBe("arraybuffer");
    expect(events).toEqual(["stateChanged", "stateChanged", "connected"]);
  });

  it("disconnects safely", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const events: GvgRealtimeClientEvent[] = [];
    client.addEventListener((event) => events.push(event));

    const connectPromise = client.connect();
    socket.open();
    await connectPromise;
    client.disconnect("manual");
    client.disconnect("manual");

    expect(socket.readyState).toBe(WS_CLOSED);
    expect(client.state).toEqual({ status: "disconnected", reason: "manual" });
    expect(events.filter((event) => event.type === "disconnected")).toHaveLength(1);
  });

  it("emits ArrayBuffer payload events", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const payloads: number[][] = [];
    client.addEventListener((event) => {
      if (event.type === "payloadReceived") {
        payloads.push(Array.from(event.payload));
      }
    });

    const connectPromise = client.connect();
    socket.open();
    await connectPromise;
    socket.receive(new Uint8Array([1, 2, 3]).buffer);

    expect(payloads).toEqual([[1, 2, 3]]);
  });

  it("emits Blob payload events", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const payloadReceived = new Promise<readonly number[]>((resolve) => {
      client.addEventListener((event) => {
        if (event.type === "payloadReceived") {
          resolve(Array.from(event.payload));
        }
      });
    });

    const connectPromise = client.connect();
    socket.open();
    await connectPromise;
    socket.receive(new Blob([new Uint8Array([4, 5, 6])]));

    await expect(payloadReceived).resolves.toEqual([4, 5, 6]);
  });

  it("sends subscribe and unsubscribe payloads only when connected", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const subscription = createGuildBattleSubscription("1001");

    client.subscribe(subscription);

    const connectPromise = client.connect();
    socket.open();
    await connectPromise;
    client.subscribe(subscription);
    client.unsubscribe(subscription);

    expect(socket.sentPayloads.map((payload) => Array.from(payload))).toEqual([
      Array.from(subscription.payload),
      Array.from(subscription.payload)
    ]);
  });

  it("does not create another socket on double connect", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = new BrowserGvgRealtimeClient({
      createWebSocket: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      }
    });

    const firstConnect = client.connect();
    const secondConnect = client.connect();
    sockets[0].open();

    await Promise.all([firstConnect, secondConnect]);

    expect(sockets).toHaveLength(1);
  });

  it("moves to disconnected when the server closes", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });

    const connectPromise = client.connect();
    socket.open();
    await connectPromise;
    socket.serverClose();

    expect(client.state).toEqual({ status: "disconnected", reason: "closed" });
  });

  it("emits error state when the socket fails", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const events: GvgRealtimeClientEvent["type"][] = [];
    client.addEventListener((event) => events.push(event.type));

    const connectPromise = client.connect();
    socket.fail();

    await expect(connectPromise).rejects.toThrow("GvG realtime WebSocket error");
    expect(client.state.status).toBe("error");
    expect(events).toEqual(["stateChanged", "stateChanged", "error"]);
  });
});
