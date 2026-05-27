import type {
  LocalGvgApiResponse,
  LocalGvgApiScalar,
  LocalGvgCastleResponse,
  LocalGvgGuildResponse
} from "./localGvgApiTypes";
import type {
  GvgCastle,
  GvgCastleId,
  GvgCastleState,
  GvgCastleStatus,
  GvgGuildId,
  GvgGuildNameMap,
  GvgSnapshot,
  GvgWorldId
} from "./types";

const EMPTY_GUILD_ID_VALUES = new Set(["", "0"]);

export function normalizeLocalGvgSnapshot(response: LocalGvgApiResponse): GvgSnapshot {
  const data = response.data ?? {};
  const worldId = normalizeLocalGvgWorldId(data.world_id);
  const capturedAt = normalizeLocalGvgTimestamp(response.timestamp);
  const castles = Array.isArray(data.castles)
    ? data.castles.map((castle) => normalizeLocalGvgCastle(castle, worldId))
    : [];
  const guildNames = normalizeLocalGvgGuildNameMap(data.guilds);

  return {
    worldId,
    capturedAt,
    castles,
    guildNames
  };
}

export function normalizeLocalGvgCastle(
  castle: LocalGvgCastleResponse,
  worldId: GvgWorldId
): GvgCastle {
  const state = normalizeLocalGvgCastleState(castle.GvgCastleState);

  return {
    castleId: normalizeLocalGvgCastleId(castle.CastleId),
    worldId,
    state,
    status: normalizeLocalGvgCastleStatus(state, castle.AttackPartyCount),
    ownerGuildId: normalizeLocalGvgGuildId(castle.GuildId),
    defenseCount: normalizeLocalGvgCount(castle.DefensePartyCount),
    attackCount: normalizeLocalGvgCount(castle.AttackPartyCount)
  };
}

export function normalizeLocalGvgGuild(id: string, name: unknown): LocalGvgGuildResponse | null {
  if (typeof name !== "string") {
    return null;
  }

  const guildId = normalizeLocalGvgGuildId(id);

  if (guildId === null) {
    return null;
  }

  return {
    id: guildId,
    name
  };
}

export function normalizeLocalGvgGuildNameMap(
  guilds: Record<string, string> | null | undefined
): GvgGuildNameMap {
  if (!guilds) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(guilds)
      .map(([id, name]) => normalizeLocalGvgGuild(id, name))
      .filter((guild): guild is LocalGvgGuildResponse => guild !== null)
      .map((guild) => [guild.id as GvgGuildId, guild.name])
  ) as GvgGuildNameMap;
}

export function normalizeLocalGvgCastleState(state: LocalGvgApiScalar | undefined): GvgCastleState {
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

export function normalizeLocalGvgCastleStatus(
  state: GvgCastleState,
  attackPartyCount: LocalGvgApiScalar | undefined
): GvgCastleStatus {
  if (state === "fallen") {
    return "fallen";
  }

  if (
    state === "inBattle" ||
    state === "counterattack" ||
    state === "counterattackSuccessful" ||
    normalizeLocalGvgCount(attackPartyCount) > 0
  ) {
    return "underAttack";
  }

  if (state === "unknown") {
    return "unknown";
  }

  return "normal";
}

function normalizeLocalGvgWorldId(worldId: LocalGvgApiScalar | undefined): GvgWorldId {
  return String(worldId ?? "unknown").trim() as GvgWorldId;
}

function normalizeLocalGvgCastleId(castleId: LocalGvgApiScalar | undefined): GvgCastleId {
  return String(castleId ?? "unknown").trim() as GvgCastleId;
}

function normalizeLocalGvgGuildId(guildId: LocalGvgApiScalar | undefined): GvgGuildId | null {
  const displayGuildId = String(guildId ?? "").trim();

  if (EMPTY_GUILD_ID_VALUES.has(displayGuildId)) {
    return null;
  }

  return displayGuildId as GvgGuildId;
}

function normalizeLocalGvgCount(count: LocalGvgApiScalar | undefined): number {
  const numericCount = toNumber(count);

  if (numericCount === null || numericCount < 0) {
    return 0;
  }

  return numericCount;
}

function normalizeLocalGvgTimestamp(timestamp: number | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return new Date(0).toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}

function toNumber(value: LocalGvgApiScalar | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}
