import { describe, expect, it } from "vitest";
import {
  getAppModePermissions,
  getFirebasePermissionsOverride,
  resolveAppMode,
  resolveRoute,
  stripGithubPagesBasePath
} from "./appMode";

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
    ["/guild-battle-monitor", { mode: "owner" }],
    ["/guild-battle-monitor/", { mode: "owner" }],
    ["/123/a_abc", { mode: "admin", guildId: "123", accessKey: "a_abc" }],
    ["/123/g_abc", { mode: "guest", guildId: "123", accessKey: "g_abc" }],
    ["/guild-battle-monitor/123/a_abc", { mode: "admin", guildId: "123", accessKey: "a_abc" }],
    ["/guild-battle-monitor/123/g_abc", { mode: "guest", guildId: "123", accessKey: "g_abc" }],
    ["/app", null],
    ["/app/", null],
    ["/guild-battle-monitor/app", null],
    ["/guild-battle-monitor/app/", null],
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

describe("stripGithubPagesBasePath", () => {
  it.each([
    ["/guild-battle-monitor", "/"],
    ["/guild-battle-monitor/", "/"],
    ["/guild-battle-monitor/123/a_abc", "/123/a_abc"],
    ["/", "/"],
    ["/123/a_abc", "/123/a_abc"],
    ["/another-base/123/a_abc", "/another-base/123/a_abc"]
  ] as const)("normalizes %s to %s", (pathname, expectedPathname) => {
    expect(stripGithubPagesBasePath(pathname)).toBe(expectedPathname);
  });
});

describe("getAppModePermissions", () => {
  it("allows all owner settings and editing", () => {
    expect(getAppModePermissions("owner")).toEqual({
      canEditAlertSettings: true,
      canEditBattleState: true,
      canEditViewSettings: true,
      canManageGuildProfile: true,
      canManageNotifications: true,
      canManageShareUrls: true,
      canPersistViewSettings: true,
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
      canManageGuildProfile: false,
      canManageNotifications: true,
      canManageShareUrls: false,
      canPersistViewSettings: false,
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
      canManageGuildProfile: false,
      canManageNotifications: false,
      canManageShareUrls: false,
      canPersistViewSettings: false,
      showAlertSettings: true,
      showNotificationSettings: false,
      showOwnedGuildSettings: false,
      showShareSettings: false
    });
  });
});

describe("getFirebasePermissionsOverride", () => {
  it("returns a stable signed-out owner override", () => {
    const firstOverride = getFirebasePermissionsOverride({ isSignedInOwner: false, mode: "owner" });
    const secondOverride = getFirebasePermissionsOverride({ isSignedInOwner: false, mode: "owner" });

    expect(firstOverride).toBe(secondOverride);
    expect(firstOverride).toEqual({
      canEditBattleState: false,
      canManageGuildProfile: false,
      canManageNotifications: false,
      canManageShareUrls: false,
      canPersistViewSettings: false,
      showNotificationSettings: false,
      showOwnedGuildSettings: false,
      showShareSettings: false
    });
  });

  it.each(["owner", "admin", "guest"] as const)(
    "does not override permissions for signed-in or shared mode: %s",
    (mode) => {
      expect(getFirebasePermissionsOverride({ isSignedInOwner: true, mode })).toBeUndefined();
      expect(getFirebasePermissionsOverride({ isSignedInOwner: false, mode })).toBe(
        mode === "owner" ? getFirebasePermissionsOverride({ isSignedInOwner: false, mode: "owner" }) : undefined
      );
    }
  );
});
