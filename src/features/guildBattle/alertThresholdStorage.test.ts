import { describe, expect, it } from "vitest";
import {
  createGuildBattleAlertThresholds,
  getDefaultEditableGuildBattleAlertThresholds,
  GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY,
  loadGuildBattleAlertThresholds,
  saveGuildBattleAlertThresholds,
  validateGuildBattleAlertThresholds
} from "./alertThresholdStorage";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";

describe("alert threshold storage", () => {
  it("loads defaults when storage is empty", () => {
    const storage = createStorage();

    expect(loadGuildBattleAlertThresholds(storage)).toEqual({
      warningDefenseCount: 30,
      dangerDefenseCount: 15,
      criticalDefenseCount: 10
    });
  });

  it("saves and reloads thresholds", () => {
    const storage = createStorage();

    saveGuildBattleAlertThresholds(
      {
        warningDefenseCount: 40,
        dangerDefenseCount: 20,
        criticalDefenseCount: 5
      },
      storage
    );

    expect(storage.values[GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY]).toBe(
      JSON.stringify({
        warningDefenseCount: 40,
        dangerDefenseCount: 20,
        criticalDefenseCount: 5
      })
    );
    expect(loadGuildBattleAlertThresholds(storage)).toEqual({
      warningDefenseCount: 40,
      dangerDefenseCount: 20,
      criticalDefenseCount: 5
    });
  });

  it("falls back to defaults for invalid stored values", () => {
    const storage = createStorage({
      [GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY]: JSON.stringify({
        warningDefenseCount: 10,
        dangerDefenseCount: 20,
        criticalDefenseCount: 5
      })
    });

    expect(loadGuildBattleAlertThresholds(storage)).toEqual(getDefaultEditableGuildBattleAlertThresholds());
  });

  it("validates threshold order", () => {
    expect(
      validateGuildBattleAlertThresholds({
        warningDefenseCount: 30,
        dangerDefenseCount: 15,
        criticalDefenseCount: 10
      }).valid
    ).toBe(true);
    expect(
      validateGuildBattleAlertThresholds({
        warningDefenseCount: 15,
        dangerDefenseCount: 15,
        criticalDefenseCount: 10
      }).valid
    ).toBe(false);
  });

  it("creates selector thresholds with critical states", () => {
    expect(
      createGuildBattleAlertThresholds({
        warningDefenseCount: 40,
        dangerDefenseCount: 20,
        criticalDefenseCount: 5
      })
    ).toEqual({
      warningDefenseCount: 40,
      dangerDefenseCount: 20,
      criticalDefenseCount: 5,
      criticalStates: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS.criticalStates
    });
  });
});

function createStorage(values: Record<string, string> = {}) {
  return {
    values,
    getItem(key: string) {
      return this.values[key] ?? null;
    },
    setItem(key: string, value: string) {
      this.values[key] = value;
    }
  };
}
