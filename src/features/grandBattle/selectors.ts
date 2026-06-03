import type {
  BattleMonitorCastleGuildRelation,
  BattleMonitorCastleViewModel,
  BattleMonitorGuildCandidateViewModel
} from "../battleMonitor/types";
import { isDefenseSecured } from "../battleMonitor/defenseSecured";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import type { GuildBattleAlertLevel, GuildBattleAlertThresholds } from "../guildBattle/types";
import type {
  GrandBattleCastle,
  GrandBattleParticipantGuildCandidate,
  GrandBattleSnapshot
} from "./types";
import { getGrandBattleCastleName } from "./castleMetadata";

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
  alertThresholds: GuildBattleAlertThresholds,
  currentTime = new Date()
): BattleMonitorCastleViewModel<GvgCastleId>[] {
  return snapshot.castles
    .map((castle) => ({
      castle,
      guildRelation: getSelectedGuildRelation(castle, selectedGuildId)
    }))
    .filter(({ guildRelation }) => selectedGuildId.length === 0 || guildRelation !== "none")
    .map(({ castle, guildRelation }) => ({
      castleId: castle.castleId,
      castleName: getGrandBattleCastleName(castle.castleId),
      guildRelation,
      ownerGuildName: castle.ownerGuildId === null ? "Unknown guild" : snapshot.guildNames[castle.ownerGuildId] ?? "Unknown guild",
      attackerGuildName:
        castle.attackerGuildId === null ? null : snapshot.guildNames[castle.attackerGuildId] ?? null,
      defenseCount: castle.defenseCount,
      attackCount: castle.attackCount,
      isDefenseSecured: isDefenseSecured({
        attackerGuildId: castle.attackerGuildId,
        defenseCount: castle.defenseCount,
        now: currentTime,
        ownerGuildId: castle.ownerGuildId
      }),
      koDisplay: {
        count: castle.lastWinPartyKnockOutCount,
        tone: castle.lastWinPartyKnockOutCount > 0 ? "defense" : "none"
      },
      alertLevel: getGrandBattleDefenseAlertLevel(castle, alertThresholds)
    }));
}

function getSelectedGuildRelation(
  castle: Pick<GrandBattleCastle, "attackerGuildId" | "ownerGuildId">,
  selectedGuildId: GvgGuildId | ""
): BattleMonitorCastleGuildRelation {
  if (selectedGuildId.length === 0) {
    return "none";
  }

  if (castle.attackerGuildId === selectedGuildId) {
    return "attack";
  }

  if (castle.ownerGuildId === selectedGuildId) {
    return "defense";
  }

  return "none";
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
