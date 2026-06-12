import type {
  BattleMonitorCastleGuildRelation,
  BattleMonitorCastleViewModel,
  BattleMonitorGuildCandidateViewModel
} from "../battleMonitor/types";
import { createBattleMonitorCastleDevDetails } from "../battleMonitor/devDetails";
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
    ownedCastleCount: snapshot.castles.filter((castle) =>
      isSameGrandBattleGuild(castle.ownerGuildId, participant.guildId, snapshot.guildNames, participant.guildName)
    ).length
  }));
}

export function createGrandBattleCastleListViewModels(
  snapshot: GrandBattleSnapshot,
  selectedGuildId: GvgGuildId | "",
  alertThresholds: GuildBattleAlertThresholds,
  currentTime = new Date(),
  selectedGuildName?: string | null
): BattleMonitorCastleViewModel<GvgCastleId>[] {
  return snapshot.castles
    .map((castle) => ({
      castle,
      guildRelation: getSelectedGuildRelation(castle, selectedGuildId, selectedGuildName, snapshot.guildNames)
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
      devDetails: createBattleMonitorCastleDevDetails({
        castleId: castle.castleId,
        guildId: castle.ownerGuildId,
        attackerGuildId: castle.attackerGuildId,
        defenseGuildId: castle.ownerGuildId,
        gvgCastleState: castle.state,
        utcFallenTimeStamp: castle.fallenAt,
        guildNames: snapshot.guildNames
      }),
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
  selectedGuildId: GvgGuildId | "",
  selectedGuildName: string | null | undefined,
  guildNames: GrandBattleSnapshot["guildNames"]
): BattleMonitorCastleGuildRelation {
  if (selectedGuildId.length === 0) {
    return "none";
  }

  const selectedNonEmptyGuildId = selectedGuildId as GvgGuildId;

  if (isSameGrandBattleGuild(castle.ownerGuildId, selectedNonEmptyGuildId, guildNames, selectedGuildName)) {
    return "defense";
  }

  if (isSameGrandBattleGuild(castle.attackerGuildId, selectedNonEmptyGuildId, guildNames, selectedGuildName)) {
    return "attack";
  }

  return "none";
}

function isSameGrandBattleGuild(
  guildId: GvgGuildId | null,
  selectedGuildId: GvgGuildId,
  guildNames: GrandBattleSnapshot["guildNames"],
  selectedGuildName: string | null | undefined
): boolean {
  return guildId === selectedGuildId || isSameGrandBattleGuildName(guildId, selectedGuildName, guildNames);
}

function isSameGrandBattleGuildName(
  guildId: GvgGuildId | null,
  selectedGuildName: string | null | undefined,
  guildNames: GrandBattleSnapshot["guildNames"]
): boolean {
  if (guildId === null || selectedGuildName === null || selectedGuildName === undefined) {
    return false;
  }

  const guildName = normalizeGrandBattleGuildName(guildNames[guildId]);
  const normalizedSelectedGuildName = normalizeGrandBattleGuildName(selectedGuildName);

  return guildName !== null && guildName === normalizedSelectedGuildName;
}

function normalizeGrandBattleGuildName(guildName: string | undefined): string | null {
  const normalizedGuildName = guildName?.trim() ?? "";

  return normalizedGuildName.length === 0 ? null : normalizedGuildName;
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
