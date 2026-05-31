import { describe, expect, it } from "vitest";
import { BrowserGvgRealtimeClient } from "./browserRealtimeClient";
import { MockGvgRealtimeClient } from "./mockRealtimeClient";
import { GvgRealtimeSnapshotRuntime } from "./realtimeSnapshotRuntime";
import { buildGvgStreamId } from "./streamId";
import type { GvgCastle, GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "./types";

const receivedAt = "2026-05-27T00:20:00.000Z";
const worldId = "1001" as GvgWorldId;
const ownGuildId = "438130839001" as GvgGuildId;
const enemyGuildId = "123456789001" as GvgGuildId;

const guildStreamId = buildGvgStreamId({
  castleId: 0,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

const unknownStreamId = buildGvgStreamId({
  castleId: 31,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

describe("GvgRealtimeSnapshotRuntime", () => {
  it("connects, subscribes, and updates snapshot from mock payloads", async () => {
    const client = new MockGvgRealtimeClient();
    const snapshots: GvgSnapshot[] = [];
    const runtime = createRuntime(client, snapshots);
    const initialSnapshot = createSnapshot({ defenseCount: 30 });

    await runtime.start(initialSnapshot);
    client.emitPayload(createCastleStatusBytes({ defenseCount: 12 }));

    expect(client.subscriptions).toHaveLength(1);
    expect(client.subscriptions[0].streamId).toBe(guildStreamId);
    expect(runtime.snapshot?.castles[0].defenseCount).toBe(12);
    expect(snapshots[0].castles[0].defenseCount).toBe(12);
    expect(initialSnapshot.castles[0].defenseCount).toBe(30);
  });

  it("uses an injected subscription factory", async () => {
    const client = new MockGvgRealtimeClient();
    const customStreamId = buildGvgStreamId({
      castleId: 0,
      block: 2,
      worldGroupId: 12,
      gvgClass: 3,
      worldId: 0
    });
    const customSubscription = {
      streamId: customStreamId,
      payload: new Uint8Array([1, 2, 3, 4])
    };
    const runtime = new GvgRealtimeSnapshotRuntime({
      client,
      createSubscription: () => customSubscription,
      getReceivedAt: () => receivedAt
    });

    await runtime.start(createSnapshot());

    expect(client.subscriptions).toEqual([customSubscription]);

    runtime.stop();
    expect(client.sentUnsubscriptions).toEqual([customSubscription]);
  });

  it("updates attack count through the runtime pipeline", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);

    await runtime.start(createSnapshot({ attackCount: 0 }));
    client.emitPayload(createCastleStatusBytes({ attackCount: 3, rawState: 1 }));

    expect(runtime.snapshot?.castles[0].attackCount).toBe(3);
    expect(runtime.snapshot?.castles[0].state).toBe("inBattle");
  });

  it("updates ownership", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);

    await runtime.start(createSnapshot({ ownerGuildId: ownGuildId }));
    client.emitPayload(createCastleStatusBytes({ guildId: 123456789 }));

    expect(runtime.snapshot?.castles[0].ownerGuildId).toBe(enemyGuildId);
  });

  it("updates guild names", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);

    await runtime.start(createSnapshot());
    client.emitPayload(createGuildMessageBytes(123456789, "Attack Guild"));

    expect(runtime.snapshot?.guildNames[enemyGuildId]).toBe("Attack Guild");
  });

  it("keeps unknown payloads from breaking the current snapshot", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);
    const initialSnapshot = createSnapshot();

    await runtime.start(initialSnapshot);
    client.emitPayload(writeUint32(unknownStreamId, [9, 8, 7]));

    expect(runtime.snapshot).toBe(initialSnapshot);
  });

  it("ignores payloads before start and after stop", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);

    client.emitPayload(createCastleStatusBytes({ defenseCount: 12 }));
    expect(runtime.snapshot).toBeNull();

    await runtime.start(createSnapshot({ defenseCount: 30 }));
    runtime.stop();
    client.emitPayload(createCastleStatusBytes({ defenseCount: 9 }));

    expect(runtime.snapshot?.castles[0].defenseCount).toBe(30);
    expect(client.sentUnsubscriptions).toHaveLength(1);
  });

  it("can use BrowserGvgRealtimeClient through the same interface", async () => {
    const socket = new FakeWebSocket();
    const client = new BrowserGvgRealtimeClient({ createWebSocket: () => socket });
    const runtime = createRuntime(client);

    const startPromise = runtime.start(createSnapshot({ defenseCount: 30 }));
    socket.open();
    await startPromise;
    socket.receive(new Uint8Array(createCastleStatusBytes({ defenseCount: 11 })).buffer);

    expect(socket.sentPayloads).toHaveLength(1);
    expect(runtime.snapshot?.castles[0].defenseCount).toBe(11);
  });

  it("does not reconnect when start is called twice", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = createRuntime(client);

    await runtime.start(createSnapshot());
    await runtime.start(createSnapshot({ defenseCount: 12 }));

    expect(client.subscriptions).toHaveLength(1);
    expect(runtime.snapshot?.castles[0].defenseCount).toBe(12);
  });
});

