// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModeProvider } from "../../app/appMode";
import type { AuthState } from "../auth/types";
import type { OwnedGuildProfile } from "../guildBattle/types";
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

  it.each(["/123/a_abc", "/123/g_abc"])("does not load or save a profile outside owner mode: %s", async (pathname) => {
    const loadProfile = vi.fn(() => Promise.resolve(createProfile()));
    const saveProfile = vi.fn(() => Promise.resolve());

    await renderApp(pathname, signedInState, loadProfile, saveProfile);
    await openSettings();

    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(loadProfile).not.toHaveBeenCalled();
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
    expect(document.querySelector(".owned-guild-settings")?.textContent).toContain("ログインすると保存されます");
  });
});

async function renderApp(
  pathname: string,
  authState: AuthState,
  loadProfile: (uid: string) => Promise<OwnedGuildProfile | null>,
  saveProfile: (uid: string, profile: OwnedGuildProfile) => Promise<void>
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <AppModeProvider pathname={pathname}>
        <FirebasePhase0App
          loadOwnedGuildProfile={loadProfile}
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

  await act(async () => {
    settings.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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

function createProfile(): OwnedGuildProfile {
  return {
    worldId: 37,
    guildId: "saved-guild",
    guildName: "Saved Guild"
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
