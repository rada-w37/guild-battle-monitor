import { describe, expect, it } from "vitest";
import type { LocalGvgApiResponse } from "./localGvgApiTypes";
import { loadLocalGvgSnapshot } from "./localGvgService";
import type { LocalGvgFetcher } from "./localGvgApiClient";

const fixture = {
  status: 200,
  timestamp: 1779880536,
  data: {
    world_id: 1001,
    castles: [
      {
        CastleId: 1,
        GuildId: 438130839001,
        AttackerGuildId: 0,
        AttackPartyCount: 0,
        DefensePartyCount: 120,
        GvgCastleState: 0,
        UtcFallenTimeStamp: 0
      }
    ],
    guilds: {
      "438130839001": "Owner Guild"
    }
  }
} satisfies LocalGvgApiResponse;

describe("loadLocalGvgSnapshot", () => {
  it("returns a normalized GvG snapshot", async () => {
    const fetcher: LocalGvgFetcher = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(fixture)
    });

    const snapshot = await loadLocalGvgSnapshot("1001", { fetcher });

    expect(snapshot).toMatchObject({
      worldId: "1001",
      capturedAt: "2026-05-27T11:15:36.000Z",
      castles: [
        {
          castleId: "1",
          ownerGuildId: "438130839001",
          defenseCount: 120,
          attackCount: 0
        }
      ],
      guildNames: {
        "438130839001": "Owner Guild"
      }
    });
  });
});
