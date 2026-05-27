import { describe, expect, it } from "vitest";
import type { GvgCastle, GvgCastleId, GvgGuildId, GvgWorldId } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import {
  createOwnedCastleViewModels,
  getDefenseAlertLevel,
  isCastleFallen,
  isCastleUnderAttack,
  isOwnedCastle
} from "./selectors";
import type { GuildBattleMonitorSettings } from "./types";

const worldId = "1" as GvgWorldId;
const ownGuildId = "123" as GvgGuildId;

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
    ...overrides
  };
}

describe("guild battle selectors", () => {
  it("detects owned castles using comparison IDs", () => {
    const castle = createCastle({ ownerGuildId: "000123" as GvgGuildId });

    expect(isOwnedCastle(castle, ownGuildId)).toBe(true);
  });

  it("does not treat unowned castles as owned", () => {
    const castle = createCastle({ ownerGuildId: null });

    expect(isOwnedCastle(castle, ownGuildId)).toBe(false);
  });

  it("detects castles under attack by attack count or critical state", () => {
    expect(isCastleUnderAttack(createCastle({ attackCount: 1 }))).toBe(true);
    expect(isCastleUnderAttack(createCastle({ state: "counterattack" }))).toBe(true);
  });

  it("detects fallen castles by state or status", () => {
    expect(isCastleFallen(createCastle({ state: "fallen" }))).toBe(true);
    expect(isCastleFallen(createCastle({ status: "fallen" }))).toBe(true);
  });

  it("calculates alert levels with critical priority", () => {
    expect(getDefenseAlertLevel(createCastle({ defenseCount: 31 }))).toBe("safe");
    expect(getDefenseAlertLevel(createCastle({ defenseCount: 30 }))).toBe("warning");
    expect(getDefenseAlertLevel(createCastle({ defenseCount: 10 }))).toBe("danger");
    expect(getDefenseAlertLevel(createCastle({ defenseCount: 31, attackCount: 1 }))).toBe(
      "critical"
    );
    expect(getDefenseAlertLevel(createCastle({ defenseCount: 31, state: "inBattle" }))).toBe(
      "critical"
    );
  });

  it("creates owned castle view models only", () => {
    const settings: GuildBattleMonitorSettings = {
      ownGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    };
    const castle = createCastle({
      castleId: "castle-owned" as GvgCastleId,
      ownerGuildId: "000123" as GvgGuildId,
      defenseCount: 9
    });

    const viewModels = createOwnedCastleViewModels(
      {
        worldId,
        capturedAt: "2026-05-27T00:00:00.000Z",
        castles: [castle, createCastle({ castleId: "castle-other" as GvgCastleId, ownerGuildId: "456" as GvgGuildId })],
        guildNames: {
          [castle.ownerGuildId as GvgGuildId]: "Own Guild"
        }
      },
      settings
    );

    expect(viewModels).toEqual([
      {
        castleId: "castle-owned",
        ownerGuildId: "000123",
        ownerGuildName: "Own Guild",
        state: "idle",
        defenseCount: 9,
        attackCount: 0,
        alertLevel: "danger"
      }
    ]);
  });
});
