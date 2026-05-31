import { describe, expect, it } from "vitest";
import { buildGvgStreamId } from "../gvg/streamId";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import { applyGrandBattleRealtimePayload } from "./realtimeMerge";
import type { GrandBattleSnapshot } from "./types";

const receivedAt = "2026-05-27T00:20:00.000Z";
const guildA = "111111111050" as GvgGuildId;
const guildB = "222222222050" as GvgGuildId;
const guildC = "333333333050" as GvgGuildId;
const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 12,
  gvgClass: 3,
  worldId: 0
});
const guildStreamId = buildGvgStreamId({
  castleId: 0,
  block: 0,
  worldGroupId: 12,
  gvgClass: 3,
  worldId: 0
});
const unknownStreamId = buildGvgStreamId({
  castleId: 31,
  block: 0,
  worldGroupId: 12,
  gvgClass: 3,
  worldId: 0
});

describe("GrandBattle realtime merge", () => {
  it("applies castle status payloads without mutating the snapshot", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGrandBattleRealtimePayload(
      snapshot,
        createCastleStatusBytes({
        guildId: 333333333,
        attackerGuildId: 222222222,
        defenseCount: 12,
        attackCount: 5,
        rawState: 1,
        lastWinPartyKnockOutCount: 40
      }),
      receivedAt
    );

    expect(updatedSnapshot).not.toBe(snapshot);
    expect(snapshot.castles[0].defenseCount).toBe(120);
    expect(updatedSnapshot.capturedAt).toBe(receivedAt);
    expect(updatedSnapshot.castles[0]).toMatchObject({
      castleId: "1",
      state: "inBattle",
      ownerGuildId: guildC,
      attackerGuildId: guildB,
      defenseCount: 12,
      attackCount: 5,
      fallenAt: null,
      lastWinPartyKnockOutCount: 40,
      updatedAt: receivedAt
    });
  });

  it("updates guild names", () => {
    const updatedSnapshot = applyGrandBattleRealtimePayload(
      createSnapshot(),
      createGuildMessageBytes(333333333, "ギルドC"),
      receivedAt
    );

    expect(updatedSnapshot.guildNames[guildC]).toBe("ギルドC");
    expect(updatedSnapshot.capturedAt).toBe(receivedAt);
  });

  it("keeps unknown payloads from changing the snapshot", () => {
    const snapshot = createSnapshot();

    expect(applyGrandBattleRealtimePayload(snapshot, writeUint32(unknownStreamId, [9, 8, 7]), receivedAt)).toBe(
      snapshot
    );
  });
});

function createSnapshot(): GrandBattleSnapshot {
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
      [guildB]: "ギルドB",
      [guildC]: "ギルドC"
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
        updatedAt: "2026-05-27T00:00:00.000Z"
      }
    ]
  };
}

function createCastleStatusBytes(overrides: {
  readonly guildId: number;
  readonly attackerGuildId: number;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly rawState: number;
  readonly lastWinPartyKnockOutCount: number;
}): number[] {
  return [
    ...writeUint32(castleStreamId),
    ...writeUint32(overrides.guildId),
    ...writeUint32(overrides.attackerGuildId),
    ...writeUint32(0),
    ...writeUint16(overrides.defenseCount),
    ...writeUint16(overrides.attackCount),
    overrides.rawState,
    0,
    ...writeUint16(overrides.lastWinPartyKnockOutCount)
  ];
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
