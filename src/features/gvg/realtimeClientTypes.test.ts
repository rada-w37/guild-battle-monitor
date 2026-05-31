import { describe, expect, it } from "vitest";
import {
  createGrandBattleSubscription,
  createGuildBattleSubscription,
  createStreamIdPayload,
  DEFAULT_GVG_REALTIME_RECONNECT_CONFIG,
  type GvgRealtimeConnectionState,
  type GvgRealtimeReconnectConfig
} from "./realtimeClientTypes";
import { decodeGvgStreamId } from "./streamId";
import type { GvgWorldId } from "./types";

describe("GvG realtime client boundary types", () => {
  it("creates a Guild Battle all-castles subscription", () => {
    const subscription = createGuildBattleSubscription("1001" as GvgWorldId);

    expect(decodeGvgStreamId(subscription.streamId)).toEqual({
      castleId: 0,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 1001
    });
    expect(Array.from(subscription.payload)).toEqual(Array.from(createStreamIdPayload(subscription.streamId)));
  });

  it("creates a Grand Battle all-castles subscription", () => {
    const subscription = createGrandBattleSubscription({
      worldGroupId: 12,
      classId: 3,
      blockId: 2
    });

    expect(decodeGvgStreamId(subscription.streamId)).toEqual({
      castleId: 0,
      block: 2,
      worldGroupId: 12,
      gvgClass: 3,
      worldId: 0
    });
    expect(Array.from(subscription.payload)).toEqual(Array.from(createStreamIdPayload(subscription.streamId)));
  });

  it("represents connection states", () => {
    const state: GvgRealtimeConnectionState = {
      status: "reconnecting",
      retryCount: 2,
      reason: "network"
    };

    expect(state).toEqual({
      status: "reconnecting",
      retryCount: 2,
      reason: "network"
    });
  });

  it("keeps reconnect config explicit", () => {
    const config: GvgRealtimeReconnectConfig = DEFAULT_GVG_REALTIME_RECONNECT_CONFIG;

    expect(config).toEqual({
      maxRetryCount: 5,
      retryIntervalMs: 1000,
      exponentialBackoff: true
    });
  });
});
