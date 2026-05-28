import type { GuildBattleAlertThresholds } from "./types";

export const DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS = {
  warningDefenseCount: 30,
  dangerDefenseCount: 15,
  criticalDefenseCount: 10,
  criticalStates: []
} as const satisfies GuildBattleAlertThresholds;
