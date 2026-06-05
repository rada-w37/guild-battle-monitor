// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModeProvider } from "../../app/appMode";
import type { AuthState } from "../auth/types";
import type { GuildShare, OwnedGuildProfile } from "../guildBattle/types";
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
  container?.remove();
  container = null;
  root = null;
});

describe("FirebasePhase0App owned guild profile persistence", () => {
  it("shows the signed-in owner display name in the header", async () => {
    await renderApp(
      "/app",
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

  it.each(["/saved-guild/a_abc", "/saved-guild/g_abc"])(
    "shows the saved guild name for shared routes when the guild matches: %s",
    async (pathname) => {
      const loadProfile = vi.fn(() => Promise.resolve(createProfile()));

      await renderApp(pathname, signedInState, loadProfile, vi.fn());

      expect(loadProfile).toHaveBeenCalledWith("owner-uid");
      expect(document.querySelector(".firebase-auth-status")?.textContent).toBe("Saved Guild");
      expect(document.body.textContent).not.toContain("saved-guild");
    }
  );

  it("leaves the shared route header blank when the saved guild does not match", async () => {
    await renderApp("/other-guild/a_abc", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());

    expect(document.querySelector(".firebase-auth-status")).toBeNull();
    expect(document.body.textContent).not.toContain("Saved Guild");
    expect(document.body.textContent).not.toContain("other-guild");
  });

  it("restores the owner profile without saving it again", async () => {
    const profile = createProfile();
    const loadProfile = vi.fn(() => Promise.resolve(profile));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/app", signedInState, loadProfile, saveProfile);
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

    await renderApp("/app", signedInState, loadProfile, saveProfile);
    await openOwnedGuildSettings();

    await changeWorld("38");
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenLastCalledWith("owner-uid", {
      worldId: 38,
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

    await renderApp("/app", signedInState, loadProfile, saveProfile);
    await openOwnedGuildSettings();
    await changeGuild("");

    expect(saveProfile).toHaveBeenCalledWith("owner-uid", {
      worldId: 37,
      guildId: null,
      guildName: null
    });
  });

  it.each(["/123/a_abc", "/123/g_abc"])("loads a profile for the shared header without saving it: %s", async (pathname) => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp(pathname, signedInState, loadProfile, saveProfile);
    await openSettings();

    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(loadProfile).toHaveBeenCalledWith("owner-uid");
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("keeps the owner UI local and does not save while signed out", async () => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp("/app", { status: "signed-out" }, loadProfile, saveProfile);
    await openOwnedGuildSettings();
    await changeWorld("37");

    expect(loadProfile).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(document.querySelector(".owned-guild-settings")).not.toBeNull();
  });
});

describe("FirebasePhase0App guild share settings", () => {
  it("shows owner share settings collapsed and generates URLs after guild setup", async () => {
    const loadShare = vi.fn(() => Promise.resolve(null));
    const saveShare = createSaveShareMock();

    await renderApp("/app", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn(), loadShare, saveShare);
    await openSettings();

    const settings = getShareSettings();
    expect(settings.open).toBe(false);
    await openDetails(settings);

    expect(saveShare).toHaveBeenCalledTimes(1);
    const savedShare = saveShare.mock.calls[0][1];
    expect(savedShare.guildId).toBe("saved-guild");
    expect(savedShare.adminAccessKey).toMatch(/^a_/);
    expect(savedShare.guestAccessKey).toMatch(/^g_/);
    expect(getShareUrlInputs().map((input) => input.value)).toEqual([
      `${window.location.origin}/saved-guild/${savedShare.adminAccessKey}`,
      `${window.location.origin}/saved-guild/${savedShare.guestAccessKey}`
    ]);
  });

  it("regenerates access keys when the saved share belongs to another guild", async () => {
    const previousShare = createShare("old-guild");
    const saveShare = createSaveShareMock();

    await renderApp(
      "/app",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(previousShare)),
      saveShare
    );
    await openSettings();
    await openDetails(getShareSettings());

    const nextShare = saveShare.mock.calls[0][1];
    expect(nextShare.guildId).toBe("saved-guild");
    expect(nextShare.adminAccessKey).not.toBe(previousShare.adminAccessKey);
    expect(nextShare.guestAccessKey).not.toBe(previousShare.guestAccessKey);
  });

  it("copies a generated shared URL", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await renderApp(
      "/app",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(createShare("saved-guild"))),
      vi.fn()
    );
    await openSettings();
    await openDetails(getShareSettings());

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
      "/app",
      signedInState,
      vi.fn(() => Promise.resolve({ worldId: 37, guildId: null, guildName: null })),
      vi.fn(),
      loadShare,
      saveShare
    );
    await openSettings();
    await openDetails(getShareSettings());

    expect(getShareSettings().textContent).toContain("所属ギルドを設定してください");
    expect(loadShare).not.toHaveBeenCalled();
    expect(saveShare).not.toHaveBeenCalled();
    expect(getShareUrlInputs()).toHaveLength(0);
  });

  it.each(["/123/a_abc", "/123/g_abc"])("hides share settings outside owner mode: %s", async (pathname) => {
    await renderApp(pathname, signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openSettings();

    expect(document.querySelector(".share-settings")).toBeNull();
  });
});

async function renderApp(
  pathname: string,
  authState: AuthState,
  loadProfile: (uid: string) => Promise<OwnedGuildProfile | null>,
  saveProfile: (uid: string, profile: OwnedGuildProfile) => Promise<void>,
  loadShare: (uid: string) => Promise<GuildShare | null> = vi.fn(() => Promise.resolve(null)),
  saveShare: (uid: string, share: GuildShare) => Promise<void> = vi.fn(() => Promise.resolve())
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
          saveGuildShare={saveShare}
          saveOwnedGuildProfile={saveProfile}
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
  const settings = document.querySelector<HTMLDetailsElement>(".share-settings");

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
    worldId: 37,
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
