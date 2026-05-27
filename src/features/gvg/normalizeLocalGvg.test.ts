import { describe, expect, it } from "vitest";
import type { LocalGvgApiResponse } from "./localGvgApiTypes";
import {
  normalizeLocalGvgCastle,
  normalizeLocalGvgCastleState,
  normalizeLocalGvgSnapshot
} from "./normalizeLocalGvg";
import type { GvgGuildId, GvgWorldId } from "./types";

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
        UtcFallenTimeStamp: 0,
        LastWinPartyKnockOutCount: 0
      },
      {
        CastleId: 2,
        GuildId: "000458625705001",
        AttackerGuildId: 123,
        AttackPartyCount: 1,
        DefensePartyCount: 10,
        GvgCastleState: 99,
        UtcFallenTimeStamp: 0
      }
    ],
    guilds: {
      "438130839001": "Owner Guild",
      "000458625705001": "Zero Padded Guild"
    }
  }
} satisfies LocalGvgApiResponse;

describe("normalizeLocalGvgSnapshot", () => {
  it("normalizes REST response into a GvG snapshot", () => {
    const snapshot = normalizeLocalGvgSnapshot(fixture);

    expect(snapshot.worldId).toBe("1001");
    expect(snapshot.capturedAt).toBe("2026-05-27T11:15:36.000Z");
    expect(snapshot.castles).toHaveLength(2);
    expect(snapshot.castles[0]).toMatchObject({
      castleId: "1",
      worldId: "1001",
      state: "idle",
      status: "normal",
      ownerGuildId: "438130839001",
      attackerGuildId: null,
      defenseCount: 120,
      attackCount: 0
    });
  });

  it("builds a guild name map while preserving display guild IDs", () => {
    const snapshot = normalizeLocalGvgSnapshot(fixture);

    expect(snapshot.guildNames["438130839001" as GvgGuildId]).toBe("Owner Guild");
    expect(snapshot.guildNames["000458625705001" as GvgGuildId]).toBe("Zero Padded Guild");
    expect(snapshot.castles[1].ownerGuildId).toBe("000458625705001");
  });

  it("maps unknown castle state without throwing", () => {
    const snapshot = normalizeLocalGvgSnapshot(fixture);

    expect(snapshot.castles[1].state).toBe("unknown");
    expect(snapshot.castles[1].status).toBe("underAttack");
  });

  it("tolerates missing fields", () => {
    const snapshot = normalizeLocalGvgSnapshot({ status: 200, data: {} });

    expect(snapshot).toMatchObject({
      worldId: "unknown",
      capturedAt: "1970-01-01T00:00:00.000Z",
      castles: [],
      guildNames: {}
    });
  });
});

describe("normalizeLocalGvgCastle", () => {
  it("normalizes missing castle fields into safe defaults", () => {
    const castle = normalizeLocalGvgCastle({}, "1001" as GvgWorldId);

    expect(castle).toEqual({
      castleId: "unknown",
      worldId: "1001",
      state: "unknown",
      status: "unknown",
      ownerGuildId: null,
      attackerGuildId: null,
      defenseCount: 0,
      attackCount: 0
    });
  });

  it("maps documented state numbers", () => {
    expect(normalizeLocalGvgCastleState(0)).toBe("idle");
    expect(normalizeLocalGvgCastleState(1)).toBe("inBattle");
    expect(normalizeLocalGvgCastleState(2)).toBe("fallen");
    expect(normalizeLocalGvgCastleState(3)).toBe("counterattack");
    expect(normalizeLocalGvgCastleState(4)).toBe("counterattackSuccessful");
  });
});
