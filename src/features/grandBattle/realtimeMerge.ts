import { normalizeRealtimeGvgMessages } from "../gvg/normalizeRealtimeGvg";
import { parseRealtimePayload, type RealtimePayloadBytes, type RealtimeParserResult } from "../gvg/realtimeParserTypes";
import type { GvgGuildId, GvgRealtimeMessage } from "../gvg/types";
import type { GrandBattleCastle, GrandBattleSnapshot } from "./types";

export interface GrandBattleRealtimePayloadProcessResult {
  readonly snapshot: GrandBattleSnapshot;
  readonly parserResult: RealtimeParserResult;
  readonly messages: readonly GvgRealtimeMessage[];
}

export function processGrandBattleRealtimePayload(
  snapshot: GrandBattleSnapshot,
  payload: RealtimePayloadBytes,
  receivedAt: string
): GrandBattleRealtimePayloadProcessResult {
  const parserResult = parseRealtimePayload(payload);
  const messages = normalizeRealtimeGvgMessages(parserResult.messages, receivedAt);

  return {
    snapshot: applyGrandBattleRealtimeMessages(snapshot, messages),
    parserResult,
    messages
  };
}

export function applyGrandBattleRealtimePayload(
  snapshot: GrandBattleSnapshot,
  payload: RealtimePayloadBytes,
  receivedAt: string
): GrandBattleSnapshot {
  return processGrandBattleRealtimePayload(snapshot, payload, receivedAt).snapshot;
}

export function applyGrandBattleRealtimeMessages(
  snapshot: GrandBattleSnapshot,
  messages: readonly GvgRealtimeMessage[]
): GrandBattleSnapshot {
  return messages.reduce(
    (currentSnapshot, message) => applyGrandBattleRealtimeMessage(currentSnapshot, message),
    snapshot
  );
}

export function applyGrandBattleRealtimeMessage(
  snapshot: GrandBattleSnapshot,
  message: GvgRealtimeMessage
): GrandBattleSnapshot {
  switch (message.type) {
    case "snapshot":
      return snapshot;
    case "castleUpdate":
      return applyGrandBattleCastleUpdate(snapshot, {
        castleId: message.castle.castleId,
        state: message.castle.state,
        ownerGuildId: resolveGrandBattleGuildId(snapshot, message.castle.ownerGuildId),
        attackerGuildId: resolveGrandBattleGuildId(snapshot, message.castle.attackerGuildId),
        defenseCount: message.castle.defenseCount,
        attackCount: message.castle.attackCount,
        fallenAt: message.castle.fallenAt,
        lastWinPartyKnockOutCount: message.castle.lastWinPartyKnockOutCount,
        updatedAt: message.castle.updatedAt
      });
    case "guildNameUpdate":
      return {
        ...snapshot,
        capturedAt: message.receivedAt,
        guildNames: {
          ...snapshot.guildNames,
          [resolveGrandBattleGuildId(snapshot, message.guild.guildId) ?? message.guild.guildId]: message.guild.guildName
        }
      };
    case "unknown":
      return snapshot;
  }
}

function resolveGrandBattleGuildId(
  snapshot: GrandBattleSnapshot,
  guildId: GvgGuildId | null
): GvgGuildId | null {
  if (guildId === null) {
    return null;
  }

  if (snapshot.guildNames[guildId] !== undefined) {
    return guildId;
  }

  const displayGuildId = String(guildId);
  const matchingGuildId = Object.keys(snapshot.guildNames).find((candidateGuildId) =>
    candidateGuildId.startsWith(displayGuildId)
  );

  return (matchingGuildId as GvgGuildId | undefined) ?? guildId;
}

function applyGrandBattleCastleUpdate(
  snapshot: GrandBattleSnapshot,
  updatedCastle: GrandBattleCastle
): GrandBattleSnapshot {
  const existingIndex = snapshot.castles.findIndex((castle) => castle.castleId === updatedCastle.castleId);

  if (existingIndex === -1) {
    return {
      ...snapshot,
      capturedAt: updatedCastle.updatedAt,
      castles: [...snapshot.castles, updatedCastle]
    };
  }

  return {
    ...snapshot,
    capturedAt: updatedCastle.updatedAt,
    castles: snapshot.castles.map((castle, index) => (index === existingIndex ? updatedCastle : castle))
  };
}
