import { describe, expect, it } from "vitest";
import { resolveAppMode } from "./appMode";

describe("resolveAppMode", () => {
  it.each([
    ["/app", "owner"],
    ["/app/", "owner"],
    ["/", null],
    ["/invalid", null],
    ["/guildId/accessKey", null]
  ] as const)("resolves %s to %s", (pathname, expectedMode) => {
    expect(resolveAppMode(pathname)).toBe(expectedMode);
  });
});
