import { describe, expect, it } from "vitest";
import { resolveAppMode, resolveRoute } from "./appMode";

describe("resolveAppMode", () => {
  it.each([
    ["/app", "owner"],
    ["/app/", "owner"],
    ["/123/a_abc", "admin"],
    ["/123/g_abc", "guest"],
    ["/", null],
    ["/invalid", null],
    ["/guildId/accessKey", null]
  ] as const)("resolves %s to %s", (pathname, expectedMode) => {
    expect(resolveAppMode(pathname)).toBe(expectedMode);
  });
});

describe("resolveRoute", () => {
  it.each([
    ["/app", { mode: "owner" }],
    ["/app/", { mode: "owner" }],
    ["/123/a_abc", { mode: "admin", guildId: "123", accessKey: "a_abc" }],
    ["/123/g_abc", { mode: "guest", guildId: "123", accessKey: "g_abc" }],
    ["/", null],
    ["/invalid", null],
    ["/app/test", null],
    ["/123", null],
    ["/123/abc", null],
    ["/123/x_abc", null],
    ["/123/a_abc/extra", null]
  ] as const)("resolves %s", (pathname, expectedRoute) => {
    expect(resolveRoute(pathname)).toEqual(expectedRoute);
  });
});
