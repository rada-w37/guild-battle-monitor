import { describe, expect, it } from "vitest";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "../guildBattle/settings";
import { createOwnedCastleViewModels } from "../guildBattle/selectors";
import { MockGvgRealtimeClient } from "./mockRealtimeClient";
import { processRealtimePayload } from "./realtimeIntegrationService";
import { buildGvgStreamId } from "./streamId";
import type { GvgCastle, GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "./types";

const receivedAt = "2026-05-27T00:10:00.000Z";
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

describe("processRealtimePayload", () => {
  it("updates defense count and alert level through the full realtime flow", () => {
    const initialSnapshot = createSnapshot({ defenseCount: 30, attackCount: 0 });
    const result = processRealtimePayload(
      initialSnapshot,
      createCastleStatusBytes({ defenseCount: 12, attackCount: 0 }),
      receivedAt
    );
    const viewModels = createOwnedCastleViewModels(result.snapshot, createSettings());

    expect(result.parserResult.status).toBe("ok");
    expect(result.snapshot.castles[0].defenseCount).toBe(12);
    expect(viewModels[0].defenseCount).toBe(12);
    expect(viewModels[0].alertLevel).toBe("danger");
  });

  it("updates attack count without changing defense-based alert", () => {
    const result = processRealtimePayload(
      createSnapshot({ defenseCount: 30, attackCount: 0 }),
      createCastleStatusBytes({ defenseCount: 30, attackCount: 3, rawState: 1 }),
      receivedAt
    );
    const viewModels = createOwnedCastleViewModels(result.snapshot, createSettings());

    expect(result.snapshot.castles[0].attackCount).toBe(3);
    expect(viewModels[0].alertLevel).toBe("safe");
    expect(viewModels[0].statusLabel).toBe("侵攻中");
  });

  it("removes a castle from owned view models after ownership changes", () => {
    const result = processRealtimePayload(
      createSnapshot({ ownerGuildId: ownGuildId }),
      createCastleStatusBytes({ guildId: 123456789, attackCount: 0 }),
      receivedAt
    );
    const viewModels = createOwnedCastleViewModels(result.snapshot, createSettings());

    expect(result.snapshot.castles[0].ownerGuildId).toBe(enemyGuildId);
    expect(viewModels).toEqual([]);
  });

  it("applies guild name update for attacker name resolution", () => {
    const payload = [
      ...createGuildMessageBytes(123456789, "Attack Guild"),
      ...createCastleStatusBytes({ attackerGuildId: 123456789, attackCount: 1 })
    ];
    const result = processRealtimePayload(createSnapshot(), payload, receivedAt);
    const viewModels = createOwnedCastleViewModels(result.snapshot, createSettings());

    expect(result.snapshot.guildNames[enemyGuildId]).toBe("Attack Guild");
    expect(viewModels[0].attackerGuildName).toBe("Attack Guild");
  });

  it("keeps unknown payloads from breaking or mutating the snapshot", () => {
    const initialSnapshot = createSnapshot();
    const result = processRealtimePayload(
      initialSnapshot,
      writeUint32(unknownStreamId, [9, 8, 7]),
      receivedAt
    );

    expect(result.parserResult.status).toBe("ok");
    expect(result.messages).toEqual([
      {
        type: "unknown",
        receivedAt,
        reason: "unknown castle ID in stream ID: 31"
      }
    ]);
    expect(result.snapshot).toBe(initialSnapshot);
    expect(initialSnapshot.castles[0].defenseCount).toBe(30);
  });

  it("can be driven by the mock realtime client payload event", () => {
    const client = new MockGvgRealtimeClient();
    const initialSnapshot = createSnapshot();
    let updatedSnapshot = initialSnapshot;

    client.addEventListener((event) => {
      if (event.type === "payloadReceived") {
        updatedSnapshot = processRealtimePayload(updatedSnapshot, event.payload, receivedAt).snapshot;
      }
    });

    client.emitPayload(createCastleStatusBytes({ defenseCount: 12 }));

    expect(updatedSnapshot.castles[0].defenseCount).toBe(12);
    expect(initialSnapshot.castles[0].defenseCount).toBe(30);
  });
});

function createSettings() {
  return {
    ownGuildId,
    alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
  };
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
