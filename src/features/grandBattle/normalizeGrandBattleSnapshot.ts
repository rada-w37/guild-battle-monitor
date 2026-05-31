import type { GvgCastleId, GvgCastleState, GvgGuildId } from "../gvg/types";
import type {
  GrandBattleApiResponse,
  GrandBattleApiScalar,
  GrandBattleCastleResponse,
  GrandBattleLatestDataResponse
} from "./grandBattleApiClient";
import type { GrandBattleCastle, GrandBattleResolvedSource, GrandBattleSnapshot } from "./types";

const EMPTY_GUILD_ID_VALUES = new Set(["", "0"]);

export function normalizeGrandBattleSnapshot(
  response: GrandBattleApiResponse<GrandBattleLatestDataResponse>,
  source: GrandBattleResolvedSource
): GrandBattleSnapshot {
  const data = response.data ?? {};
  const capturedAt = normalizeGrandBattleTimestamp(response.timestamp);
  const castles = Array.isArray(data.castles)
    ? data.castles.map((castle) => normalizeGrandBattleCastle(castle, capturedAt))
    : [];

  return {
    source,
    capturedAt,
    castles,
    guildNames: normalizeGrandBattleGuildNameMap(data.guilds)
  };
}

export function normalizeGrandBattleCastle(
  castle: GrandBattleCastleResponse,
  updatedAt = new Date(0).toISOString()
): GrandBattleCastle {
  return {
    castleId: normalizeGrandBattleCastleId(castle.CastleId),
    state: normalizeGrandBattleCastleState(castle.GvgCastleState),
    ownerGuildId: normalizeGrandBattleGuildId(castle.GuildId),
    attackerGuildId: normalizeGrandBattleGuildId(castle.AttackerGuildId),
    defenseCount: normalizeGrandBattleCount(castle.DefensePartyCount),
    attackCount: normalizeGrandBattleCount(castle.AttackPartyCount),
    fallenAt: normalizeGrandBattleNullableTimestamp(castle.UtcFallenTimeStamp),
    lastWinPartyKnockOutCount: normalizeGrandBattleCount(castle.LastWinPartyKnockOutCount),
    updatedAt
  };
}

export function normalizeGrandBattleGuildNameMap(
  guilds: Record<string, string> | null | undefined
): GrandBattleSnapshot["guildNames"] {
  if (!guilds) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(guilds)
      .map(([guildId, guildName]) => {
        const normalizedGuildId = normalizeGrandBattleGuildId(guildId);

        return normalizedGuildId === null || typeof guildName !== "string"
          ? null
          : ([normalizedGuildId, guildName] as const);
      })
      .filter((entry): entry is readonly [GvgGuildId, string] => entry !== null)
  ) as GrandBattleSnapshot["guildNames"];
}

function normalizeGrandBattleCastleId(castleId: GrandBattleApiScalar | undefined): GvgCastleId {
  return String(castleId ?? "unknown").trim() as GvgCastleId;
}

function normalizeGrandBattleGuildId(guildId: GrandBattleApiScalar | undefined): GvgGuildId | null {
  const displayGuildId = String(guildId ?? "").trim();

  if (EMPTY_GUILD_ID_VALUES.has(displayGuildId)) {
    return null;
  }

  return displayGuildId as GvgGuildId;
}

function normalizeGrandBattleCastleState(state: GrandBattleApiScalar | undefined): GvgCastleState {
  switch (toNumber(state)) {
    case 0:
      return "idle";
    case 1:
      return "inBattle";
    case 2:
      return "fallen";
    case 3:
      return "counterattack";
    case 4:
      return "counterattackSuccessful";
    default:
      return "unknown";
  }
}

function normalizeGrandBattleCount(count: GrandBattleApiScalar | undefined): number {
  const numericCount = toNumber(count);

  if (numericCount === null || numericCount < 0) {
    return 0;
  }

  return numericCount;
}

function normalizeGrandBattleTimestamp(timestamp: number | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return new Date(0).toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}

function normalizeGrandBattleNullableTimestamp(timestamp: GrandBattleApiScalar | undefined): string | null {
  const numericTimestamp = toNumber(timestamp);

  if (numericTimestamp === null || numericTimestamp <= 0) {
    return null;
  }

  return new Date(numericTimestamp * 1000).toISOString();
}

function toNumber(value: GrandBattleApiScalar | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}
