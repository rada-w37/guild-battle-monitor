// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModeProvider } from "../../app/appMode";
import type { AuthState } from "../auth/types";
import type { GuildShare, OwnedGuildProfile, PublicGuildShare } from "../guildBattle/types";
import { GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY } from "../guildBattle/viewSettingsStorage";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { FirebasePhase0App } from "./FirebasePhase0App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedInState = {
  status: "signed-in",
  user: {
    uid: "owner-uid",
    displayName: "Owner",
    email: "owner@example.com",
    photoUrl: ""
  }
} satisfies AuthState;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  window.localStorage.clear();
  container?.remove();
  container = null;
  root = null;
});

describe("FirebasePhase0App owned guild profile persistence", () => {
  it("shows the signed-in owner display name in the header", async () => {
    await renderApp(
      "/",
      {
        status: "signed-in",
        user: {
          ...signedInState.user,
          displayName: "驥第｣ｮ豬ｩ蟷ｳ"
        }
      },
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn()
    );

    expect(document.querySelector(".firebase-auth-user")?.textContent).toContain("驥第｣ｮ豬ｩ蟷ｳ");
  });

  it.each(["/saved-guild/a_admin", "/saved-guild/g_guest"])(
    "shows the public guild name for shared routes when the access key matches: %s",
    async (pathname) => {
      const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
      const loadPublicShare = vi.fn(() => Promise.resolve(createPublicShare()));

      await renderApp(pathname, signedInState, loadProfile, vi.fn(), undefined, undefined, loadPublicShare);

      expect(loadProfile).not.toHaveBeenCalled();
      expect(loadPublicShare).toHaveBeenCalledWith("saved-guild");
      expect(document.querySelector(".firebase-auth-status")?.textContent).toBe("Saved Guild");
      expect(document.body.textContent).not.toContain("saved-guild");
    }
  );

  it("falls back to the normal view when the shared access key does not match", async () => {
    await renderApp(
      "/saved-guild/a_invalid",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      vi.fn(() => Promise.resolve(createPublicShare()))
    );

    expect(document.body.textContent).toContain("Guild Battle Monitor");
    expect(document.body.textContent).not.toContain("Saved Guild");
    expect(document.querySelector(".firebase-auth-status")).toBeNull();
  });

  it("falls back to the normal view when the public shared guild document is missing", async () => {
    const loadPublicShare = vi.fn(() => Promise.resolve(null));

    await renderApp(
      "/missing-guild/g_missing",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      loadPublicShare
    );

    expect(loadPublicShare).toHaveBeenCalledWith("missing-guild");
    expect(document.body.textContent).toContain("Guild Battle Monitor");
    expect(document.querySelector(".firebase-auth-status")).toBeNull();
  });

  it("keeps owner-only settings hidden and display guild selection editable in fallback mode", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(createGvgSnapshotWithGuilds()));

    await renderApp(
      "/missing-guild/g_missing",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      vi.fn(() => Promise.resolve(null)),
      undefined,
      loadSnapshot
    );
    await openSettings();

    expect(document.querySelector(".notification-settings")).toBeNull();
    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(document.querySelector(".share-settings")).toBeNull();
    expect(document.querySelector(".alert-settings")).not.toBeNull();

    await loadMonitorWorld("37");

    const guildSelect = getMonitorGuildSelect();
    expect(guildSelect.disabled).toBe(false);
    await changeMonitorGuild("guild-a");
    expect(guildSelect.value).toBe("guild-a");
  });

  it("restores the owner profile without saving it again", async () => {
    const profile = createProfile();
    const loadProfile = vi.fn(() => Promise.resolve(profile));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/", signedInState, loadProfile, saveProfile);
    await openOwnedGuildSettings();

    expect(loadProfile).toHaveBeenCalledWith("owner-uid");
    expect(getOwnedGuildWorldInput().value).toBe("37");
    expect(getOwnedGuildSelect().value).toBe(profile.guildId);
    expect(getOwnedGuildSelect().selectedOptions[0]?.textContent).toBe(profile.guildName);
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("saves a cleared guild once when the owner changes world", async () => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/", signedInState, loadProfile, saveProfile);
    await openOwnedGuildSettings();

    await changeWorld("38");
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenLastCalledWith("owner-uid", {
      world: 38,
      guildId: null,
      guildName: null
    });
    expect(getOwnedGuildSelect().value).toBe("");

    await changeWorld("38");
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it("saves a guild selection change", async () => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/", signedInState, loadProfile, saveProfile);
    await openOwnedGuildSettings();
    await changeGuild("");

    expect(saveProfile).toHaveBeenCalledWith("owner-uid", {
      world: 37,
      guildId: null,
      guildName: null
    });
  });

  it("shows an error when owned guild profile save fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const saveProfile = vi.fn(() => Promise.reject(new Error("profile write failed")));

    try {
      await renderApp(
        "/",
        signedInState,
        vi.fn(() => Promise.resolve(null)),
        saveProfile,
        undefined,
        undefined,
        undefined,
        undefined,
        vi.fn(() => Promise.resolve(createGvgSnapshotWithGuilds()))
      );
      await openOwnedGuildSettings();
      await changeWorld("37");

      expect(saveProfile).toHaveBeenCalledWith("owner-uid", {
        world: 37,
        guildId: null,
        guildName: null
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to save users/{uid}/guild/profile.",
        expect.any(Error)
      );
      expect(document.body.textContent).toContain("所属ギルド設定の保存に失敗");
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each(["/123/a_admin", "/123/g_guest"])("does not load or save owner profile outside owner mode: %s", async (pathname) => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp(pathname, signedInState, loadProfile, saveProfile);

    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("keeps the owner UI local and does not save while signed out", async () => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/", { status: "signed-out" }, loadProfile, saveProfile);
    await openSettings();

    expect(document.querySelector(".notification-settings")).toBeNull();
    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(document.querySelector(".share-settings")).toBeNull();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();

    await loadMonitorWorld("37");
    expect(document.querySelector<HTMLInputElement>(".field__input--world")?.value).toBe("37");
    expect(window.localStorage.getItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(saveProfile).not.toHaveBeenCalled();
  });
});

describe("FirebasePhase0App guild share settings", () => {
  it("shows owner share settings collapsed and generates URLs after guild setup", async () => {
    const loadShare = vi.fn(() => Promise.resolve(null));
    const saveShare = createSaveShareMock();
    const savePublicShare = createSavePublicShareMock();

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      loadShare,
      saveShare,
      undefined,
      savePublicShare
    );
    await openSettings();

    const settings = document.querySelector<HTMLDetailsElement>(".owned-guild-settings");
    if (!settings) {
      throw new Error("owned guild settings were not found");
    }
    expect(settings.open).toBe(false);
    await openDetails(settings);
    expect(getShareSettings()).not.toBeNull();
    expect(document.querySelector(".share-settings")).toBeNull();

    expect(saveShare).toHaveBeenCalledTimes(1);
    const savedShare = saveShare.mock.calls[0][1];
    expect(savedShare.guildId).toBe("saved-guild");
    expect(savedShare.adminAccessKey).toMatch(/^a_/);
    expect(savedShare.guestAccessKey).toMatch(/^g_/);
    expect(getShareUrlInputs().map((input) => input.value)).toEqual([
      `${window.location.origin}/saved-guild/${savedShare.adminAccessKey}`,
      `${window.location.origin}/saved-guild/${savedShare.guestAccessKey}`
    ]);
    expect(savePublicShare).toHaveBeenCalledWith("saved-guild", {
      world: 37,
      guildName: "Saved Guild",
      adminAccessKey: savedShare.adminAccessKey,
      guestAccessKey: savedShare.guestAccessKey
    });
    expect(savePublicShare.mock.calls[0][1]).not.toHaveProperty("ownerUid");
    expect(savePublicShare.mock.calls[0][1]).not.toHaveProperty("guildId");
  });

  it("regenerates access keys when the saved share belongs to another guild", async () => {
    const previousShare = createShare("old-guild");
    const saveShare = createSaveShareMock();

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(previousShare)),
      saveShare
    );
    await openOwnedGuildSettings();

    const nextShare = saveShare.mock.calls[0][1];
    expect(nextShare.guildId).toBe("saved-guild");
    expect(nextShare.adminAccessKey).not.toBe(previousShare.adminAccessKey);
    expect(nextShare.guestAccessKey).not.toBe(previousShare.guestAccessKey);
  });

  it("shows an error when users/{uid}/guild/share generation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const saveShare = vi.fn(() => Promise.reject(new Error("share write failed")));

    try {
      await renderApp(
        "/",
        signedInState,
        vi.fn(() => Promise.resolve(createProfile())),
        vi.fn(),
        vi.fn(() => Promise.resolve(null)),
        saveShare
      );
      await openOwnedGuildSettings();

      expect(saveShare).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to save users/{uid}/guild/share.",
        expect.any(Error)
      );
      expect(getShareSettings().textContent).toContain("共有URLの生成に失敗");
      expect(getShareSettings().textContent).not.toContain("共有URLを生成中です");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("shows an error when guildShares/{guildId} save fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const savePublicShare = vi.fn(() => Promise.reject(new Error("public share write failed")));

    try {
      await renderApp(
        "/",
        signedInState,
        vi.fn(() => Promise.resolve(createProfile())),
        vi.fn(),
        vi.fn(() => Promise.resolve(createShare("saved-guild"))),
        vi.fn(),
        undefined,
        savePublicShare
      );
      await openOwnedGuildSettings();

      expect(savePublicShare).toHaveBeenCalledWith("saved-guild", {
        world: 37,
        guildName: "Saved Guild",
        adminAccessKey: "a_admin",
        guestAccessKey: "g_guest"
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to save guildShares/{guildId}.",
        expect.any(Error)
      );
      expect(getShareSettings().textContent).toContain("共有URLの生成に失敗");
      expect(getShareSettings().textContent).not.toContain("共有URLを生成中です");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("copies a generated shared URL", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(createShare("saved-guild"))),
      vi.fn()
    );
    await openOwnedGuildSettings();

    const copyButton = Array.from(getShareSettings().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "コピー"
    );

    if (!copyButton) {
      throw new Error("copy button was not found");
    }

    await act(async () => {
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/saved-guild/a_admin`);
    expect(getShareSettings().textContent).toContain("コピーしました");
  });

  it("does not generate a share when guild is not configured", async () => {
    const loadShare = vi.fn(() => Promise.resolve(null));
    const saveShare = createSaveShareMock();

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve({ world: 37,
      guildId: null, guildName: null })),
      vi.fn(),
      loadShare,
      saveShare
    );
    await openOwnedGuildSettings();

    expect(getShareSettings().textContent).toContain("所属ギルドを設定してください");
    expect(loadShare).not.toHaveBeenCalled();
    expect(saveShare).not.toHaveBeenCalled();
    expect(getShareUrlInputs()).toHaveLength(0);
  });

  it.each(["/123/a_admin", "/123/g_guest"])("hides share settings outside owner mode: %s", async (pathname) => {
    await renderApp(pathname, signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());

    expect(document.querySelector(".share-settings")).toBeNull();
  });
});

async function renderApp(
  pathname: string,
  authState: AuthState,
  loadProfile: (uid: string) => Promise<OwnedGuildProfile | null>,
  saveProfile: (uid: string, profile: OwnedGuildProfile) => Promise<void>,
  loadShare: (uid: string) => Promise<GuildShare | null> = vi.fn(() => Promise.resolve(null)),
  saveShare: (uid: string, share: GuildShare) => Promise<void> = vi.fn(() => Promise.resolve()),
  loadPublicShare: (guildId: string) => Promise<PublicGuildShare | null> = vi.fn(() => Promise.resolve(createPublicShare())),
  savePublicShare: (guildId: string, share: PublicGuildShare) => Promise<void> = vi.fn(() => Promise.resolve()),
  loadSnapshot: typeof loadLocalGvgSnapshot = vi.fn(() => Promise.resolve(createGvgSnapshot()))
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <AppModeProvider pathname={pathname}>
        <FirebasePhase0App
          loadGuildShare={loadShare}
          loadOwnedGuildProfile={loadProfile}
          loadPublicGuildShare={loadPublicShare}
          loadSnapshot={loadSnapshot}
          saveGuildShare={saveShare}
          saveOwnedGuildProfile={saveProfile}
          savePublicGuildShare={savePublicShare}
          subscribeToAuthState={(onStateChanged) => {
            onStateChanged(authState);
            return () => {};
          }}
        />
      </AppModeProvider>
    );
    await flushPromises();
  });
}

async function openOwnedGuildSettings() {
  await openSettings();
  const settings = document.querySelector<HTMLDetailsElement>(".owned-guild-settings");

  if (!settings) {
    throw new Error("owned guild settings were not found");
  }

  await openDetails(settings);
}

async function openSettings() {
  const button = document.querySelector<HTMLButtonElement>(".settings-button");

  if (!button) {
    throw new Error("settings button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeWorld(worldId: string) {
  await act(async () => {
    const input = getOwnedGuildWorldInput();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, worldId);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
  });
}

async function changeGuild(guildId: string) {
  await act(async () => {
    const select = getOwnedGuildSelect();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    valueSetter?.call(select, guildId);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();
  });
}

async function loadMonitorWorld(world: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(".field__input--world");
    const form = document.querySelector<HTMLFormElement>(".startup-panel");
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    if (!input || !form) {
      throw new Error("monitor world form was not found");
    }

    valueSetter?.call(input, world);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
  });
}

async function changeMonitorGuild(guildId: string) {
  await act(async () => {
    const select = getMonitorGuildSelect();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    valueSetter?.call(select, guildId);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();
  });
}

function getMonitorGuildSelect() {
  const select = document.querySelector<HTMLSelectElement>(".guild-select-field select");

  if (!select) {
    throw new Error("monitor guild select was not found");
  }

  return select;
}

function getOwnedGuildWorldInput() {
  const input = document.querySelector<HTMLInputElement>(".owned-guild-settings input");

  if (!input) {
    throw new Error("owned guild world input was not found");
  }

  return input;
}

function getOwnedGuildSelect() {
  const select = document.querySelector<HTMLSelectElement>(".owned-guild-settings select");

  if (!select) {
    throw new Error("owned guild select was not found");
  }

  return select;
}

function getShareSettings() {
  const settings = document.querySelector<HTMLElement>(".owned-guild-settings__share");

  if (!settings) {
    throw new Error("share settings were not found");
  }

  return settings;
}

function getShareUrlInputs() {
  return Array.from(getShareSettings().querySelectorAll<HTMLInputElement>("input[type='url']"));
}

async function openDetails(details: HTMLDetailsElement) {
  await act(async () => {
    details.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

function createProfile(): OwnedGuildProfile {
  return {
    world: 37,
    guildId: "saved-guild",
    guildName: "Saved Guild"
  };
}

function createShare(guildId: string): GuildShare {
  return {
    guildId,
    adminAccessKey: "a_admin",
    guestAccessKey: "g_guest"
  };
}

function createSaveShareMock() {
  return vi.fn<(uid: string, share: GuildShare) => Promise<void>>(() => Promise.resolve());
}

function createPublicShare(): PublicGuildShare {
  return {
    world: 37,
    guildName: "Saved Guild",
    adminAccessKey: "a_admin",
    guestAccessKey: "g_guest"
  };
}

function createGvgSnapshot(): GvgSnapshot {
  return {
    worldId: "1037" as GvgWorldId,
    capturedAt: "2026-05-27T11:15:36.000Z",
    guildNames: {},
    castles: []
  };
}

function createGvgSnapshotWithGuilds(): GvgSnapshot {
  return {
    worldId: "1037" as GvgWorldId,
    capturedAt: "2026-05-27T11:15:36.000Z",
    guildNames: {
      ["guild-a" as GvgGuildId]: "Guild A",
      ["guild-b" as GvgGuildId]: "Guild B"
    },
    castles: [
      {
        castleId: "1" as GvgCastleId,
        worldId: "1037" as GvgWorldId,
        state: "idle",
        status: "normal",
        ownerGuildId: "guild-a" as GvgGuildId,
        attackerGuildId: null,
        defenseCount: 10,
        attackCount: 0,
        fallenAt: null,
        lastWinPartyKnockOutCount: 0,
        updatedAt: "2026-05-27T11:15:36.000Z"
      },
      {
        castleId: "2" as GvgCastleId,
        worldId: "1037" as GvgWorldId,
        state: "idle",
        status: "normal",
        ownerGuildId: "guild-b" as GvgGuildId,
        attackerGuildId: null,
        defenseCount: 8,
        attackCount: 0,
        fallenAt: null,
        lastWinPartyKnockOutCount: 0,
        updatedAt: "2026-05-27T11:15:36.000Z"
      }
    ]
  };
}

function createSavePublicShareMock() {
  return vi.fn<(guildId: string, share: PublicGuildShare) => Promise<void>>(() => Promise.resolve());
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
