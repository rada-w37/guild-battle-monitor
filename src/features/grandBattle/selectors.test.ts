import { describe, expect, it } from "vitest";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import {
  createGrandBattleCastleListViewModels,
  createGrandBattleGuildCandidates
} from "./selectors";
import type { GrandBattleSnapshot } from "./types";

const guildA = "111111111050" as GvgGuildId;
const guildB = "222222222050" as GvgGuildId;

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
    expect(createGrandBattleCastleListViewModels(snapshot, "")).toEqual([
      {
        castleId: "1",
        castleName: "拠点 1",
        ownerGuildName: "ギルドA",
        attackerGuildName: "ギルドB",
        defenseCount: 120,
        attackCount: 5,
        koDisplay: { count: 30, tone: "defense" },
        alertLevel: "safe"
      },
      {
        castleId: "2",
        castleName: "拠点 2",
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
    expect(createGrandBattleCastleListViewModels(snapshot, guildA).map((castle) => castle.castleId)).toEqual(["1"]);
    expect(
      createGrandBattleCastleListViewModels(snapshot, "999999999050" as GvgGuildId).map((castle) => castle.castleId)
    ).toEqual([]);
  });
});
