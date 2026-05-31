import { describe, expect, it } from "vitest";
import {
  buildGrandBattleLatestUrl,
  buildGrandBattleWorldGroupsUrl,
  fetchGrandBattleLatest,
  fetchGrandBattleWorldGroups,
  GrandBattleApiError,
  type GrandBattleFetcher
} from "./grandBattleApiClient";

function createMockResponse(
  payload: unknown,
  overrides: Partial<Pick<Response, "ok" | "status" | "statusText" | "json">> = {}
): Pick<Response, "ok" | "status" | "statusText" | "json"> {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(payload),
    ...overrides
  };
}

describe("grandBattleApiClient", () => {
  it("builds GrandBattle API URLs", () => {
    expect(buildGrandBattleWorldGroupsUrl()).toBe("https://api.mentemori.icu/wgroups");
    expect(buildGrandBattleLatestUrl({ worldGroupId: 12, classId: 3, blockId: 0 })).toBe(
      "https://api.mentemori.icu/wg/12/globalgvg/3/0/latest"
    );
  });

  it("uses injectable base URLs", () => {
    expect(buildGrandBattleWorldGroupsUrl("https://example.test/api")).toBe("https://example.test/api/wgroups");
    expect(
      buildGrandBattleLatestUrl({ worldGroupId: 12, classId: 2, blockId: 1 }, "https://example.test/api")
    ).toBe("https://example.test/api/wg/12/globalgvg/2/1/latest");
  });

  it("fetches world groups and latest payloads", async () => {
    const fetcher: GrandBattleFetcher = async (input) =>
      createMockResponse(
        String(input).includes("wgroups")
          ? { status: 200, data: [{ group_id: 12, worlds: [1050] }] }
          : { status: 200, data: { guilds: { "1": "Guild" } } }
      );

    await expect(fetchGrandBattleWorldGroups({ fetcher })).resolves.toEqual({
      status: 200,
      data: [{ group_id: 12, worlds: [1050] }]
    });
    await expect(
      fetchGrandBattleLatest({ worldGroupId: 12, classId: 3, blockId: 0 }, { fetcher })
    ).resolves.toEqual({
      status: 200,
      data: { guilds: { "1": "Guild" } }
    });
  });

  it("throws on HTTP and envelope errors", async () => {
    const httpErrorFetcher: GrandBattleFetcher = async () =>
      createMockResponse({}, { ok: false, status: 500, statusText: "Internal Server Error" });
    const envelopeErrorFetcher: GrandBattleFetcher = async () => createMockResponse({ status: 503, data: null });

    await expect(fetchGrandBattleWorldGroups({ fetcher: httpErrorFetcher })).rejects.toMatchObject({
      name: "GrandBattleApiError",
      status: 500
    });
    await expect(
      fetchGrandBattleLatest({ worldGroupId: 12, classId: 3, blockId: 0 }, { fetcher: envelopeErrorFetcher })
    ).rejects.toMatchObject({
      name: "GrandBattleApiError",
      status: 503
    });
  });

  it("throws on JSON parse failure", async () => {
    const fetcher: GrandBattleFetcher = async () =>
      createMockResponse(undefined, {
        json: () => Promise.reject(new Error("Unexpected token"))
      });

    await expect(fetchGrandBattleWorldGroups({ fetcher })).rejects.toThrow(GrandBattleApiError);
  });
});
