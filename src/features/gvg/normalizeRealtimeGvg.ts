import { decodeGvgStreamId } from "./streamId";
import type { RawCastleStatusMessage, RawGuildMessage, RawRealtimeMessage } from "./realtimeParserTypes";
import type {
  GvgCastleId,
  GvgCastleState,
  GvgGuildId,
  GvgRealtimeMessage,
  GvgWorldId
} from "./types";

const EMPTY_GUILD_ID_VALUES = new Set(["", "0"]);

export function normalizeRealtimeGvgMessage(
  rawMessage: RawRealtimeMessage,
  receivedAt: string
): GvgRealtimeMessage {
  switch (rawMessage.type) {
    case "castleStatus":
      return normalizeRawCastleStatusMessage(rawMessage, receivedAt);
    case "guild":
      return normalizeRawGuildMessage(rawMessage, receivedAt);
    case "unknown":
      return {
        type: "unknown",
        receivedAt,
        reason: rawMessage.reason
      };
  }
}

export function normalizeRealtimeGvgMessages(
  rawMessages: readonly RawRealtimeMessage[],
  receivedAt: string
): GvgRealtimeMessage[] {
  return rawMessages.map((rawMessage) => normalizeRealtimeGvgMessage(rawMessage, receivedAt));
}

function normalizeRawCastleStatusMessage(
  rawMessage: RawCastleStatusMessage,
  receivedAt: string
): GvgRealtimeMessage {
  const streamScope = decodeGvgStreamId(rawMessage.streamId);

  return {
    type: "castleUpdate",
    receivedAt,
    castle: {
      castleId: String(streamScope.castleId) as GvgCastleId,
      worldId: String(streamScope.worldId) as GvgWorldId,
      state: normalizeRealtimeCastleState(rawMessage.rawState),
      ownerGuildId: normalizeRealtimeGuildId(rawMessage.guildId, streamScope.worldId),
      attackerGuildId: normalizeRealtimeGuildId(rawMessage.attackerGuildId, streamScope.worldId),
      defenseCount: normalizeNonNegativeCount(rawMessage.defenseCount),
      attackCount: normalizeNonNegativeCount(rawMessage.attackCount),
      fallenAt: normalizeRealtimeTimestamp(rawMessage.utcFallenTimestamp),
      lastWinPartyKnockOutCount: normalizeNonNegativeCount(rawMessage.lastWinPartyKnockOutCount),
      updatedAt: receivedAt
    }
  };
}

function normalizeRawGuildMessage(
  rawMessage: RawGuildMessage,
  receivedAt: string
): GvgRealtimeMessage {
  const streamScope = decodeGvgStreamId(rawMessage.streamId);
  const guildId = normalizeRealtimeGuildId(rawMessage.guildId, streamScope.worldId);
  const guildName = rawMessage.guildName?.trim() ?? "";

  if (guildId === null || rawMessage.clearsPreviousGuilds || guildName.length === 0) {
    return {
      type: "unknown",
      receivedAt,
      reason:
        guildId === null
          ? "guild message did not include a guild ID"
          : rawMessage.clearsPreviousGuilds
            ? "guild message clears previous guild names"
            : "guild message did not include a guild name"
    };
  }

  return {
    type: "guildNameUpdate",
    receivedAt,
    guild: {
      guildId,
      guildName
    }
  };
}

export function normalizeRealtimeCastleState(rawState: number): GvgCastleState {
  switch (rawState) {
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

function normalizeRealtimeGuildId(
  guildId: GvgGuildId | null,
  streamWorldId: number
): GvgGuildId | null {
  const rawGuildId = String(guildId ?? "").trim();

  if (EMPTY_GUILD_ID_VALUES.has(rawGuildId)) {
    return null;
  }

  if (rawGuildId.length >= 12 || streamWorldId <= 0) {
    return rawGuildId as GvgGuildId;
  }

  return `${rawGuildId}${createWorldSuffix(streamWorldId)}` as GvgGuildId;
}

function createWorldSuffix(worldId: number): string {
  return String(worldId % 1000).padStart(3, "0");
}

function normalizeNonNegativeCount(count: number): number {
  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return count;
}

function normalizeRealtimeTimestamp(timestamp: number): string | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}
