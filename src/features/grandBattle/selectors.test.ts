import { describe, expect, it } from "vitest";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import {
  createGrandBattleCastleListViewModels,
  createGrandBattleGuildCandidates
} from "./selectors";
import type { GrandBattleSnapshot } from "./types";

const guildA = "111111111050" as GvgGuildId;
const guildAAlternateId = "111111111037" as GvgGuildId;
const guildB = "222222222050" as GvgGuildId;
const relationCurrentTime = new Date("2026-05-27T12:29:50.000Z");
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
    expect(
      createGrandBattleCastleListViewModels(
        snapshot,
        "",
        alertThresholds,
        new Date("2026-05-27T21:00:00.000+09:00")
      )
    ).toEqual([
      {
        castleId: "1",
        guildRelation: "none",
        castleName: "アイン",
        ownerGuildName: "ギルドA",
        attackerGuildName: "ギルドB",
        defenseCount: 120,
        attackCount: 5,
        devDetails: {
          castleId: "1",
          guildId: "ギルドA（111111111050）",
          attackerGuildId: "ギルドB（222222222050）",
          defenseGuildId: "ギルドA（111111111050）",
          gvgCastleState: "0 (none)",
          utcFallenTimeStamp: "なし"
        },
        isDefenseSecured: false,
        koDisplay: { count: 30, tone: "defense" },
        alertLevel: "safe"
      },
      {
        castleId: "2",
        guildRelation: "none",
        castleName: "イエソド",
        ownerGuildName: "ギルドB",
        attackerGuildName: null,
        defenseCount: 80,
        attackCount: 0,
        devDetails: {
          castleId: "2",
          guildId: "ギルドB（222222222050）",
          attackerGuildId: "なし",
          defenseGuildId: "ギルドB（222222222050）",
          gvgCastleState: "0 (none)",
          utcFallenTimeStamp: "なし"
        },
        isDefenseSecured: true,
        koDisplay: { count: 0, tone: "none" },
        alertLevel: "safe"
      }
    ]);
  });

  it("filters by selected owner guild without fallback", () => {
    expect(createGrandBattleCastleListViewModels(snapshot, guildA, alertThresholds).map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["1", "defense"]
    ]);
    expect(createGrandBattleCastleListViewModels(snapshot, guildB, alertThresholds).map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["1", "attack"],
      ["2", "defense"]
    ]);
    expect(
      createGrandBattleCastleListViewModels(snapshot, "999999999050" as GvgGuildId, alertThresholds).map((castle) => castle.castleId)
    ).toEqual([]);
  });

  it("keeps Grand Battle castles related by guild name when display IDs differ", () => {
    const sameNameSnapshot = {
      ...snapshot,
      guildNames: {
        ...snapshot.guildNames,
        [guildA]: "Fuwa Fuwa Gorilla",
        [guildAAlternateId]: "Fuwa Fuwa Gorilla"
      },
      castles: [
        {
          ...snapshot.castles[0],
          castleId: "1" as GvgCastleId,
          state: "idle",
          ownerGuildId: guildAAlternateId,
          attackerGuildId: null
        },
        {
          ...snapshot.castles[0],
          castleId: "5" as GvgCastleId,
          state: "inBattle",
          ownerGuildId: guildB,
          attackerGuildId: guildAAlternateId
        },
        {
          ...snapshot.castles[0],
          castleId: "6" as GvgCastleId,
          state: "idle",
          ownerGuildId: guildB,
          attackerGuildId: null
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(
      createGrandBattleGuildCandidates([{ guildId: guildA, guildName: "Fuwa Fuwa Gorilla" }], sameNameSnapshot)
    ).toEqual([{ guildId: guildA, guildName: "Fuwa Fuwa Gorilla", ownedCastleCount: 1 }]);
    expect(
      createGrandBattleCastleListViewModels(
        sameNameSnapshot,
        guildA,
        alertThresholds,
        relationCurrentTime,
        "Fuwa Fuwa Gorilla"
      ).map((castle) => [castle.castleId, castle.guildRelation])
    ).toEqual([
      ["1", "defense"],
      ["5", "attack"]
    ]);
  });

  it("keeps Grand Battle relations stable when only realtime counts and KO change", () => {
    const countBaseSnapshot = {
      ...snapshot,
      guildNames: {
        ...snapshot.guildNames,
        [guildA]: "Fuwa Fuwa Gorilla",
        [guildAAlternateId]: "Fuwa Fuwa Gorilla"
      },
      castles: [
        {
          ...snapshot.castles[0],
          castleId: "1" as GvgCastleId,
          state: "fallen",
          ownerGuildId: guildAAlternateId,
          attackerGuildId: guildB,
          defenseCount: 1,
          attackCount: 0,
          lastWinPartyKnockOutCount: 4
        },
        {
          ...snapshot.castles[0],
          castleId: "5" as GvgCastleId,
          state: "counterattack",
          ownerGuildId: guildB,
          attackerGuildId: guildAAlternateId,
          defenseCount: 2,
          attackCount: 3,
          lastWinPartyKnockOutCount: 9
        }
      ]
    } satisfies GrandBattleSnapshot;
    const countUpdatedSnapshot = {
      ...countBaseSnapshot,
      castles: countBaseSnapshot.castles.map((castle) => ({
        ...castle,
        defenseCount: castle.defenseCount + 80,
        attackCount: castle.attackCount + 12,
        lastWinPartyKnockOutCount: castle.lastWinPartyKnockOutCount + 50
      }))
    } satisfies GrandBattleSnapshot;

    const createRelations = (targetSnapshot: GrandBattleSnapshot) =>
      createGrandBattleCastleListViewModels(
        targetSnapshot,
        guildA,
        alertThresholds,
        relationCurrentTime,
        "Fuwa Fuwa Gorilla"
      ).map((castle) => [castle.castleId, castle.guildRelation]);

    expect(createRelations(countBaseSnapshot)).toEqual([
      ["1", "attack"],
      ["5", "attack"]
    ]);
    expect(createRelations(countUpdatedSnapshot)).toEqual(createRelations(countBaseSnapshot));
  });

  it("keeps same-name fallback after fallen display side swap", () => {
    const sameNameFallenSnapshot = {
      ...snapshot,
      guildNames: {
        ...snapshot.guildNames,
        [guildA]: "Fuwa Fuwa Gorilla",
        [guildAAlternateId]: "Fuwa Fuwa Gorilla"
      },
      castles: [
        {
          ...snapshot.castles[0],
          state: "fallen",
          ownerGuildId: guildAAlternateId,
          attackerGuildId: guildB
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(
      createGrandBattleCastleListViewModels(
        sameNameFallenSnapshot,
        guildA,
        alertThresholds,
        relationCurrentTime,
        "Fuwa Fuwa Gorilla"
      ).map((castle) => [castle.castleId, castle.guildRelation, castle.attackerGuildName])
    ).toEqual([["1", "attack", "Fuwa Fuwa Gorilla"]]);
  });

  it("prioritizes owner matches over attacker matches including same-name fallback", () => {
    const conflictSnapshot = {
      ...snapshot,
      guildNames: {
        ...snapshot.guildNames,
        [guildA]: "Fuwa Fuwa Gorilla",
        [guildAAlternateId]: "Fuwa Fuwa Gorilla"
      },
      castles: [
        {
          ...snapshot.castles[0],
          ownerGuildId: guildAAlternateId,
          attackerGuildId: guildA,
          defenseCount: 1,
          attackCount: 10
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(
      createGrandBattleCastleListViewModels(
        conflictSnapshot,
        guildA,
        alertThresholds,
        relationCurrentTime,
        "Fuwa Fuwa Gorilla"
      ).map((castle) => [castle.castleId, castle.guildRelation])
    ).toEqual([["1", "defense"]]);
  });

  it("creates API based DEV details using resolved guild names", () => {
    expect(createGrandBattleCastleListViewModels(snapshot, guildB, alertThresholds)[0].devDetails).toEqual({
      castleId: "1",
      guildId: "ギルドA（111111111050）",
      attackerGuildId: "ギルドB（222222222050）",
      defenseGuildId: "ギルドA（111111111050）",
      gvgCastleState: "0 (none)",
      utcFallenTimeStamp: "なし"
    });
  });

  it("creates API based DEV details with fallen timestamp and unknown guild names", () => {
    const fallenSnapshot = {
      ...snapshot,
      guildNames: {},
      castles: [
        {
          ...snapshot.castles[0],
          state: "fallen",
          ownerGuildId: guildA,
          attackerGuildId: null,
          fallenAt: "2026-05-27T00:05:00.000Z"
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(createGrandBattleCastleListViewModels(fallenSnapshot, "", alertThresholds)[0].devDetails).toEqual({
      castleId: "1",
      guildId: "不明（111111111050）",
      attackerGuildId: "なし",
      defenseGuildId: "不明（111111111050）",
      gvgCastleState: "2 (fallen)",
      utcFallenTimeStamp: "2026-05-27T00:05:00.000Z (2026-05-27 00:05:00 UTC)"
    });
  });

  it("swaps selected owner relation only for fallen castles", () => {
    const stateSnapshot = {
      ...snapshot,
      castles: [
        { ...snapshot.castles[0], castleId: "state-0" as GvgCastleId, state: "idle", ownerGuildId: guildA, attackerGuildId: null },
        { ...snapshot.castles[0], castleId: "state-1" as GvgCastleId, state: "inBattle", ownerGuildId: guildA, attackerGuildId: null },
        { ...snapshot.castles[0], castleId: "state-2" as GvgCastleId, defenseCount: 10, state: "fallen", ownerGuildId: guildA, attackerGuildId: null },
        { ...snapshot.castles[0], castleId: "state-2-secured" as GvgCastleId, defenseCount: 11, state: "fallen", ownerGuildId: guildA, attackerGuildId: null },
        { ...snapshot.castles[0], castleId: "state-3" as GvgCastleId, state: "counterattack", ownerGuildId: guildA, attackerGuildId: null },
        {
          ...snapshot.castles[0],
          castleId: "state-4" as GvgCastleId,
          state: "counterattackSuccessful",
          ownerGuildId: guildA,
          attackerGuildId: null
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(createGrandBattleCastleListViewModels(stateSnapshot, guildA, alertThresholds, relationCurrentTime).map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["state-0", "defense"],
      ["state-1", "defense"],
      ["state-2", "attack"],
      ["state-2-secured", "attack"],
      ["state-3", "defense"],
      ["state-4", "defense"]
    ]);
  });

  it("swaps selected attacker relation only for fallen castles", () => {
    const stateSnapshot = {
      ...snapshot,
      castles: [
        { ...snapshot.castles[0], castleId: "state-0" as GvgCastleId, state: "idle", ownerGuildId: guildA, attackerGuildId: guildB },
        { ...snapshot.castles[0], castleId: "state-1" as GvgCastleId, state: "inBattle", ownerGuildId: guildA, attackerGuildId: guildB },
        { ...snapshot.castles[0], castleId: "state-2" as GvgCastleId, defenseCount: 10, state: "fallen", ownerGuildId: guildA, attackerGuildId: guildB },
        { ...snapshot.castles[0], castleId: "state-2-secured" as GvgCastleId, defenseCount: 11, state: "fallen", ownerGuildId: guildA, attackerGuildId: guildB },
        { ...snapshot.castles[0], castleId: "state-3" as GvgCastleId, defenseCount: 10, state: "counterattack", ownerGuildId: guildA, attackerGuildId: guildB },
        { ...snapshot.castles[0], castleId: "state-3-secured" as GvgCastleId, defenseCount: 11, state: "counterattack", ownerGuildId: guildA, attackerGuildId: guildB },
        {
          ...snapshot.castles[0],
          castleId: "state-4" as GvgCastleId,
          state: "counterattackSuccessful",
          ownerGuildId: guildA,
          attackerGuildId: guildB
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(createGrandBattleCastleListViewModels(stateSnapshot, guildB, alertThresholds, relationCurrentTime).map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["state-0", "attack"],
      ["state-1", "attack"],
      ["state-2", "defense"],
      ["state-2-secured", "defense"],
      ["state-3", "attack"],
      ["state-3-secured", "attack"],
      ["state-4", "attack"]
    ]);
  });

  it("uses display attack guild name for fallen castles while keeping raw dev details", () => {
    const fallenSnapshot = {
      ...snapshot,
      castles: [
        {
          ...snapshot.castles[0],
          state: "fallen",
          ownerGuildId: guildA,
          attackerGuildId: guildB,
          fallenAt: "2026-05-27T00:05:00.000Z"
        }
      ]
    } satisfies GrandBattleSnapshot;

    const ownerDisplay = createGrandBattleCastleListViewModels(
      fallenSnapshot,
      guildA,
      alertThresholds,
      relationCurrentTime
    )[0];
    const attackerDisplay = createGrandBattleCastleListViewModels(
      fallenSnapshot,
      guildB,
      alertThresholds,
      relationCurrentTime
    )[0];

    expect(ownerDisplay.guildRelation).toBe("attack");
    expect(attackerDisplay.guildRelation).toBe("defense");
    expect(ownerDisplay.attackerGuildName).toBe("ギルドA");
    expect(ownerDisplay.devDetails).toEqual({
      castleId: "1",
      guildId: "ギルドA（111111111050）",
      attackerGuildId: "ギルドB（222222222050）",
      defenseGuildId: "ギルドA（111111111050）",
      gvgCastleState: "2 (fallen)",
      utcFallenTimeStamp: "2026-05-27T00:05:00.000Z (2026-05-27 00:05:00 UTC)"
    });
  });

  it("prioritizes owner relation and marks defense secured", () => {
    const conflictSnapshot = {
      ...snapshot,
      castles: [
        {
          ...snapshot.castles[0],
          ownerGuildId: guildA,
          attackerGuildId: guildA,
          defenseCount: 11
        },
        {
          ...snapshot.castles[1],
          ownerGuildId: guildA,
          attackerGuildId: guildB,
          defenseCount: 10
        }
      ]
    } satisfies GrandBattleSnapshot;

    expect(
      createGrandBattleCastleListViewModels(
        conflictSnapshot,
        guildA,
        alertThresholds,
        new Date("2026-05-27T21:29:50.000+09:00")
      ).map((castle) => [castle.castleId, castle.guildRelation, castle.isDefenseSecured])
    ).toEqual([
      ["1", "defense", true],
      ["2", "defense", false]
    ]);
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
