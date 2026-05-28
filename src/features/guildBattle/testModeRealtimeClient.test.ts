import { describe, expect, it, vi } from "vitest";
import { processRealtimePayload } from "../gvg/realtimeIntegrationService";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { TestModeGvgRealtimeClient } from "./testModeRealtimeClient";

const worldId = "1001" as GvgWorldId;
const ownerGuildId = "438130839001" as GvgGuildId;

const snapshot = {
  worldId,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [ownerGuildId]: "Owner Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId,
      state: "idle",
      status: "normal",
      ownerGuildId,
      attackerGuildId: null,
      defenseCount: 20,
      attackCount: 0,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    }
  ]
} satisfies GvgSnapshot;

describe("TestModeGvgRealtimeClient", () => {
  it("emits parser-compatible payloads for manual attack changes", async () => {
    const client = new TestModeGvgRealtimeClient();
    const payloads: unknown[] = [];
    client.setSnapshot(snapshot);
    client.addEventListener((event) => {
      if (event.type === "payloadReceived") {
        payloads.push(event.payload);
      }
    });

    await client.connect();
    client.increaseAttack("1" as GvgCastleId, 5);

    expect(payloads).toHaveLength(1);

    const result = processRealtimePayload(snapshot, payloads[0] as number[], "2026-05-27T11:15:37.000Z");
    expect(result.snapshot.castles[0]).toMatchObject({
      attackCount: 5,
      state: "inBattle"
    });

    client.disconnect("test finished");
  });

  it("can revive a fallen castle", async () => {
    const client = new TestModeGvgRealtimeClient();
    const payloads: unknown[] = [];
    client.setSnapshot({
      ...snapshot,
      castles: [{ ...snapshot.castles[0], defenseCount: 0, state: "fallen" }]
    });
    client.addEventListener((event) => {
      if (event.type === "payloadReceived") {
        payloads.push(event.payload);
      }
    });

    await client.connect();
    client.reviveCastle("1" as GvgCastleId);

    const result = processRealtimePayload(snapshot, payloads[0] as number[], "2026-05-27T11:15:37.000Z");
    expect(result.snapshot.castles[0]).toMatchObject({
      defenseCount: 30,
      attackCount: 0,
      state: "idle"
    });

    client.disconnect("test finished");
  });

  it("randomly decreases fighting castles and marks fallen at defense 0", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const client = new TestModeGvgRealtimeClient();
    const payloads: unknown[] = [];
    client.setSnapshot({
      ...snapshot,
      castles: [{ ...snapshot.castles[0], defenseCount: 1, attackCount: 1 }]
    });
    client.addEventListener((event) => {
      if (event.type === "payloadReceived") {
        payloads.push(event.payload);
      }
    });

    await client.connect();
    vi.advanceTimersByTime(1000);

    const result = processRealtimePayload(snapshot, payloads[0] as number[], "2026-05-27T11:15:37.000Z");
    expect(result.snapshot.castles[0]).toMatchObject({
      defenseCount: 0,
      state: "fallen"
    });

    client.disconnect("test finished");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
