import { describe, expect, it } from "vitest";
import { getAppModePermissions, resolveAppMode, resolveRoute } from "./appMode";

describe("resolveAppMode", () => {
  it.each([
    ["/", "owner"],
    ["/123/a_abc", "admin"],
    ["/123/g_abc", "guest"],
    ["/app", null],
    ["/app/", null],
    ["/invalid", null],
    ["/guildId/accessKey", null]
  ] as const)("resolves %s to %s", (pathname, expectedMode) => {
    expect(resolveAppMode(pathname)).toBe(expectedMode);
  });
});

describe("resolveRoute", () => {
  it.each([
    ["/", { mode: "owner" }],
    ["/123/a_abc", { mode: "admin", guildId: "123", accessKey: "a_abc" }],
    ["/123/g_abc", { mode: "guest", guildId: "123", accessKey: "g_abc" }],
    ["/app", null],
    ["/app/", null],
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

describe("getAppModePermissions", () => {
  it("allows all owner settings and editing", () => {
    expect(getAppModePermissions("owner")).toEqual({
      canEditAlertSettings: true,
      canEditBattleState: true,
      canEditViewSettings: true,
      showAlertSettings: true,
      showNotificationSettings: true,
      showOwnedGuildSettings: true,
      showShareSettings: true
    });
  });

  it("allows admin editing without owner-only settings", () => {
    expect(getAppModePermissions("admin")).toEqual({
      canEditAlertSettings: true,
      canEditBattleState: true,
      canEditViewSettings: true,
      showAlertSettings: true,
      showNotificationSettings: true,
      showOwnedGuildSettings: false,
      showShareSettings: false
    });
  });

  it("keeps guest battle state read-only while allowing personal view settings", () => {
    expect(getAppModePermissions("guest")).toEqual({
      canEditAlertSettings: true,
      canEditBattleState: false,
      canEditViewSettings: true,
      showAlertSettings: true,
      showNotificationSettings: false,
      showOwnedGuildSettings: false,
      showShareSettings: false
    });
  });
});
