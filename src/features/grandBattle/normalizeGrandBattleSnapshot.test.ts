import { describe, expect, it } from "vitest";
import type { GrandBattleApiResponse, GrandBattleLatestDataResponse } from "./grandBattleApiClient";
import { normalizeGrandBattleSnapshot } from "./normalizeGrandBattleSnapshot";
import type { GrandBattleResolvedSource } from "./types";

const source = {
  serverId: "japan",
  worldInput: "50",
  worldNumber: 50,
  classId: 3,
  blockId: 0
} satisfies GrandBattleResolvedSource;

describe("normalizeGrandBattleSnapshot", () => {
  it("normalizes castles, guilds, and timestamps", () => {
    const response = {
      status: 200,
      timestamp: 1779880536,
      data: {
        guilds: {
          "111111111050": "ギルドA",
          "222222222050": "ギルドB"
        },
        castles: [
          {
            CastleId: 1,
            GuildId: 111111111050,
            AttackerGuildId: 222222222050,
            AttackPartyCount: 5,
            DefensePartyCount: 120,
            GvgCastleState: 1,
            UtcFallenTimeStamp: 0,
            LastWinPartyKnockOutCount: 30
          }
        ]
      }
    } satisfies GrandBattleApiResponse<GrandBattleLatestDataResponse>;

    expect(normalizeGrandBattleSnapshot(response, source, 12)).toEqual({
      source,
      worldGroupId: 12,
      capturedAt: "2026-05-27T11:15:36.000Z",
      guildNames: {
        "111111111050": "ギルドA",
        "222222222050": "ギルドB"
      },
      castles: [
        {
          castleId: "1",
          state: "inBattle",
          ownerGuildId: "111111111050",
          attackerGuildId: "222222222050",
          defenseCount: 120,
          attackCount: 5,
          fallenAt: null,
          lastWinPartyKnockOutCount: 30,
          updatedAt: "2026-05-27T11:15:36.000Z"
        }
      ]
    });
  });

  it("handles missing fields without throwing", () => {
    const response = {
      status: 200,
      data: {
        castles: [
          {
            CastleId: "2",
            GuildId: 0,
            AttackerGuildId: "0",
            DefensePartyCount: "8"
          }
        ]
      }
    } satisfies GrandBattleApiResponse<GrandBattleLatestDataResponse>;

    expect(normalizeGrandBattleSnapshot(response, source, 12)).toMatchObject({
      worldGroupId: 12,
      capturedAt: "1970-01-01T00:00:00.000Z",
      guildNames: {},
      castles: [
        {
          castleId: "2",
          state: "unknown",
          ownerGuildId: null,
          attackerGuildId: null,
          defenseCount: 8,
          attackCount: 0,
          fallenAt: null,
          lastWinPartyKnockOutCount: 0
        }
      ]
    });
  });

  it("uses empty arrays and maps when castles or guilds are missing", () => {
    expect(normalizeGrandBattleSnapshot({ status: 200, data: null }, source, 12)).toEqual({
      source,
      worldGroupId: 12,
      capturedAt: "1970-01-01T00:00:00.000Z",
      castles: [],
      guildNames: {}
    });
  });
});
