import type { GuildBattleAlertThresholds } from "./types";

export const DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS = {
  warningDefenseCount: 30,
  dangerDefenseCount: 10,
  criticalStates: ["inBattle", "fallen", "counterattack"]
} as const satisfies GuildBattleAlertThresholds;
