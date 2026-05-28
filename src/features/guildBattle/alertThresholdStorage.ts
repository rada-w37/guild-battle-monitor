import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import type { GuildBattleAlertThresholds } from "./types";

export const GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY =
  "guild-battle-monitor-alert-thresholds";

export type EditableGuildBattleAlertThresholds = Pick<
  GuildBattleAlertThresholds,
  "warningDefenseCount" | "dangerDefenseCount" | "criticalDefenseCount"
>;

export type AlertThresholdValidationResult =
  | { readonly valid: true; readonly thresholds: EditableGuildBattleAlertThresholds }
  | { readonly valid: false; readonly error: string };

export function createGuildBattleAlertThresholds(
  editableThresholds: EditableGuildBattleAlertThresholds
): GuildBattleAlertThresholds {
  return {
    ...editableThresholds,
    criticalStates: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS.criticalStates
  };
}

export function validateGuildBattleAlertThresholds(
  thresholds: EditableGuildBattleAlertThresholds
): AlertThresholdValidationResult {
  const values = [
    thresholds.warningDefenseCount,
    thresholds.dangerDefenseCount,
    thresholds.criticalDefenseCount
  ];

  if (values.some((value) => !Number.isInteger(value))) {
    return { valid: false, error: "閾値は整数で入力してください。" };
  }

  if (thresholds.criticalDefenseCount < 0) {
    return { valid: false, error: "最優先は0以上にしてください。" };
  }

  if (
    !(
      thresholds.warningDefenseCount > thresholds.dangerDefenseCount &&
      thresholds.dangerDefenseCount > thresholds.criticalDefenseCount
    )
  ) {
    return { valid: false, error: "注意 > 危険 > 最優先 の順にしてください。" };
  }

  return { valid: true, thresholds };
}

export function loadGuildBattleAlertThresholds(
  storage: Pick<Storage, "getItem"> = window.localStorage
): EditableGuildBattleAlertThresholds {
  const storedValue = storage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY);

  if (storedValue === null) {
    return getDefaultEditableGuildBattleAlertThresholds();
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<EditableGuildBattleAlertThresholds>;
    const candidate = {
      warningDefenseCount: Number(parsedValue.warningDefenseCount),
      dangerDefenseCount: Number(parsedValue.dangerDefenseCount),
      criticalDefenseCount: Number(parsedValue.criticalDefenseCount)
    };
    const validation = validateGuildBattleAlertThresholds(candidate);

    return validation.valid ? validation.thresholds : getDefaultEditableGuildBattleAlertThresholds();
  } catch {
    return getDefaultEditableGuildBattleAlertThresholds();
  }
}

export function saveGuildBattleAlertThresholds(
  thresholds: EditableGuildBattleAlertThresholds,
  storage: Pick<Storage, "setItem"> = window.localStorage
): void {
  storage.setItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds));
}

export function getDefaultEditableGuildBattleAlertThresholds(): EditableGuildBattleAlertThresholds {
  return {
    warningDefenseCount: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS.warningDefenseCount,
    dangerDefenseCount: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS.dangerDefenseCount,
    criticalDefenseCount: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS.criticalDefenseCount
  };
}
