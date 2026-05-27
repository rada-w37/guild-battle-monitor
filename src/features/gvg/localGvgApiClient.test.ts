import { describe, expect, it } from "vitest";
import type { LocalGvgApiResponse } from "./localGvgApiTypes";
import {
  buildLocalGvgLatestUrl,
  fetchLocalGvgLatest,
  LocalGvgApiError,
  type LocalGvgFetcher
} from "./localGvgApiClient";

const successfulResponse = {
  status: 200,
  timestamp: 1779880536,
  data: {
    world_id: 1001,
    castles: [],
    guilds: {}
  }
} satisfies LocalGvgApiResponse;

function createMockResponse(
  overrides: Partial<Pick<Response, "ok" | "status" | "statusText" | "json">> = {}
): Pick<Response, "ok" | "status" | "statusText" | "json"> {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(successfulResponse),
    ...overrides
  };
}

describe("buildLocalGvgLatestUrl", () => {
  it("builds the latest local GvG URL", () => {
    expect(buildLocalGvgLatestUrl("1001")).toBe(
      "https://api.mentemori.icu/1001/localgvg/latest"
    );
  });

  it("trims worldId before building the URL", () => {
    expect(buildLocalGvgLatestUrl(" 1001 ")).toBe(
      "https://api.mentemori.icu/1001/localgvg/latest"
    );
  });

  it("throws when worldId is empty", () => {
    expect(() => buildLocalGvgLatestUrl("   ")).toThrow(LocalGvgApiError);
  });

  it("uses an injectable base URL", () => {
    expect(buildLocalGvgLatestUrl("1001", "https://example.test/api")).toBe(
      "https://example.test/api/1001/localgvg/latest"
    );
  });
});

describe("fetchLocalGvgLatest", () => {
  it("returns the REST response on success", async () => {
    const fetcher: LocalGvgFetcher = async () => createMockResponse();

    await expect(fetchLocalGvgLatest("1001", { fetcher })).resolves.toEqual(successfulResponse);
  });

  it("throws on HTTP error", async () => {
    const fetcher: LocalGvgFetcher = async () =>
      createMockResponse({ ok: false, status: 500, statusText: "Internal Server Error" });

    await expect(fetchLocalGvgLatest("1001", { fetcher })).rejects.toMatchObject({
      name: "LocalGvgApiError",
      status: 500
    });
  });

  it("throws on JSON parse failure", async () => {
    const fetcher: LocalGvgFetcher = async () =>
      createMockResponse({
        json: () => Promise.reject(new Error("Unexpected token"))
      });

    await expect(fetchLocalGvgLatest("1001", { fetcher })).rejects.toThrow(
      "localgvg/latest JSON parse failed"
    );
  });

  it("throws when API envelope status is not successful", async () => {
    const fetcher: LocalGvgFetcher = async () =>
      createMockResponse({
        json: () => Promise.resolve({ status: 503, timestamp: 1779880536, data: null })
      });

    await expect(fetchLocalGvgLatest("1001", { fetcher })).rejects.toMatchObject({
      name: "LocalGvgApiError",
      status: 503
    });
  });
});
