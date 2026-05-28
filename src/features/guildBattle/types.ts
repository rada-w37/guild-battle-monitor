import type { GvgCastleId, GvgCastleState, GvgGuildId } from "../gvg/types";
import type { GuildBattleCastleType } from "./castleMetadata";

export type GuildBattleAlertLevel = "safe" | "warning" | "danger" | "critical";

export type GuildBattleCastleStatusTone =
  | "normal"
  | "battle"
  | "fallen"
  | "counterattack"
  | "unknown";

export interface GuildBattleAlertThresholds {
  readonly warningDefenseCount: number;
  readonly dangerDefenseCount: number;
  readonly criticalDefenseCount: number;
  readonly criticalStates: readonly GvgCastleState[];
}

export interface GuildBattleMonitorSettings {
  readonly ownGuildId: GvgGuildId;
  readonly alertThresholds: GuildBattleAlertThresholds;
}

export type GuildBattleCastleDisplayMode = "allCastles" | "ownedCastles";

export type GuildBattleCastleDisplayReason = "ownGuildUnspecified" | "ownedCastlesFound" | "ownedCastlesNotFound";

export type GuildBattleCastleListSortMode = "castleId" | "alertLevel";

export interface GuildBattleCastleViewModel {
  readonly castleId: GvgCastleId;
  readonly castleName: string;
  readonly castleType: GuildBattleCastleType | "unknown";
  readonly castleTypeLabel: string;
  readonly ownerGuildId: GvgGuildId | null;
  readonly ownerGuildName: string;
  readonly attackerGuildId: GvgGuildId | null;
  readonly attackerGuildName: string | null;
  readonly state: GvgCastleState;
  readonly statusLabel: string;
  readonly statusTone: GuildBattleCastleStatusTone;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly alertLevel: GuildBattleAlertLevel;
}

export type GuildBattleOwnedCastleViewModel = GuildBattleCastleViewModel;

export interface GuildBattleCastleDisplayViewModel {
  readonly mode: GuildBattleCastleDisplayMode;
  readonly reason: GuildBattleCastleDisplayReason;
  readonly castles: readonly GuildBattleCastleViewModel[];
}

export interface GuildBattleCastleSummaryViewModel {
  readonly totalCount: number;
  readonly safeCount: number;
  readonly warningCount: number;
  readonly dangerCount: number;
  readonly criticalCount: number;
  readonly mode: GuildBattleCastleDisplayMode;
}

export interface GuildBattleGuildCandidateViewModel {
  readonly guildId: GvgGuildId;
  readonly guildName: string;
  readonly ownedCastleCount: number;
}
