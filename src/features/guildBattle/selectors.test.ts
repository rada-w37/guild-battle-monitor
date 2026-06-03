import { describe, expect, it } from "vitest";
import type { GvgCastle, GvgCastleId, GvgGuildId, GvgWorldId } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import {
  createAllCastleViewModels,
  createGuildBattleCastleDisplayViewModel,
  createGuildBattleCastleSummaryViewModel,
  createGuildBattleGuildCandidates,
  createOwnedCastleViewModels,
  getDefenseAlertLevel,
  getGuildBattleCastleStatusDisplay,
  isCastleFallen,
  isCastleUnderAttack,
  isOwnedCastle,
  sortGuildBattleCastleViewModels
} from "./selectors";
import type { GuildBattleMonitorSettings } from "./types";

const worldId = "1" as GvgWorldId;
const ownGuildId = "123" as GvgGuildId;
const relationCurrentTime = new Date("2026-05-27T12:29:50.000Z");

function createCastle(overrides: Partial<GvgCastle> = {}): GvgCastle {
  return {
    castleId: "castle-1" as GvgCastleId,
    worldId,
    state: "idle",
    status: "normal",
    ownerGuildId: ownGuildId,
    attackerGuildId: null,
    defenseCount: 31,
    attackCount: 0,
    fallenAt: null,
    lastWinPartyKnockOutCount: 0,
    updatedAt: "2026-05-27T00:00:00.000Z",
    ...overrides
  };
}

