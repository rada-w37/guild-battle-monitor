import { normalizeGvgGuildIdForComparison } from "../gvg/guildId";
import type { GvgCastleState, GvgGuildId } from "../gvg/types";
import type { BattleMonitorCastleGuildRelation } from "./types";

export function getGvgCastleStateGuildRelation(
  castle: {
    readonly attackerGuildId: GvgGuildId | null;
    readonly ownerGuildId: GvgGuildId | null;
    readonly state: GvgCastleState;
  },
  selectedGuildId: GvgGuildId | ""
): BattleMonitorCastleGuildRelation {
  if (selectedGuildId.length === 0) {
    return "none";
  }

  const normalizedSelectedGuildId = normalizeGvgGuildIdForComparison(selectedGuildId);
  const attackerGuildId = normalizeGvgGuildIdForComparison(castle.attackerGuildId);
  const ownerGuildId = normalizeGvgGuildIdForComparison(castle.ownerGuildId);

  if (attackerGuildId !== null && attackerGuildId === normalizedSelectedGuildId) {
    return getAttackerGuildRelation(castle.state);
  }

  if (ownerGuildId !== null && ownerGuildId === normalizedSelectedGuildId) {
    return getOwnerGuildRelation(castle.state);
  }

  return "none";
}

function getOwnerGuildRelation(state: GvgCastleState): BattleMonitorCastleGuildRelation {
  switch (state) {
    case "idle":
      return "securedDefense";
    case "inBattle":
      return "defense";
    case "fallen":
      return "attackDisabled";
    case "counterattack":
      return "attack";
    case "counterattackSuccessful":
      return "securedDefense";
    case "unknown":
      return "none";
  }
}

function getAttackerGuildRelation(state: GvgCastleState): BattleMonitorCastleGuildRelation {
  switch (state) {
    case "idle":
      return "attack";
    case "inBattle":
      return "attack";
    case "fallen":
      return "defense";
    case "counterattack":
      return "defense";
    case "counterattackSuccessful":
      return "defenseDisabled";
    case "unknown":
      return "none";
  }
}
