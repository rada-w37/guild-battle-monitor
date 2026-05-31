import type {
  BattleMonitorCastleViewModel,
  BattleMonitorGuildCandidateViewModel
} from "../battleMonitor/types";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import type { GuildBattleAlertLevel, GuildBattleAlertThresholds } from "../guildBattle/types";
import type {
  GrandBattleCastle,
  GrandBattleParticipantGuildCandidate,
  GrandBattleSnapshot
} from "./types";

export function createGrandBattleGuildCandidates(
  participants: readonly GrandBattleParticipantGuildCandidate[],
  snapshot: GrandBattleSnapshot
): BattleMonitorGuildCandidateViewModel<GvgGuildId>[] {
  return participants.map((participant) => ({
    guildId: participant.guildId,
    guildName: snapshot.guildNames[participant.guildId] ?? participant.guildName,
    ownedCastleCount: snapshot.castles.filter((castle) => castle.ownerGuildId === participant.guildId).length
  }));
}

export function createGrandBattleCastleListViewModels(
  snapshot: GrandBattleSnapshot,
  selectedGuildId: GvgGuildId | "",
  alertThresholds: GuildBattleAlertThresholds
): BattleMonitorCastleViewModel<GvgCastleId>[] {
  return snapshot.castles
    .filter((castle) => selectedGuildId.length === 0 || castle.ownerGuildId === selectedGuildId)
    .map((castle) => ({
      castleId: castle.castleId,
      castleName: `拠点 ${castle.castleId}`,
      ownerGuildName: castle.ownerGuildId === null ? "Unknown guild" : snapshot.guildNames[castle.ownerGuildId] ?? "Unknown guild",
      attackerGuildName:
        castle.attackerGuildId === null ? null : snapshot.guildNames[castle.attackerGuildId] ?? null,
      defenseCount: castle.defenseCount,
      attackCount: castle.attackCount,
      koDisplay: {
        count: castle.lastWinPartyKnockOutCount,
        tone: castle.lastWinPartyKnockOutCount > 0 ? "defense" : "none"
      },
      alertLevel: getGrandBattleDefenseAlertLevel(castle, alertThresholds)
    }));
}

function getGrandBattleDefenseAlertLevel(
  castle: Pick<GrandBattleCastle, "attackerGuildId" | "attackCount" | "defenseCount">,
  thresholds: GuildBattleAlertThresholds
): GuildBattleAlertLevel {
  if (castle.attackerGuildId === null && castle.attackCount === 0) {
    return "safe";
  }

  if (castle.defenseCount < thresholds.criticalDefenseCount) {
    return "critical";
  }

  if (castle.defenseCount < thresholds.dangerDefenseCount) {
    return "danger";
  }

  if (castle.defenseCount < thresholds.warningDefenseCount) {
    return "warning";
  }

  return "safe";
}