function createRuntime(client: MockGvgRealtimeClient | BrowserGvgRealtimeClient, snapshots: GvgSnapshot[] = []) {
  return new GvgRealtimeSnapshotRuntime({
    client,
    getReceivedAt: () => receivedAt,
    onSnapshotUpdated: (snapshot) => snapshots.push(snapshot)
  });
}

function createSnapshot(overrides: Partial<GvgCastle> = {}): GvgSnapshot {
  return {
    worldId,
    capturedAt: "2026-05-27T00:00:00.000Z",
    guildNames: {
      [ownGuildId]: "Own Guild"
    },
    castles: [createCastle(overrides)]
  };
}

function createCastle(overrides: Partial<GvgCastle> = {}): GvgCastle {
  return {
    castleId: "1" as GvgCastleId,
    worldId,
    state: "idle",
    status: "normal",
    ownerGuildId: ownGuildId,
    attackerGuildId: null,
    defenseCount: 30,
    attackCount: 0,
    fallenAt: null,
    lastWinPartyKnockOutCount: 0,
    updatedAt: "2026-05-27T00:00:00.000Z",
    ...overrides
  };
}

function createGuildMessageBytes(guildId: number, guildName: string): number[] {
  const guildNameBytes = Array.from(new TextEncoder().encode(guildName));

  return [
    ...writeUint32(guildStreamId),
    ...writeUint32(guildId),
    guildNameBytes.length,
    ...guildNameBytes
  ];
}

function createCastleStatusBytes(
  overrides: Partial<{
    guildId: number;
    attackerGuildId: number;
    defenseCount: number;
    attackCount: number;
    rawState: number;
  }> = {}
): number[] {
  return [
    ...writeUint32(castleStreamId),
    ...writeUint32(overrides.guildId ?? 438130839),
    ...writeUint32(overrides.attackerGuildId ?? 0),
    ...writeUint32(0),
    ...writeUint16(overrides.defenseCount ?? 30),
    ...writeUint16(overrides.attackCount ?? 0),
    overrides.rawState ?? 0,
    0,
    ...writeUint16(0)
  ];
}

function writeUint32(value: number, tail: readonly number[] = []): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);

  return [...bytes, ...tail];
}

function writeUint16(value: number): number[] {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);

  return [...bytes];
}

class FakeWebSocket {
  binaryType: BinaryType = "blob";
  readyState = 0;
  readonly sentPayloads: Uint8Array[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  send(payload: Uint8Array): void {
    this.sentPayloads.push(payload);
  }

  close(): void {
    this.readyState = 3;
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
    this.readyState = 1;
    this.dispatch("open", {});
  }

  receive(data: unknown): void {
    this.dispatch("message", { data });
  }

  private dispatch(type: string, event: object): void {
    const listeners = this.listeners.get(type) ?? new Set();

    for (const listener of listeners) {
      listener(event as Event);
    }
  }
}
