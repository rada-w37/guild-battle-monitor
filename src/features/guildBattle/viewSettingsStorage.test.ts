import { describe, expect, it } from "vitest";
import {
  getDefaultBattleMonitorViewSettings,
  getDefaultGuildBattleViewSettings,
  GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
  loadBattleMonitorViewSettings,
  loadGuildBattleViewSettings,
  saveBattleMonitorViewSettings,
  saveGuildBattleViewSettings
} from "./viewSettingsStorage";

describe("view settings storage", () => {
  it("loads defaults when storage is empty", () => {
    expect(loadGuildBattleViewSettings(createStorage())).toEqual(getDefaultGuildBattleViewSettings());
    expect(loadBattleMonitorViewSettings(createStorage())).toEqual(getDefaultBattleMonitorViewSettings());
  });

  it("saves and reloads view settings", () => {
    const storage = createStorage();

    saveGuildBattleViewSettings(
      {
        world: "37",
        selectedGuildId: "576802057037",
        sortByAlert: true,
        autoUpdate: false
      },
      storage
    );

    expect(storage.values[GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]).toBe(
      JSON.stringify({
        world: "37",
        selectedGuildId: "576802057037",
        sortByAlert: true,
        autoUpdate: false
      })
    );
    expect(loadGuildBattleViewSettings(storage)).toEqual({
      world: "37",
      selectedGuildId: "576802057037",
      sortByAlert: true,
      autoUpdate: false
    });
  });

  it("loads battle monitor settings from the legacy guild battle key", () => {
    const storage = createStorage({
      [GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]: JSON.stringify({
        world: "37",
        selectedGuildId: "576802057037",
        sortByAlert: true,
        autoUpdate: false
      })
    });

    expect(loadBattleMonitorViewSettings(storage)).toEqual({
      shared: {
        worldInput: "37",
        worldNumber: 37,
        autoUpdate: false,
        sortMode: "alertLevel"
      },
      guildBattle: {
        selectedGuildId: "576802057037"
      }
    });
  });

  it("keeps saving battle monitor settings in the legacy format", () => {
    const storage = createStorage();

    saveBattleMonitorViewSettings(
      {
        shared: {
          worldInput: "37",
          worldNumber: 37,
          autoUpdate: false,
          sortMode: "alertLevel"
        },
        guildBattle: {
          selectedGuildId: "576802057037"
        }
      },
      storage
    );

    expect(storage.values[GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]).toBe(
      JSON.stringify({
        world: "37",
        selectedGuildId: "576802057037",
        sortByAlert: true,
        autoUpdate: false
      })
    );
  });

  it("falls back to defaults when JSON parsing fails", () => {
    const storage = createStorage({
      [GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]: "{not json"
    });

    expect(loadGuildBattleViewSettings(storage)).toEqual(getDefaultGuildBattleViewSettings());
  });

  it("normalizes invalid stored fields without throwing", () => {
    const storage = createStorage({
      [GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]: JSON.stringify({
        world: 37,
        selectedGuildId: null,
        sortByAlert: "yes",
        autoUpdate: "no"
      })
    });

    expect(loadGuildBattleViewSettings(storage)).toEqual({
      world: "",
      selectedGuildId: "",
      sortByAlert: false,
      autoUpdate: true
    });
    expect(loadBattleMonitorViewSettings(storage)).toEqual({
      shared: {
        worldInput: "",
        worldNumber: null,
        autoUpdate: true,
        sortMode: "castleId"
      },
      guildBattle: {
        selectedGuildId: ""
      }
    });
  });

  it("uses null worldNumber for empty or invalid world input", () => {
    expect(
      loadBattleMonitorViewSettings(
        createStorage({
          [GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]: JSON.stringify({
            world: "",
            selectedGuildId: "",
            sortByAlert: false,
            autoUpdate: true
          })
        })
      ).shared.worldNumber
    ).toBeNull();

    expect(
      loadBattleMonitorViewSettings(
        createStorage({
          [GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY]: JSON.stringify({
            world: "abc",
            selectedGuildId: "",
            sortByAlert: false,
            autoUpdate: true
          })
        })
      ).shared.worldNumber
    ).toBeNull();
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
