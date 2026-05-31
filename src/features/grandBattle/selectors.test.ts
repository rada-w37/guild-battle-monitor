import { describe, expect, it } from "vitest";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import {
  createGrandBattleCastleListViewModels,
  createGrandBattleGuildCandidates
} from "./selectors";
import type { GrandBattleSnapshot } from "./types";

const guildA = "111111111050" as GvgGuildId;
const guildB = "222222222050" as GvgGuildId;
const alertThresholds = {
  warningDefenseCount: 30,
  dangerDefenseCount: 15,
  criticalDefenseCount: 10,
  criticalStates: []
};

const snapshot = {
  source: {
    serverId: "japan",
    worldInput: "50",
    worldNumber: 50,
    classId: 3,
    blockId: 0
  },
  worldGroupId: 12,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [guildA]: "ギルドA",
    [guildB]: "ギルドB"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      state: "idle",
      ownerGuildId: guildA,
      attackerGuildId: guildB,
      defenseCount: 120,
      attackCount: 5,
      fallenAt: null,
      lastWinPartyKnockOutCount: 30,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      state: "idle",
      ownerGuildId: guildB,
      attackerGuildId: null,
      defenseCount: 80,
      attackCount: 0,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    }
  ]
} satisfies GrandBattleSnapshot;

describe("grandBattle selectors", () => {
  it("creates guild candidates in participant order with owned castle counts", () => {
    expect(
      createGrandBattleGuildCandidates(
        [
          { guildId: guildB, guildName: "fallback B" },
          { guildId: guildA, guildName: "fallback A" }
        ],
        snapshot
      )
    ).toEqual([
      { guildId: guildB, guildName: "ギルドB", ownedCastleCount: 1 },
      { guildId: guildA, guildName: "ギルドA", ownedCastleCount: 1 }
    ]);
  });

  it("creates safe battle monitor castle view models", () => {
    expect(createGrandBattleCastleListViewModels(snapshot, "", alertThresholds)).toEqual([
      {
        castleId: "1",
        castleName: "アイン",
        ownerGuildName: "ギルドA",
        attackerGuildName: "ギルドB",
        defenseCount: 120,
        attackCount: 5,
        koDisplay: { count: 30, tone: "defense" },
        alertLevel: "safe"
      },
      {
        castleId: "2",
        castleName: "イエソド",
        ownerGuildName: "ギルドB",
        attackerGuildName: null,
        defenseCount: 80,
        attackCount: 0,
        koDisplay: { count: 0, tone: "none" },
        alertLevel: "safe"
      }
    ]);
  });

  it("filters by selected owner guild without fallback", () => {
    expect(createGrandBattleCastleListViewModels(snapshot, guildA, alertThresholds).map((castle) => castle.castleId)).toEqual(["1"]);
    expect(
      createGrandBattleCastleListViewModels(snapshot, "999999999050" as GvgGuildId, alertThresholds).map((castle) => castle.castleId)
    ).toEqual([]);
  });

  it("falls back to generic castle names for unknown ids", () => {
    const unknownCastleSnapshot = {
      ...snapshot,
      castles: [{ ...snapshot.castles[0], castleId: "999" as GvgCastleId }]
    } satisfies GrandBattleSnapshot;

    expect(createGrandBattleCastleListViewModels(unknownCastleSnapshot, "", alertThresholds)[0].castleName).toBe(
      "拠点 999"
    );
  });

  it("calculates alert levels from shared defense thresholds", () => {
    const lowDefenseSnapshot = {
      ...snapshot,
      castles: [
        { ...snapshot.castles[0], castleId: "1" as GvgCastleId, defenseCount: 29 },
        { ...snapshot.castles[0], castleId: "2" as GvgCastleId, defenseCount: 14 },
        { ...snapshot.castles[0], castleId: "3" as GvgCastleId, defenseCount: 9 },
        { ...snapshot.castles[1], castleId: "4" as GvgCastleId, defenseCount: 0 }
      ]
    } satisfies GrandBattleSnapshot;

    expect(
      createGrandBattleCastleListViewModels(lowDefenseSnapshot, "", alertThresholds).map((castle) => castle.alertLevel)
    ).toEqual(["warning", "danger", "critical", "safe"]);
  });
});
