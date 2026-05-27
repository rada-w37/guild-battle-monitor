import { normalizeGvgGuildIdForComparison } from "../gvg/guildId";
import type { GvgCastle, GvgGuildId, GvgSnapshot } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import type {
  GuildBattleAlertLevel,
  GuildBattleAlertThresholds,
  GuildBattleMonitorSettings,
  GuildBattleOwnedCastleViewModel
} from "./types";

export function isOwnedCastle(castle: GvgCastle, ownGuildId: GvgGuildId): boolean {
  const ownerGuildId = normalizeGvgGuildIdForComparison(castle.ownerGuildId);
  const normalizedOwnGuildId = normalizeGvgGuildIdForComparison(ownGuildId);

  return ownerGuildId !== null && ownerGuildId === normalizedOwnGuildId;
}

export function isCastleUnderAttack(
  castle: GvgCastle,
  thresholds: GuildBattleAlertThresholds = DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
): boolean {
  return castle.attackCount > 0 || thresholds.criticalStates.includes(castle.state);
}

export function isCastleFallen(castle: GvgCastle): boolean {
  return castle.state === "fallen" || castle.status === "fallen";
}

export function getDefenseAlertLevel(
  castle: Pick<GvgCastle, "attackCount" | "defenseCount" | "state">,
  thresholds: GuildBattleAlertThresholds = DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
): GuildBattleAlertLevel {
  if (castle.attackCount > 0 || thresholds.criticalStates.includes(castle.state)) {
    return "critical";
  }

  if (castle.defenseCount <= thresholds.dangerDefenseCount) {
    return "danger";
  }

  if (castle.defenseCount <= thresholds.warningDefenseCount) {
    return "warning";
  }

  return "safe";
}

export function createOwnedCastleViewModels(
  snapshot: GvgSnapshot,
  settings: GuildBattleMonitorSettings
): GuildBattleOwnedCastleViewModel[] {
  return snapshot.castles
    .filter((castle) => isOwnedCastle(castle, settings.ownGuildId))
    .map((castle) => ({
      castleId: castle.castleId,
      ownerGuildId: castle.ownerGuildId as GvgGuildId,
      ownerGuildName: snapshot.guildNames[castle.ownerGuildId as GvgGuildId] ?? "Unknown guild",
      state: castle.state,
      defenseCount: castle.defenseCount,
      attackCount: castle.attackCount,
      alertLevel: getDefenseAlertLevel(castle, settings.alertThresholds)
    }));
}
