import type {
  BattleMonitorCastleViewModel,
  BattleMonitorGuildCandidateViewModel
} from "../battleMonitor/types";
import type { GvgCastleId, GvgGuildId } from "../gvg/types";
import type {
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
  selectedGuildId: GvgGuildId | ""
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
      alertLevel: "safe"
    }));
}
