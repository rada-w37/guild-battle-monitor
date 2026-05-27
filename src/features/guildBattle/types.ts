import type { GvgCastleId, GvgCastleState, GvgGuildId } from "../gvg/types";

export type GuildBattleAlertLevel = "safe" | "warning" | "danger" | "critical";

export interface GuildBattleAlertThresholds {
  readonly warningDefenseCount: number;
  readonly dangerDefenseCount: number;
  readonly criticalStates: readonly GvgCastleState[];
}

export interface GuildBattleMonitorSettings {
  readonly ownGuildId: GvgGuildId;
  readonly alertThresholds: GuildBattleAlertThresholds;
}

export interface GuildBattleOwnedCastleViewModel {
  readonly castleId: GvgCastleId;
  readonly ownerGuildId: GvgGuildId;
  readonly ownerGuildName: string;
  readonly state: GvgCastleState;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly alertLevel: GuildBattleAlertLevel;
}
