import type { GvgCastleState, GvgGuildId } from "./types";
import type { GvgStreamId } from "./streamId";

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

export function parseRealtimePayload(_payload: RealtimePayloadBytes): RealtimeParserResult {
  return {
    status: "error",
    messages: [],
    error: new Error("Realtime binary parser is not implemented yet")
  };
}
