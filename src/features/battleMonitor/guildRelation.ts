import { getBattleEndRemainingSeconds } from "./defenseSecured";
import { normalizeGvgGuildIdForComparison } from "../gvg/guildId";
import type { GvgCastleState, GvgGuildId } from "../gvg/types";
import type { BattleMonitorCastleGuildRelation } from "./types";

export function getGvgCastleStateGuildRelation(
  castle: {
    readonly attackerGuildId: GvgGuildId | null;
    readonly defenseCount: number;
    readonly ownerGuildId: GvgGuildId | null;
    readonly state: GvgCastleState;
  },
  selectedGuildId: GvgGuildId | "",
  now: Date
): BattleMonitorCastleGuildRelation {
  if (selectedGuildId.length === 0) {
    return "none";
  }

  const normalizedSelectedGuildId = normalizeGvgGuildIdForComparison(selectedGuildId);
  const attackerGuildId = normalizeGvgGuildIdForComparison(castle.attackerGuildId);
  const ownerGuildId = normalizeGvgGuildIdForComparison(castle.ownerGuildId);
  const isDefenseCountSecured = castle.defenseCount > getBattleEndRemainingSeconds(now);

  if (attackerGuildId !== null && attackerGuildId === normalizedSelectedGuildId) {
    return getAttackerGuildRelation(castle.state, isDefenseCountSecured);
  }

  if (ownerGuildId !== null && ownerGuildId === normalizedSelectedGuildId) {
    return getOwnerGuildRelation(castle.state, isDefenseCountSecured);
  }

  return "none";
}

function getOwnerGuildRelation(
  state: GvgCastleState,
  isDefenseCountSecured: boolean
): BattleMonitorCastleGuildRelation {
  switch (state) {
    case "idle":
      return "securedDefense";
    case "inBattle":
      return "defense";
    case "fallen":
      return isDefenseCountSecured ? "attackDisabled" : "attack";
    case "counterattack":
      return "attack";
    case "counterattackSuccessful":
      return "securedDefense";
    case "unknown":
      return "none";
  }
}

function getAttackerGuildRelation(
  state: GvgCastleState,
  isDefenseCountSecured: boolean
): BattleMonitorCastleGuildRelation {
  switch (state) {
    case "idle":
      return "attack";
    case "inBattle":
      return "attack";
    case "fallen":
    case "counterattack":
      return isDefenseCountSecured ? "securedDefense" : "defense";
    case "counterattackSuccessful":
      return "defenseDisabled";
    case "unknown":
      return "none";
  }
}
