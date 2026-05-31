import { describe, expect, it } from "vitest";
import { MockGvgRealtimeClient } from "../gvg/mockRealtimeClient";
import { buildGvgStreamId } from "../gvg/streamId";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import { GrandBattleRealtimeSnapshotRuntime } from "./realtimeSnapshotRuntime";
import type { GrandBattleSnapshot } from "./types";

const receivedAt = "2026-05-27T00:20:00.000Z";
const guildA = "111111111050" as GvgGuildId;
const guildB = "222222222050" as GvgGuildId;
const allCastlesStreamId = buildGvgStreamId({
  castleId: 0,
  block: 0,
  worldGroupId: 12,
  gvgClass: 3,
  worldId: 0
});
const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 12,
  gvgClass: 3,
  worldId: 0
});

describe("GrandBattleRealtimeSnapshotRuntime", () => {
  it("connects, subscribes, and updates snapshots from mock payloads", async () => {
    const client = new MockGvgRealtimeClient();
    const snapshots: GrandBattleSnapshot[] = [];
    const runtime = new GrandBattleRealtimeSnapshotRuntime({
      client,
      getReceivedAt: () => receivedAt,
      onSnapshotUpdated: (snapshot) => snapshots.push(snapshot)
    });

    await runtime.start(createSnapshot());
    client.emitPayload(createCastleStatusBytes({ defenseCount: 12 }));

    expect(client.subscriptions).toHaveLength(1);
    expect(client.subscriptions[0].streamId).toBe(allCastlesStreamId);
    expect(runtime.snapshot?.castles[0].defenseCount).toBe(12);
    expect(snapshots[0].castles[0].defenseCount).toBe(12);
  });

  it("ignores payloads before start and after dispose", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = new GrandBattleRealtimeSnapshotRuntime({
      client,
      getReceivedAt: () => receivedAt
    });

    client.emitPayload(createCastleStatusBytes({ defenseCount: 12 }));
    expect(runtime.snapshot).toBeNull();

    await runtime.start(createSnapshot());
    runtime.dispose("test disposed");
    client.emitPayload(createCastleStatusBytes({ defenseCount: 9 }));

    expect(runtime.snapshot).toBeNull();
    expect(client.sentUnsubscriptions).toHaveLength(1);
    expect(client.state).toEqual({ status: "disconnected", reason: "test disposed" });
  });

  it("does not reconnect when start is called twice", async () => {
    const client = new MockGvgRealtimeClient();
    const runtime = new GrandBattleRealtimeSnapshotRuntime({
      client,
      getReceivedAt: () => receivedAt
    });

    await runtime.start(createSnapshot());
    await runtime.start(createSnapshot({ defenseCount: 80 }));

    expect(client.subscriptions).toHaveLength(1);
    expect(runtime.snapshot?.castles[0].defenseCount).toBe(80);
  });
});

function createSnapshot(
  overrides: Partial<GrandBattleSnapshot["castles"][number]> = {}
): GrandBattleSnapshot {
  return {
    source: {
      serverId: "japan",
      worldInput: "50",
      worldNumber: 50,
      classId: 3,
      blockId: 0
    },
    worldGroupId: 12,
    capturedAt: "2026-05-27T00:00:00.000Z",
    guildNames: {
      [guildA]: "ギルドA",
      [guildB]: "ギルドB"
    },
    castles: [
      {
        castleId: "1" as GvgCastleId,
        state: "idle",
        ownerGuildId: guildA,
        attackerGuildId: null,
        defenseCount: 120,
        attackCount: 0,
        fallenAt: null,
        lastWinPartyKnockOutCount: 0,
        updatedAt: "2026-05-27T00:00:00.000Z",
        ...overrides
      }
    ]
  };
}

function createCastleStatusBytes(overrides: { readonly defenseCount: number }): number[] {
  return [
    ...writeUint32(castleStreamId),
    ...writeUint32(111111111),
    ...writeUint32(0),
    ...writeUint32(0),
    ...writeUint16(overrides.defenseCount),
    ...writeUint16(0),
    0,
    0,
    ...writeUint16(0)
  ];
}

function writeUint32(value: number): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);

  return [...bytes];
}

function writeUint16(value: number): number[] {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);

  return [...bytes];
}
