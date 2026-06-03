import type { BattleMonitorCastleDevDetails } from "./types";
import type { GvgCastleState, GvgGuildId, GvgGuildNameMap } from "../gvg/types";

export function createBattleMonitorCastleDevDetails({
  castleId,
  guildId,
  attackerGuildId,
  defenseGuildId,
  gvgCastleState,
  utcFallenTimeStamp,
  guildNames
}: {
  readonly castleId: string;
  readonly guildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly defenseGuildId: GvgGuildId | null;
  readonly gvgCastleState: GvgCastleState;
  readonly utcFallenTimeStamp: string | null;
  readonly guildNames: GvgGuildNameMap;
}): BattleMonitorCastleDevDetails {
  return {
    castleId,
    guildId: formatDevGuildId(guildId, guildNames),
    attackerGuildId: formatDevGuildId(attackerGuildId, guildNames),
    defenseGuildId: formatDevGuildId(defenseGuildId, guildNames),
    gvgCastleState: formatGvgCastleState(gvgCastleState),
    utcFallenTimeStamp: formatUtcFallenTimeStamp(utcFallenTimeStamp)
  };
}

function formatDevGuildId(guildId: GvgGuildId | null, guildNames: GvgGuildNameMap): string {
  if (guildId === null) {
    return "なし";
  }

  const guildName = guildNames[guildId] ?? "不明";

  return `${guildName}（${guildId}）`;
}

function formatGvgCastleState(state: GvgCastleState): string {
  switch (state) {
    case "idle":
      return "0 (none)";
    case "inBattle":
      return "1 (declared/in battle)";
    case "fallen":
      return "2 (fallen)";
    case "counterattack":
      return "3 (counterattack)";
    case "counterattackSuccessful":
      return "4 (counterattack successful)";
    case "unknown":
      return "unknown";
  }
}

function formatUtcFallenTimeStamp(timestamp: string | null): string {
  if (timestamp === null) {
    return "なし";
  }

  const readableTimestamp = formatReadableUtcTimestamp(timestamp);

  return readableTimestamp === null ? timestamp : `${timestamp} (${readableTimestamp})`;
}

function formatReadableUtcTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(
    date.getUTCHours()
  )}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} UTC`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
