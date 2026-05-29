export const GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY = "guild-battle-monitor-view-settings";

export interface GuildBattleViewSettings {
  readonly world: string;
  readonly selectedGuildId: string;
  readonly sortByAlert: boolean;
  readonly autoUpdate: boolean;
}

export type BattleMonitorCastleListSortMode = "castleId" | "alertLevel";

export interface BattleMonitorSharedViewSettings {
  readonly worldInput: string;
  readonly worldNumber: number | null;
  readonly autoUpdate: boolean;
  readonly sortMode: BattleMonitorCastleListSortMode;
}

export interface BattleMonitorViewSettings {
  readonly shared: BattleMonitorSharedViewSettings;
  readonly guildBattle: {
    readonly selectedGuildId: string;
  };
}

export function loadGuildBattleViewSettings(
  storage: Pick<Storage, "getItem"> = window.localStorage
): GuildBattleViewSettings {
  const storedValue = storage.getItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY);

  if (storedValue === null) {
    return getDefaultGuildBattleViewSettings();
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<GuildBattleViewSettings>;

    return {
      world: normalizeStoredString(parsedValue.world),
      selectedGuildId: normalizeStoredString(parsedValue.selectedGuildId),
      sortByAlert: parsedValue.sortByAlert === true,
      autoUpdate: parsedValue.autoUpdate === false ? false : true
    };
  } catch {
    return getDefaultGuildBattleViewSettings();
  }
}

export function loadBattleMonitorViewSettings(
  storage: Pick<Storage, "getItem"> = window.localStorage
): BattleMonitorViewSettings {
  const guildBattleSettings = loadGuildBattleViewSettings(storage);

  return {
    shared: {
      worldInput: guildBattleSettings.world,
      worldNumber: parseWorldNumber(guildBattleSettings.world),
      autoUpdate: guildBattleSettings.autoUpdate,
      sortMode: guildBattleSettings.sortByAlert ? "alertLevel" : "castleId"
    },
    guildBattle: {
      selectedGuildId: guildBattleSettings.selectedGuildId
    }
  };
}

export function saveGuildBattleViewSettings(
  settings: GuildBattleViewSettings,
  storage: Pick<Storage, "setItem"> = window.localStorage
): void {
  storage.setItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function saveBattleMonitorViewSettings(
  settings: BattleMonitorViewSettings,
  storage: Pick<Storage, "setItem"> = window.localStorage
): void {
  saveGuildBattleViewSettings(
    {
      world: settings.shared.worldInput,
      selectedGuildId: settings.guildBattle.selectedGuildId,
      sortByAlert: settings.shared.sortMode === "alertLevel",
      autoUpdate: settings.shared.autoUpdate
    },
    storage
  );
}

export function getDefaultGuildBattleViewSettings(): GuildBattleViewSettings {
  return {
    world: "",
    selectedGuildId: "",
    sortByAlert: false,
    autoUpdate: true
  };
}

export function getDefaultBattleMonitorViewSettings(): BattleMonitorViewSettings {
  return loadBattleMonitorViewSettings({
    getItem: () => null
  });
}

function normalizeStoredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseWorldNumber(worldInput: string): number | null {
  const trimmedWorld = worldInput.trim();

  if (trimmedWorld.length === 0 || !/^\d+$/.test(trimmedWorld)) {
    return null;
  }

  const worldNumber = Number(trimmedWorld);

  return Number.isSafeInteger(worldNumber) && worldNumber > 0 ? worldNumber : null;
}
