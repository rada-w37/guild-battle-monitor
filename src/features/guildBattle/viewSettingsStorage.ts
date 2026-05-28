export const GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY = "guild-battle-monitor-view-settings";

export interface GuildBattleViewSettings {
  readonly world: string;
  readonly selectedGuildId: string;
  readonly sortByAlert: boolean;
  readonly autoUpdate: boolean;
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

export function saveGuildBattleViewSettings(
  settings: GuildBattleViewSettings,
  storage: Pick<Storage, "setItem"> = window.localStorage
): void {
  storage.setItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function getDefaultGuildBattleViewSettings(): GuildBattleViewSettings {
  return {
    world: "",
    selectedGuildId: "",
    sortByAlert: false,
    autoUpdate: true
  };
}

function normalizeStoredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
