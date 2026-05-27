import type { GvgCastleState, GvgGuildId } from "./types";
import { decodeGvgStreamId, type GvgStreamId } from "./streamId";

export type RealtimePayloadBytes = Uint8Array | readonly number[];

export type RawRealtimeMessage = RawCastleStatusMessage | RawGuildMessage | RawUnknownRealtimeMessage;

export interface RawCastleStatusMessage {
  readonly type: "castleStatus";
  readonly streamId: GvgStreamId;
  readonly guildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly utcFallenTimestamp: number;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly state: GvgCastleState | "rawUnknown";
  readonly rawState: number;
  readonly lastWinPartyKnockOutCount: number;
}

export interface RawGuildMessage {
  readonly type: "guild";
  readonly streamId: GvgStreamId;
  readonly guildId: GvgGuildId | null;
  readonly guildName: string | null;
  readonly clearsPreviousGuilds: boolean;
}

export interface RawUnknownRealtimeMessage {
  readonly type: "unknown";
  readonly streamId?: GvgStreamId;
  readonly reason: string;
  readonly bytes: readonly number[];
}

export type RealtimeParserResult =
  | {
      readonly status: "ok";
      readonly messages: readonly RawRealtimeMessage[];
    }
  | {
      readonly status: "error";
      readonly messages: readonly RawRealtimeMessage[];
      readonly error: Error;
    };

const STREAM_ID_SIZE = 4;
const GUILD_MESSAGE_HEADER_SIZE = 9;
const CASTLE_STATUS_MESSAGE_SIZE = 24;

export function parseRealtimePayload(payload: RealtimePayloadBytes): RealtimeParserResult {
  const bytes = toUint8Array(payload);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messages: RawRealtimeMessage[] = [];
  let offset = 0;

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < STREAM_ID_SIZE) {
      return parserError(messages, "payload ended before stream ID", bytes, offset);
    }

    const streamId = view.getUint32(offset, true) as GvgStreamId;
    const { castleId } = decodeGvgStreamId(streamId);

    if (castleId === 0) {
      const guildMessage = parseGuildMessage(view, bytes, offset, streamId);

      if (guildMessage.status === "error") {
        return parserError(messages, guildMessage.reason, bytes, offset, streamId);
      }

      messages.push(guildMessage.message);
      offset += guildMessage.byteLength;
      continue;
    }

    if (castleId >= 1 && castleId <= 21) {
      const castleMessage = parseCastleStatusMessage(view, bytes, offset, streamId);

      if (castleMessage.status === "error") {
        return parserError(messages, castleMessage.reason, bytes, offset, streamId);
      }

      messages.push(castleMessage.message);
      offset += CASTLE_STATUS_MESSAGE_SIZE;
      continue;
    }

    messages.push({
      type: "unknown",
      streamId,
      reason: `unknown castle ID in stream ID: ${castleId}`,
      bytes: Array.from(bytes.slice(offset))
    });
    return {
      status: "ok",
      messages
    };
  }

  return {
    status: "ok",
    messages
  };
}

function parseGuildMessage(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  streamId: GvgStreamId
):
  | { readonly status: "ok"; readonly message: RawGuildMessage; readonly byteLength: number }
  | { readonly status: "error"; readonly reason: string } {
  if (bytes.byteLength - offset < GUILD_MESSAGE_HEADER_SIZE) {
    return { status: "error", reason: "payload ended inside guild message header" };
  }

  const rawGuildId = view.getUint32(offset + 4, true);
  const guildNameLength = view.getUint8(offset + 8);
  const byteLength = GUILD_MESSAGE_HEADER_SIZE + guildNameLength;

  if (bytes.byteLength - offset < byteLength) {
    return { status: "error", reason: "payload ended inside guild name" };
  }

  const guildNameBytes = bytes.slice(offset + GUILD_MESSAGE_HEADER_SIZE, offset + byteLength);
  const guildName = guildNameBytes.byteLength === 0 ? null : new TextDecoder().decode(guildNameBytes);

  return {
    status: "ok",
    byteLength,
    message: {
      type: "guild",
      streamId,
      guildId: normalizeRawGuildId(rawGuildId),
      guildName,
      clearsPreviousGuilds: rawGuildId === 0
    }
  };
}

function parseCastleStatusMessage(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  streamId: GvgStreamId
):
  | { readonly status: "ok"; readonly message: RawCastleStatusMessage }
  | { readonly status: "error"; readonly reason: string } {
  if (bytes.byteLength - offset < CASTLE_STATUS_MESSAGE_SIZE) {
    return { status: "error", reason: "payload ended inside castle status message" };
  }

  const rawState = view.getUint8(offset + 20);

  return {
    status: "ok",
    message: {
      type: "castleStatus",
      streamId,
      guildId: normalizeRawGuildId(view.getUint32(offset + 4, true)),
      attackerGuildId: normalizeRawGuildId(view.getUint32(offset + 8, true)),
      utcFallenTimestamp: view.getUint32(offset + 12, true),
      defenseCount: view.getUint16(offset + 16, true),
      attackCount: view.getUint16(offset + 18, true),
      state: "rawUnknown",
      rawState,
      lastWinPartyKnockOutCount: view.getUint16(offset + 22, true)
    }
  };
}

function normalizeRawGuildId(guildId: number): GvgGuildId | null {
  return guildId === 0 ? null : (String(guildId) as GvgGuildId);
}

function parserError(
  messages: readonly RawRealtimeMessage[],
  reason: string,
  bytes: Uint8Array,
  offset: number,
  streamId?: GvgStreamId
): RealtimeParserResult {
  return {
    status: "error",
    messages: [
      ...messages,
      {
        type: "unknown",
        streamId,
        reason,
        bytes: Array.from(bytes.slice(offset))
      }
    ],
    error: new Error(reason)
  };
}

function toUint8Array(payload: RealtimePayloadBytes): Uint8Array {
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
}
