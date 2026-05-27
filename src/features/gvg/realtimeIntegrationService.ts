import { applyGvgRealtimeMessages } from "./realtimeMerge";
import { normalizeRealtimeGvgMessages } from "./normalizeRealtimeGvg";
import { parseRealtimePayload, type RealtimePayloadBytes, type RealtimeParserResult } from "./realtimeParserTypes";
import type { GvgRealtimeMessage, GvgSnapshot } from "./types";

export interface RealtimePayloadProcessResult {
  readonly snapshot: GvgSnapshot;
  readonly parserResult: RealtimeParserResult;
  readonly messages: readonly GvgRealtimeMessage[];
}

export function processRealtimePayload(
  snapshot: GvgSnapshot,
  payload: RealtimePayloadBytes,
  receivedAt: string
): RealtimePayloadProcessResult {
  const parserResult = parseRealtimePayload(payload);
  const messages = normalizeRealtimeGvgMessages(parserResult.messages, receivedAt);

  return {
    snapshot: applyGvgRealtimeMessages(snapshot, messages),
    parserResult,
    messages
  };
}

export function applyRealtimePayloadToSnapshot(
  snapshot: GvgSnapshot,
  payload: RealtimePayloadBytes,
  receivedAt: string
): GvgSnapshot {
  return processRealtimePayload(snapshot, payload, receivedAt).snapshot;
}
