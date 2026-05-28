import { describe, expect, it } from "vitest";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "../guildBattle/settings";
import { createOwnedCastleViewModels } from "../guildBattle/selectors";
import {
  applyGvgCastleUpdate,
  applyGvgRealtimeMessage,
  applyGvgRealtimeMessages
} from "./realtimeMerge";
import type {
  GvgCastle,
  GvgCastleId,
  GvgCastleUpdate,
  GvgGuildId,
  GvgSnapshot,
  GvgWorldId
} from "./types";

const worldId = "1001" as GvgWorldId;
const ownerGuildId = "111" as GvgGuildId;
const attackerGuildId = "222" as GvgGuildId;

function createCastle(overrides: Partial<GvgCastle> = {}): GvgCastle {
  return {
    castleId: "1" as GvgCastleId,
    worldId,
    state: "idle",
    status: "normal",
    ownerGuildId,
    attackerGuildId: null,
    defenseCount: 30,
    attackCount: 0,
    fallenAt: null,
    lastWinPartyKnockOutCount: 0,
    updatedAt: "2026-05-27T00:00:00.000Z",
    ...overrides
  };
}

function createSnapshot(overrides: Partial<GvgSnapshot> = {}): GvgSnapshot {
  return {
    worldId,
    capturedAt: "2026-05-27T00:00:00.000Z",
    castles: [createCastle()],
    guildNames: {
      [ownerGuildId]: "Owner Guild",
      [attackerGuildId]: "Attack Guild"
    },
    ...overrides
  };
}

function createUpdate(overrides: Partial<GvgCastleUpdate> = {}): GvgCastleUpdate {
  return {
    castleId: "1" as GvgCastleId,
    state: "inBattle",
    ownerGuildId: "333" as GvgGuildId,
    attackerGuildId,
    defenseCount: 12,
    attackCount: 3,
    fallenAt: "2026-05-27T00:05:00.000Z",
    lastWinPartyKnockOutCount: 4,
    updatedAt: "2026-05-27T00:10:00.000Z",
    ...overrides
  };
}

describe("applyGvgCastleUpdate", () => {
  it("updates existing castle fields", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGvgCastleUpdate(snapshot, createUpdate());

    expect(updatedSnapshot.castles[0]).toMatchObject({
      castleId: "1",
      ownerGuildId: "333",
      attackerGuildId: "222",
      defenseCount: 12,
      attackCount: 3,
      state: "inBattle",
      status: "underAttack",
      fallenAt: "2026-05-27T00:05:00.000Z",
      lastWinPartyKnockOutCount: 4,
      updatedAt: "2026-05-27T00:10:00.000Z"
    });
  });

  it("adds unknown castle IDs to tolerate REST and realtime differences", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGvgCastleUpdate(
      snapshot,
      createUpdate({ castleId: "99" as GvgCastleId })
    );

    expect(updatedSnapshot.castles.map((castle) => castle.castleId)).toEqual(["1", "99"]);
    expect(updatedSnapshot.castles[1].worldId).toBe("1001");
  });

  it("keeps guild names and does not mutate the source snapshot", () => {
    const snapshot = createSnapshot();
    const originalCastle = snapshot.castles[0];
    const updatedSnapshot = applyGvgCastleUpdate(snapshot, createUpdate());

    expect(updatedSnapshot.guildNames).toBe(snapshot.guildNames);
    expect(snapshot.castles[0]).toBe(originalCastle);
    expect(snapshot.castles[0].defenseCount).toBe(30);
    expect(updatedSnapshot).not.toBe(snapshot);
    expect(updatedSnapshot.castles).not.toBe(snapshot.castles);
  });
});

describe("applyGvgRealtimeMessage", () => {
  it("applies guild name updates without changing castles", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGvgRealtimeMessage(snapshot, {
      type: "guildNameUpdate",
      receivedAt: "2026-05-27T00:10:00.000Z",
      guild: {
        guildId: "333" as GvgGuildId,
        guildName: "New Guild"
      }
    });

    expect(updatedSnapshot.castles).toBe(snapshot.castles);
    expect(updatedSnapshot.guildNames["333" as GvgGuildId]).toBe("New Guild");
  });

  it("ignores unknown messages", () => {
    const snapshot = createSnapshot();

    expect(
      applyGvgRealtimeMessage(snapshot, {
        type: "unknown",
        receivedAt: "2026-05-27T00:10:00.000Z",
        reason: "unsupported"
      })
    ).toBe(snapshot);
  });

  it("applies multiple updates in order", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGvgRealtimeMessages(snapshot, [
      {
        type: "castleUpdate",
        receivedAt: "2026-05-27T00:10:00.000Z",
        castle: createUpdate({ defenseCount: 20, updatedAt: "2026-05-27T00:10:00.000Z" })
      },
      {
        type: "castleUpdate",
        receivedAt: "2026-05-27T00:11:00.000Z",
        castle: createUpdate({ defenseCount: 8, updatedAt: "2026-05-27T00:11:00.000Z" })
      }
    ]);

    expect(updatedSnapshot.castles[0].defenseCount).toBe(8);
    expect(updatedSnapshot.capturedAt).toBe("2026-05-27T00:11:00.000Z");
  });

  it("keeps Guild Battle selectors usable after merge", () => {
    const snapshot = createSnapshot();
    const updatedSnapshot = applyGvgCastleUpdate(
      snapshot,
      createUpdate({
        ownerGuildId,
        attackerGuildId,
        attackCount: 1
      })
    );
    const viewModels = createOwnedCastleViewModels(updatedSnapshot, {
      ownGuildId: ownerGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    });

    expect(viewModels).toEqual([
      expect.objectContaining({
        castleId: "1",
        attackerGuildName: "Attack Guild",
        alertLevel: "danger",
        statusLabel: "侵攻中"
      })
    ]);
  });
});
