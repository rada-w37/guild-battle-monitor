import { describe, expect, it } from "vitest";
import type { GrandBattleFetcher } from "./grandBattleApiClient";
import {
  createGrandBattleWorldId,
  findGrandBattleWorldGroupId,
  loadGrandBattleParticipantGuilds,
  loadGrandBattleSnapshot,
  normalizeGrandBattleParticipantGuilds
} from "./grandBattleParticipantService";

describe("grandBattleParticipantService", () => {
  it("creates Japan world IDs", () => {
    expect(createGrandBattleWorldId("japan", 50)).toBe(1050);
  });

  it("finds a world group containing the target world", () => {
    expect(
      findGrandBattleWorldGroupId(
        [
          { group_id: 11, worlds: [1045, 1046] },
          { group_id: "12", worlds: ["1050", 1051] }
        ],
        1050
      )
    ).toBe(12);
  });

  it("normalizes up to four participant guilds", () => {
    expect(
      normalizeGrandBattleParticipantGuilds({
        "444": "Guild D",
        "111": "Guild A",
        "333": "Guild C",
        "222": "Guild B",
        "555": "Guild E"
      })
    ).toEqual([
      { guildId: "111", guildName: "Guild A" },
      { guildId: "222", guildName: "Guild B" },
      { guildId: "333", guildName: "Guild C" },
      { guildId: "444", guildName: "Guild D" }
    ]);
  });

  it("loads participant guilds through wgroups and globalgvg/latest", async () => {
    const requestedUrls: string[] = [];
    const fetcher: GrandBattleFetcher = async (input) => {
      requestedUrls.push(String(input));

      if (String(input).endsWith("/wgroups")) {
        return createMockResponse({ status: 200, data: [{ group_id: 12, worlds: [1050] }] });
      }

      return createMockResponse({
        status: 200,
        data: {
          guilds: {
            "222222222050": "ギルドB",
            "111111111050": "ギルドA"
          }
        }
      });
    };

    await expect(
      loadGrandBattleParticipantGuilds(
        {
          serverId: "japan",
          worldInput: "50",
          worldNumber: 50,
          classId: 3,
          blockId: 0
        },
        { fetcher }
      )
    ).resolves.toEqual([
      { guildId: "111111111050", guildName: "ギルドA" },
      { guildId: "222222222050", guildName: "ギルドB" }
    ]);
    expect(requestedUrls).toEqual([
      "https://api.mentemori.icu/wgroups",
      "https://api.mentemori.icu/wg/12/globalgvg/3/0/latest"
    ]);
  });

  it("loads a GrandBattle snapshot through wgroups and globalgvg/latest", async () => {
    const requestedUrls: string[] = [];
    const fetcher: GrandBattleFetcher = async (input) => {
      requestedUrls.push(String(input));

      if (String(input).endsWith("/wgroups")) {
        return createMockResponse({ status: 200, data: [{ group_id: 12, worlds: [1050] }] });
      }

      return createMockResponse({
        status: 200,
        timestamp: 1779880536,
        data: {
          guilds: {
            "111111111050": "ギルドA"
          },
          castles: [
            {
              CastleId: 1,
              GuildId: 111111111050,
              DefensePartyCount: 120,
              AttackPartyCount: 0
            }
          ]
        }
      });
    };

    await expect(
      loadGrandBattleSnapshot(
        {
          serverId: "japan",
          worldInput: "50",
          worldNumber: 50,
          classId: 3,
          blockId: 0
        },
        { fetcher }
      )
    ).resolves.toMatchObject({
      capturedAt: "2026-05-27T11:15:36.000Z",
      guildNames: {
        "111111111050": "ギルドA"
      },
      castles: [
        {
          castleId: "1",
          ownerGuildId: "111111111050",
          defenseCount: 120,
          attackCount: 0
        }
      ]
    });
    expect(requestedUrls).toEqual([
      "https://api.mentemori.icu/wgroups",
      "https://api.mentemori.icu/wg/12/globalgvg/3/0/latest"
    ]);
  });

  it("throws when no world group matches the world", async () => {
    const fetcher: GrandBattleFetcher = async () =>
      createMockResponse({ status: 200, data: [{ group_id: 12, worlds: [1051] }] });

    await expect(
      loadGrandBattleParticipantGuilds(
        {
          serverId: "japan",
          worldInput: "50",
          worldNumber: 50,
          classId: 3,
          blockId: 0
        },
        { fetcher }
      )
    ).rejects.toThrow("対象worldのワールドグループが見つかりません。");
  });
});

function createMockResponse(payload: unknown): Pick<Response, "ok" | "status" | "statusText" | "json"> {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(payload)
  };
}