describe("guild battle selectors", () => {
  it("detects owned castles using comparison IDs", () => {
    expect(isOwnedCastle(createCastle({ ownerGuildId: "000123" as GvgGuildId }), ownGuildId)).toBe(true);
    expect(isOwnedCastle(createCastle({ ownerGuildId: null }), ownGuildId)).toBe(false);
  });

  it("detects battle states separately from alert", () => {
    expect(isCastleUnderAttack(createCastle({ attackCount: 1 }))).toBe(true);
    expect(isCastleUnderAttack(createCastle({ state: "counterattack" }))).toBe(false);
    expect(isCastleFallen(createCastle({ state: "fallen" }))).toBe(true);
    expect(isCastleFallen(createCastle({ status: "fallen" }))).toBe(true);
  });

  it("calculates alert levels by defense count", () => {
    const attackerGuildId = "789" as GvgGuildId;

    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 31 }))).toBe("safe");
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 29 }))).toBe("warning");
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 14 }))).toBe("danger");
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 9 }))).toBe("critical");
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 31, attackCount: 1 }))).toBe("safe");
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId, defenseCount: 31, state: "inBattle" }))).toBe("safe");
  });

  it("treats castles without declaration as safe even with low defense", () => {
    expect(getDefenseAlertLevel(createCastle({ attackerGuildId: null, attackCount: 0, defenseCount: 1 }))).toBe("safe");
  });

  it("creates owned castle view models only", () => {
    const settings: GuildBattleMonitorSettings = {
      ownGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    };
    const castle = createCastle({
      castleId: "castle-owned" as GvgCastleId,
      ownerGuildId: "000123" as GvgGuildId,
      attackerGuildId: "789" as GvgGuildId,
      attackCount: 1,
      defenseCount: 9
    });

    const viewModels = createOwnedCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [castle, createCastle({ castleId: "castle-other" as GvgCastleId, ownerGuildId: "456" as GvgGuildId })],
        guildNames: {
          [castle.ownerGuildId as GvgGuildId]: "Own Guild",
          ["789" as GvgGuildId]: "Attack Guild"
        }
      },
      settings,
      new Date("2026-05-27T21:00:00.000+09:00")
    );

    expect(viewModels).toEqual([
      {
        castleId: "castle-owned",
        guildRelation: "securedDefense",
        castleName: "拠点 castle-owned",
        castleType: "unknown",
        castleTypeLabel: "不明",
        ownerGuildId: "000123",
        ownerGuildName: "Own Guild",
        attackerGuildId: "789",
        attackerGuildName: "Attack Guild",
        state: "idle",
        statusLabel: "侵攻中",
        statusTone: "battle",
        defenseCount: 9,
        attackCount: 1,
        devDetails: {
          castleId: "castle-owned",
          guildId: "Own Guild（000123）",
          attackerGuildId: "Attack Guild（789）",
          defenseGuildId: "Own Guild（000123）",
          gvgCastleState: "0 (none)",
          utcFallenTimeStamp: "なし"
        },
        isDefenseSecured: false,
        lastWinPartyKnockOutCount: 0,
        koDisplay: {
          count: 0,
          tone: "none"
        },
        alertLevel: "critical"
      }
    ]);
  });

  it("creates all castle view models when own guild is unspecified", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "2" as GvgCastleId, ownerGuildId: "456" as GvgGuildId }),
          createCastle({ castleId: "1" as GvgCastleId, ownerGuildId: ownGuildId })
        ],
        guildNames: {
          [ownGuildId]: "Own Guild",
          ["456" as GvgGuildId]: "Other Guild"
        }
      },
      {
        ownGuildId: "",
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
      }
    );

    expect(display.mode).toBe("allCastles");
    expect(display.reason).toBe("ownGuildUnspecified");
    expect(display.castles).toHaveLength(2);
  });

  it("creates API based DEV details with guild names first", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({
            castleId: "fallen-castle" as GvgCastleId,
            ownerGuildId: ownGuildId,
            attackerGuildId: "789" as GvgGuildId,
            attackCount: 1,
            state: "fallen",
            status: "fallen",
            fallenAt: "2026-05-27T00:05:00.000Z"
          })
        ],
        guildNames: {
          [ownGuildId]: "Own Guild",
          ["789" as GvgGuildId]: "Attack Guild"
        }
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime: new Date("2026-05-27T21:00:00.000+09:00")
      }
    );

    expect(display.castles[0].devDetails).toEqual({
      castleId: "fallen-castle",
      guildId: "Own Guild（123）",
      attackerGuildId: "Attack Guild（789）",
      defenseGuildId: "Own Guild（123）",
      gvgCastleState: "2 (fallen)",
      utcFallenTimeStamp: "2026-05-27T00:05:00.000Z (2026-05-27 00:05:00 UTC)"
    });
  });

  it("uses none and unknown labels in API based DEV details", () => {
    const viewModels = createAllCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({
            castleId: "unknown-guild" as GvgCastleId,
            ownerGuildId: "999" as GvgGuildId,
            attackerGuildId: null,
            state: "counterattack"
          })
        ],
        guildNames: {}
      },
      DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    );

    expect(viewModels[0].devDetails).toEqual({
      castleId: "unknown-guild",
      guildId: "不明（999）",
      attackerGuildId: "なし",
      defenseGuildId: "不明（999）",
      gvgCastleState: "3 (counterattack)",
      utcFallenTimeStamp: "なし"
    });
  });

  it("syncs selected owner relations with GvgCastleState", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "state-0" as GvgCastleId, state: "idle" }),
          createCastle({ castleId: "state-1" as GvgCastleId, state: "inBattle" }),
          createCastle({ castleId: "state-2" as GvgCastleId, defenseCount: 10, state: "fallen" }),
          createCastle({ castleId: "state-2-secured" as GvgCastleId, defenseCount: 11, state: "fallen" }),
          createCastle({ castleId: "state-3" as GvgCastleId, state: "counterattack" }),
          createCastle({ castleId: "state-4" as GvgCastleId, state: "counterattackSuccessful" })
        ],
        guildNames: {
          [ownGuildId]: "Own Guild"
        }
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime: relationCurrentTime
      }
    );

    expect(display.castles.map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["state-0", "securedDefense"],
      ["state-1", "defense"],
      ["state-2", "attack"],
      ["state-2-secured", "attackDisabled"],
      ["state-3", "attack"],
      ["state-4", "securedDefense"]
    ]);
  });

  it("syncs selected attacker relations with GvgCastleState", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "state-0" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, state: "idle" }),
          createCastle({ castleId: "state-1" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, state: "inBattle" }),
          createCastle({ castleId: "state-2" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, defenseCount: 10, state: "fallen" }),
          createCastle({ castleId: "state-2-secured" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, defenseCount: 11, state: "fallen" }),
          createCastle({ castleId: "state-3" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, defenseCount: 10, state: "counterattack" }),
          createCastle({ castleId: "state-3-secured" as GvgCastleId, ownerGuildId: "456" as GvgGuildId, attackerGuildId: ownGuildId, defenseCount: 11, state: "counterattack" }),
          createCastle({
            castleId: "state-4" as GvgCastleId,
            ownerGuildId: "456" as GvgGuildId,
            attackerGuildId: ownGuildId,
            state: "counterattackSuccessful"
          })
        ],
        guildNames: {
          [ownGuildId]: "Own Guild",
          ["456" as GvgGuildId]: "Other Guild"
        }
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime: relationCurrentTime
      }
    );

    expect(display.castles.map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["state-0", "attack"],
      ["state-1", "attack"],
      ["state-2", "defense"],
      ["state-2-secured", "securedDefense"],
      ["state-3", "defense"],
      ["state-3-secured", "securedDefense"],
      ["state-4", "defenseDisabled"]
    ]);
  });

  it("includes selected guild attack castles and prioritizes attack relation", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({
            castleId: "castle-attack" as GvgCastleId,
            ownerGuildId: "456" as GvgGuildId,
            attackerGuildId: ownGuildId
          }),
          createCastle({
            castleId: "castle-conflict" as GvgCastleId,
            ownerGuildId: ownGuildId,
            attackerGuildId: ownGuildId
          }),
          createCastle({ castleId: "castle-other" as GvgCastleId, ownerGuildId: "456" as GvgGuildId })
        ],
        guildNames: {
          [ownGuildId]: "Own Guild",
          ["456" as GvgGuildId]: "Other Guild"
        }
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
      }
    );

    expect(display.mode).toBe("ownedCastles");
    expect(display.castles.map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["castle-attack", "attack"],
      ["castle-conflict", "attack"]
    ]);
  });

  it("marks defense as secured when defense count exceeds battle remaining seconds", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "secured" as GvgCastleId, attackerGuildId: "789" as GvgGuildId, defenseCount: 11 }),
          createCastle({ castleId: "not-secured" as GvgCastleId, attackerGuildId: "789" as GvgGuildId, defenseCount: 10 })
        ],
        guildNames: {}
      },
      {
        ownGuildId: "",
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime: new Date("2026-05-27T21:29:50.000+09:00")
      }
    );

    expect(display.castles.map((castle) => [castle.castleId, castle.isDefenseSecured])).toEqual([
      ["secured", true],
      ["not-secured", false]
    ]);
  });

  it("keeps undeclared defense secured and clears it when declared", () => {
    const currentTime = new Date("2026-05-27T21:29:50.000+09:00");
    const undeclaredDisplay = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [createCastle({ castleId: "castle-1" as GvgCastleId, attackerGuildId: null, defenseCount: 0 })],
        guildNames: {}
      },
      {
        ownGuildId: "",
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime
      }
    );
    const declaredDisplay = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [createCastle({ castleId: "castle-1" as GvgCastleId, attackerGuildId: "789" as GvgGuildId, defenseCount: 10 })],
        guildNames: {}
      },
      {
        ownGuildId: "",
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime
      }
    );

    expect(undeclaredDisplay.castles[0].isDefenseSecured).toBe(true);
    expect(undeclaredDisplay.castles[0].guildRelation).toBe("none");
    expect(declaredDisplay.castles[0].isDefenseSecured).toBe(false);
    expect(declaredDisplay.castles[0].guildRelation).toBe("none");

    const selectedGuildDisplay = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "secured" as GvgCastleId, attackerGuildId: null, defenseCount: 0 }),
          createCastle({ castleId: "zero" as GvgCastleId, attackerGuildId: "0" as GvgGuildId, defenseCount: 0 }),
          createCastle({ castleId: "empty" as GvgCastleId, attackerGuildId: "" as GvgGuildId, defenseCount: 0 }),
          createCastle({ castleId: "defense" as GvgCastleId, attackerGuildId: "789" as GvgGuildId, defenseCount: 10 })
        ],
        guildNames: {}
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS,
        currentTime
      }
    );

    expect(selectedGuildDisplay.castles.map((castle) => [castle.castleId, castle.guildRelation])).toEqual([
      ["secured", "securedDefense"],
      ["zero", "securedDefense"],
      ["empty", "securedDefense"],
      ["defense", "securedDefense"]
    ]);
  });

  it("adds castle metadata to view models", () => {
    const viewModels = createAllCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ castleId: "1" as GvgCastleId }),
          createCastle({ castleId: "99" as GvgCastleId })
        ],
        guildNames: {}
      },
      DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    );

    expect(viewModels[0]).toMatchObject({
      castleId: "1",
      castleName: "ブラッセル",
      castleType: "temple",
      castleTypeLabel: "神殿"
    });
    expect(viewModels[1]).toMatchObject({
      castleId: "99",
      castleName: "拠点 99",
      castleType: "unknown",
      castleTypeLabel: "不明"
    });
  });

  it("falls back to all castles when owned castles are not found", () => {
    const display = createGuildBattleCastleDisplayViewModel(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [createCastle({ ownerGuildId: "456" as GvgGuildId })],
        guildNames: {}
      },
      {
        ownGuildId,
        alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
      }
    );

    expect(display.mode).toBe("allCastles");
    expect(display.reason).toBe("ownedCastlesNotFound");
    expect(display.castles).toHaveLength(1);
  });

  it("sorts by castle ID by default and by alert level on request", () => {
    const attackerGuildId = "789" as GvgGuildId;
    const viewModels = createAllCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ attackerGuildId, castleId: "2" as GvgCastleId, defenseCount: 31 }),
          createCastle({ attackerGuildId, castleId: "1" as GvgCastleId, defenseCount: 9 }),
          createCastle({ attackerGuildId, castleId: "3" as GvgCastleId, defenseCount: 10 })
        ],
        guildNames: {}
      },
      DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    );

    expect(sortGuildBattleCastleViewModels(viewModels, "castleId").map((viewModel) => viewModel.castleId)).toEqual([
      "1",
      "2",
      "3"
    ]);
    expect(sortGuildBattleCastleViewModels(viewModels, "alertLevel").map((viewModel) => viewModel.castleId)).toEqual([
      "1",
      "3",
      "2"
    ]);
  });

  it("creates summary counts", () => {
    const attackerGuildId = "789" as GvgGuildId;
    const viewModels = createAllCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [
          createCastle({ attackerGuildId, defenseCount: 31 }),
          createCastle({ attackerGuildId, defenseCount: 29 }),
          createCastle({ attackerGuildId, defenseCount: 14 }),
          createCastle({ attackerGuildId, defenseCount: 9 })
        ],
        guildNames: {}
      },
      DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    );

    expect(createGuildBattleCastleSummaryViewModel(viewModels, "allCastles")).toEqual({
      totalCount: 4,
      safeCount: 1,
      warningCount: 1,
      dangerCount: 1,
      criticalCount: 1,
      mode: "allCastles"
    });
  });

  it("creates guild candidates from castle owners", () => {
    const candidates = createGuildBattleGuildCandidates({
      worldId,
      capturedAt: "2026-05-27T00:00:00.000Z",
      castles: [
        createCastle({ ownerGuildId: "456" as GvgGuildId }),
        createCastle({ castleId: "castle-2" as GvgCastleId, ownerGuildId: ownGuildId }),
        createCastle({ castleId: "castle-3" as GvgCastleId, ownerGuildId: ownGuildId }),
        createCastle({ castleId: "castle-empty" as GvgCastleId, ownerGuildId: null })
      ],
      guildNames: {
        [ownGuildId]: "Own Guild"
      }
    });

    expect(candidates).toEqual([
      {
        guildId: ownGuildId,
        guildName: "Own Guild",
        ownedCastleCount: 2
      },
      {
        guildId: "456",
        guildName: "Guild 456",
        ownedCastleCount: 1
      }
    ]);
  });

  it("creates Japanese battle state display labels", () => {
    expect(getGuildBattleCastleStatusDisplay(createCastle()).statusLabel).toBe("通常");
    expect(getGuildBattleCastleStatusDisplay(createCastle({ attackCount: 1 })).statusLabel).toBe("侵攻中");
    expect(getGuildBattleCastleStatusDisplay(createCastle({ state: "fallen" })).statusLabel).toBe("占拠");
    expect(getGuildBattleCastleStatusDisplay(createCastle({ state: "counterattack" })).statusLabel).toBe("反撃待ち");
    expect(getGuildBattleCastleStatusDisplay(createCastle({ state: "counterattackSuccessful" })).statusLabel).toBe(
      "反撃中"
    );
  });

  it("keeps unknown battle state display safe", () => {
    expect(getGuildBattleCastleStatusDisplay(createCastle({ state: "unknown" }))).toEqual({
      statusLabel: "不明",
      statusTone: "unknown"
    });
  });

  it("keeps alert level and battle state display separate", () => {
    const castle = createCastle({ defenseCount: 31, attackCount: 1, state: "inBattle", status: "underAttack" });

    expect(getDefenseAlertLevel(castle)).toBe("safe");
    expect(getGuildBattleCastleStatusDisplay(castle)).toEqual({
      statusLabel: "侵攻中",
      statusTone: "battle"
    });
  });
});
