import type { RealtimePayloadBytes } from "./realtimeParserTypes";
import { buildGvgStreamId, createGuildBattleAllCastlesStreamScope, type GvgStreamId } from "./streamId";
import type { GvgWorldId } from "./types";

export type GvgRealtimeConnectionState =
  | { readonly status: "idle" }
  | { readonly status: "connecting" }
  | { readonly status: "connected" }
  | { readonly status: "reconnecting"; readonly retryCount: number; readonly reason?: string }
  | { readonly status: "disconnected"; readonly reason?: string }
  | { readonly status: "error"; readonly error: Error };

export type GvgRealtimeClientEvent =
  | { readonly type: "connected" }
  | { readonly type: "disconnected"; readonly reason?: string }
  | { readonly type: "payloadReceived"; readonly payload: RealtimePayloadBytes }
  | { readonly type: "stateChanged"; readonly state: GvgRealtimeConnectionState }
  | { readonly type: "error"; readonly error: Error };

export interface GvgRealtimeReconnectConfig {
  readonly maxRetryCount: number;
  readonly retryIntervalMs: number;
  readonly exponentialBackoff: boolean;
}

export const DEFAULT_GVG_REALTIME_RECONNECT_CONFIG = {
  maxRetryCount: 5,
  retryIntervalMs: 1000,
  exponentialBackoff: true
} as const satisfies GvgRealtimeReconnectConfig;

export interface GvgRealtimeSubscription {
  readonly streamId: GvgStreamId;
  readonly payload: Uint8Array;
}

export type GvgRealtimeClientListener = (event: GvgRealtimeClientEvent) => void;

export interface GvgRealtimeClient {
  readonly state: GvgRealtimeConnectionState;
  connect(): Promise<void>;
  disconnect(reason?: string): void;
  subscribe(subscription: GvgRealtimeSubscription): void;
  unsubscribe(subscription: GvgRealtimeSubscription): void;
  addEventListener(listener: GvgRealtimeClientListener): () => void;
}

export function createGuildBattleSubscription(worldId: GvgWorldId | string): GvgRealtimeSubscription {
  const streamId = buildGvgStreamId(createGuildBattleAllCastlesStreamScope(worldId));

  return {
    streamId,
    payload: createStreamIdPayload(streamId)
  };
}

export function createStreamIdPayload(streamId: GvgStreamId): Uint8Array {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, streamId, true);

  return payload;
}
