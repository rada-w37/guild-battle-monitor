// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModeProvider } from "../../app/appMode";
import type { AuthState } from "../auth/types";
import type { GuildShare, OwnedGuildProfile } from "../guildBattle/types";
import { GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY } from "../guildBattle/viewSettingsStorage";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import type {
  NotificationBattleType,
  NotificationDestination,
  NotificationRule,
  NotificationRuleV2,
  NotificationRuleV2Input
} from "./types";
import { NotificationSettingsDialog } from "./NotificationSettingsDialog";

vi.mock("../auth/authService", () => ({
  signInWithGoogle: () => Promise.resolve(),
  signOutCurrentUser: () => Promise.resolve(),
  subscribeToAuthState: () => () => {}
}));

vi.mock("../guildBattle/guildShareFunctionsRepository", () => ({
  getOwnerGuildShare: () =>
    Promise.resolve({
      exists: true,
      guildId: "saved-guild",
      world: 37,
      guildName: "Saved Guild",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    }),
  saveOwnerGuildShare: () =>
    Promise.resolve({
      guildId: "saved-guild",
      world: 37,
      guildName: "Saved Guild",
      adminAccessKey: "a_admin",
      guestAccessKey: "g_guest"
    }),
  verifyGuildShareAccess: () =>
    Promise.resolve({
      role: "admin",
      guildId: "saved-guild",
      world: 37,
      guildName: "Saved Guild"
    })
}));

vi.mock("../guildBattle/ownedGuildProfileRepository", () => ({
  loadOwnedGuildProfile: () => Promise.resolve(null),
  saveOwnedGuildProfile: () => Promise.resolve()
}));

vi.mock("../guildBattle/GuildBattlePlaceholder", async () => {
  const React = await import("react");

  return {
    GuildBattlePlaceholder: ({
      headerActions,
      modeOverride,
      notificationSettings,
      notificationSettingsDialog,
      ownedGuildProfilePersistence,
      permissionsOverride,
      settingsDraftExternal,
      shareSettings,
      sharedGuild
    }: {
      readonly headerActions?: React.ReactNode;
      readonly modeOverride?: "guest";
      readonly notificationSettings?: React.ReactNode;
      readonly notificationSettingsDialog?:
        | React.ReactNode
        | ((activeBattleType: "guildBattle" | "grandBattle") => React.ReactNode);
      readonly ownedGuildProfilePersistence?: {
        readonly error: string | null;
        readonly profile: OwnedGuildProfile | null;
        readonly onSave?: (profile: OwnedGuildProfile) => Promise<boolean>;
      };
      readonly permissionsOverride?: {
        readonly showNotificationSettings?: boolean;
        readonly showOwnedGuildSettings?: boolean;
        readonly showShareSettings?: boolean;
      };
      readonly settingsDraftExternal?: {
        readonly onSave: () => Promise<boolean>;
      };
      readonly shareSettings?: React.ReactNode;
      readonly sharedGuild?: { readonly mode: "admin" | "guest" } | null;
    }) => {
      const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
      const [monitorGuildId, setMonitorGuildId] = React.useState("");
      const [draftProfile, setDraftProfile] = React.useState<OwnedGuildProfile>({
        world: ownedGuildProfilePersistence?.profile?.world ?? null,
        guildId: ownedGuildProfilePersistence?.profile?.guildId ?? null,
        guildName: ownedGuildProfilePersistence?.profile?.guildName ?? null
      });
      const ownerSettingsVisible =
        modeOverride !== "guest" &&
        permissionsOverride?.showOwnedGuildSettings !== false &&
        sharedGuild === null;
      const notificationSettingsVisible =
        modeOverride !== "guest" &&
        permissionsOverride?.showNotificationSettings !== false &&
        notificationSettings !== undefined &&
        (sharedGuild === null || sharedGuild?.mode === "admin");

      React.useEffect(() => {
        setDraftProfile({
          world: ownedGuildProfilePersistence?.profile?.world ?? null,
          guildId: ownedGuildProfilePersistence?.profile?.guildId ?? null,
          guildName: ownedGuildProfilePersistence?.profile?.guildName ?? null
        });
      }, [ownedGuildProfilePersistence?.profile]);

      async function handleSave() {
        const persistedProfile = ownedGuildProfilePersistence?.profile ?? null;
        const hasProfileChange =
          draftProfile.world !== (persistedProfile?.world ?? null) ||
          draftProfile.guildId !== (persistedProfile?.guildId ?? null) ||
          draftProfile.guildName !== (persistedProfile?.guildName ?? null);

        if (hasProfileChange) {
          await ownedGuildProfilePersistence?.onSave?.(draftProfile);
          return;
        }

        await settingsDraftExternal?.onSave();
      }

      return (
        <main>
          <header>
            <h1>Guild Battle Monitor</h1>
            {headerActions}
            <button className="settings-button" type="button" onClick={() => setIsSettingsOpen(true)}>
              Settings
            </button>
          </header>
          <form className="startup-panel">
            <input className="field__input--world" />
          </form>
          <label className="guild-select-field">
            <select
              value={monitorGuildId}
              onChange={(event) => setMonitorGuildId(event.currentTarget.value)}
            >
              <option value="">Select guild</option>
              <option value="guild-a">Guild A</option>
              <option value="guild-b">Guild B</option>
            </select>
          </label>
          {isSettingsOpen ? (
            <section className="settings-dialog">
              <div className="alert-settings" />
              {ownerSettingsVisible ? (
                <details className="settings-section owned-guild-settings">
                  <summary>Owned guild</summary>
                  <input
                    value={draftProfile.world ?? ""}
                    onInput={(event) =>
                      setDraftProfile({
                        world: Number(event.currentTarget.value),
                        guildId: null,
                        guildName: null
                      })
                    }
                  />
                  <select
                    value={draftProfile.guildId ?? ""}
                    onChange={(event) =>
                      setDraftProfile({
                        world: draftProfile.world,
                        guildId: event.currentTarget.value || null,
                        guildName: event.currentTarget.value === "saved-guild" ? "Saved Guild" : null
                      })
                    }
                  >
                    <option value="">No guild</option>
                    <option value="saved-guild">Saved Guild</option>
                  </select>
                  {ownedGuildProfilePersistence?.error !== null &&
                  ownedGuildProfilePersistence?.error !== undefined ? (
                    <p className="firebase-message firebase-message--error">
                      {ownedGuildProfilePersistence.error}
                    </p>
                  ) : null}
                  {shareSettings !== undefined ? (
                    <div className="owned-guild-settings__share">{shareSettings}</div>
                  ) : null}
                </details>
              ) : null}
              {notificationSettingsVisible ? (
                <details className="settings-section notification-settings">
                  <summary>Notifications</summary>
                  {notificationSettings}
                </details>
              ) : null}
              <div className="settings-dialog__actions">
                <button type="button" onClick={() => void handleSave()}>
                  Save
                </button>
              </div>
            </section>
          ) : null}
          {typeof notificationSettingsDialog === "function"
            ? notificationSettingsDialog("guildBattle")
            : notificationSettingsDialog}
        </main>
      );
    }
  };
});

vi.mock("../koMonitor/koObserverRepository", () => ({
  loadKoGuildKoTotals: () => Promise.resolve([]),
  loadKoObserverRunMeta: () => Promise.resolve(null),
  subscribeKoGuildKoTotals: () => () => {}
}));

vi.mock("../koMonitor/koObserverTime", () => ({
  getNextKoObserverReadBoundary: () => null,
  isKoObserverStartedForToday: () => false,
  shouldUseKoObserverRealtime: () => false
}));

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

beforeEach(() => {
  vi.stubGlobal("setInterval", vi.fn(() => 1));
  vi.stubGlobal("clearInterval", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network request in FirebasePhase0App.test.tsx")))
  );
});

afterEach(() => {
  act(() => root?.unmount());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
      const verifyShareAccess = vi.fn((input: { readonly accessKey: string }) =>
        Promise.resolve(createSharedAccessResult(input.accessKey === "g_guest" ? "viewer" : "admin"))
      );

      await renderApp(pathname, signedInState, loadProfile, vi.fn(), undefined, undefined, verifyShareAccess);

      expect(loadProfile).not.toHaveBeenCalled();
      expect(verifyShareAccess).toHaveBeenCalledWith({
        guildId: "saved-guild",
        accessKey: pathname.endsWith("g_guest") ? "g_guest" : "a_admin"
      });
      expect(document.querySelector(".firebase-auth-status")?.textContent).toBe("W37 : Saved Guild");
      expect(document.body.textContent).not.toContain("saved-guild");
    }
  );

  it("does not reload the public shared guild when the admin route rerenders", async () => {
    const verifyShareAccess = vi.fn(() => Promise.resolve(createSharedAccessResult("admin")));
    const renderedApp = await renderApp(
      "/saved-guild/a_admin",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      verifyShareAccess
    );

    expect(verifyShareAccess).toHaveBeenCalledTimes(1);

    await renderedApp.rerender();

    expect(verifyShareAccess).toHaveBeenCalledTimes(1);
  });

  it("falls back to the normal view when the shared access key does not match", async () => {
    await renderApp(
      "/saved-guild/a_invalid",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      vi.fn(() => Promise.reject(new Error("invalid access key")))
    );

    expect(document.body.textContent).toContain("Guild Battle Monitor");
    expect(document.body.textContent).not.toContain("Saved Guild");
    expect(document.querySelector(".firebase-auth-status")).toBeNull();
  });

  it("falls back to the normal view when the public shared guild document is missing", async () => {
    const verifyShareAccess = vi.fn(() => Promise.reject(new Error("missing share")));

    await renderApp(
      "/missing-guild/g_missing",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      verifyShareAccess
    );

    expect(verifyShareAccess).toHaveBeenCalledWith({
      guildId: "missing-guild",
      accessKey: "g_missing"
    });
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
      vi.fn(() => Promise.reject(new Error("missing share"))),
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
    expect(saveProfile).not.toHaveBeenCalled();
    await clickSettingsSaveButton();
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile).toHaveBeenLastCalledWith("owner-uid", {
      world: 38,
      guildId: null,
      guildName: null
    });
    await openOwnedGuildSettings();
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
    expect(saveProfile).not.toHaveBeenCalled();
    await clickSettingsSaveButton();

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
      expect(saveProfile).not.toHaveBeenCalled();
      await clickSettingsSaveButton();

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
    const getOwnerShare = vi.fn(() => Promise.resolve(createOwnerShareResult()));

    await renderApp(pathname, signedInState, loadProfile, saveProfile, getOwnerShare);

    expect(document.querySelector(".owned-guild-settings")).toBeNull();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(getOwnerShare).not.toHaveBeenCalled();
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
  it("shows existing owner share URLs from the callable without creating keys", async () => {
    const getOwnerShare = vi.fn(() => Promise.resolve(createOwnerShareResult()));
    const saveOwnerShare = vi.fn(() => Promise.resolve(createSaveOwnerShareResult()));

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      getOwnerShare,
      saveOwnerShare
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

    expect(getShareUrlInputs().map((input) => input.value)).toEqual([
      `${window.location.origin}/saved-guild/a_admin`,
      `${window.location.origin}/saved-guild/g_guest`
    ]);
    expect(getShareSettings().textContent).toContain("Admin URL");
    expect(getShareSettings().textContent).toContain("Viewer URL");
    expect(saveOwnerShare).not.toHaveBeenCalled();
  });

  it("does not create a share when the owner callable reports missing share", async () => {
    const getOwnerShare = vi.fn(() => Promise.resolve(createMissingOwnerShareResult()));
    const saveOwnerShare = vi.fn(() => Promise.resolve(createSaveOwnerShareResult()));

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      getOwnerShare,
      saveOwnerShare
    );
    await openOwnedGuildSettings();

    expect(getShareSettings().textContent).toContain("共有URLは未作成です");
    await clickSettingsSaveButton();
    expect(saveOwnerShare).not.toHaveBeenCalled();
    expect(getShareUrlInputs()).toHaveLength(0);
  });

  it("shows an error when owner share metadata sync fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const getOwnerShare = vi.fn(() =>
      Promise.resolve({
        ...createOwnerShareResult(),
        world: 36,
        guildName: "Old Guild"
      })
    );
    const saveOwnerShare = vi.fn(() => Promise.reject(new Error("share write failed")));

    try {
      await renderApp(
        "/",
        signedInState,
        vi.fn(() => Promise.resolve(createProfile())),
        vi.fn(),
        getOwnerShare,
        saveOwnerShare
      );
      await openOwnedGuildSettings();

      expect(saveOwnerShare).not.toHaveBeenCalled();
      await clickSettingsSaveButton();

      expect(saveOwnerShare).toHaveBeenCalledWith({
        guildId: "saved-guild",
        world: 37,
        guildName: "Saved Guild"
      });
      expect(consoleError).toHaveBeenCalledWith("Failed to save owner guild share.", expect.any(Error));
      expect(getShareSettings().textContent).toContain("共有URL");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("syncs owner share metadata without changing existing keys", async () => {
    const getOwnerShare = vi.fn(() =>
      Promise.resolve({
        ...createOwnerShareResult(),
        world: 36,
        guildName: "Old Guild"
      })
    );
    const saveOwnerShare = vi.fn(() => Promise.resolve(createSaveOwnerShareResult()));

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      getOwnerShare,
      saveOwnerShare
    );
    await openOwnedGuildSettings();
    await clickSettingsSaveButton();

    expect(saveOwnerShare).toHaveBeenCalledWith({
      guildId: "saved-guild",
      world: 37,
      guildName: "Saved Guild"
    });
    expect(getShareUrlInputs().map((input) => input.value)).toEqual([
      `${window.location.origin}/saved-guild/a_admin`,
      `${window.location.origin}/saved-guild/g_guest`
    ]);
  });

  it("copies an existing shared URL", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(createOwnerShareResult())),
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

  it("does not load or save share URLs when guild is not configured", async () => {
    const getOwnerShare = vi.fn(() => Promise.resolve(createOwnerShareResult()));
    const saveOwnerShare = vi.fn(() => Promise.resolve(createSaveOwnerShareResult()));

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve({ world: 37, guildId: null, guildName: null })),
      vi.fn(),
      getOwnerShare,
      saveOwnerShare
    );
    await openOwnedGuildSettings();

    expect(getShareSettings().textContent).toContain("所属ギルドを設定してください");
    expect(getOwnerShare).not.toHaveBeenCalled();
    expect(saveOwnerShare).not.toHaveBeenCalled();
    expect(getShareUrlInputs()).toHaveLength(0);
  });

  it.each(["/123/a_admin", "/123/g_guest"])("hides share settings outside owner mode: %s", async (pathname) => {
    await renderApp(pathname, signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());

    expect(document.querySelector(".share-settings")).toBeNull();
  });
});
describe("FirebasePhase0App notification settings dialog", () => {
  it("shows the notification settings entry only after owner share is loaded", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      vi.fn(() => Promise.resolve(createMissingOwnerShareResult()))
    );
    await openSettings();

    expect(document.querySelector(".notification-settings")).toBeNull();
  });

  it("opens owner notification settings with the webhook URL field", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    await vi.waitFor(() => {
      expect(document.querySelector(".notification-settings-dialog")).not.toBeNull();
    });
    expect(document.body.textContent).toContain("Discord Webhook設定");
    expect(document.body.textContent?.match(/Discord Webhook設定/g)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Webhook URLはguild ownerのみ表示・編集できます。");
    expect(document.querySelector("input[type='url']")).not.toBeNull();
  });

  it("opens admin notification settings without the webhook URL field", async () => {
    await renderApp("/123/a_admin", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    await vi.waitFor(() => {
      expect(document.querySelector(".notification-settings-dialog")).not.toBeNull();
    });
    expect(document.body.textContent).not.toContain("Discord Webhook設定");
    expect(document.querySelector("input[type='url']")).toBeNull();
  });

  it("opens notification settings without selecting the first existing rule", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "終盤アラート" })]
        })
      )
    );
    await openNotificationSettings();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("通知ルールを選択してください");
    });
    expect(document.body.textContent).not.toContain("通知ルール編集");
    expect(document.body.textContent).not.toContain("通知プレビュー");
    expect(document.querySelector(".notification-rule-preview-panel")).toBeNull();
    expect(document.querySelector(".notification-rule-workspace__columns.is-empty")).not.toBeNull();
    expect(document.querySelector(".notification-rule-card__actions-trigger")?.textContent).toBe("...");
    expect(document.querySelector<HTMLInputElement>(".notification-rule-card__enabled-toggle input")?.checked).toBe(true);
  });

  it("syncs target guild candidates with the configured owned guild world", async () => {
    const syncGuildBattleGuildCandidates = vi.fn(() =>
      Promise.resolve({
        worldId: 1037,
        candidates: [{ guildId: "guild-a", guildName: "Alpha連盟", rank: 1 }]
      })
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      syncGuildBattleGuildCandidates
    );
    await openNotificationSettings();

    await vi.waitFor(() => {
      expect(syncGuildBattleGuildCandidates).toHaveBeenCalledWith({ guildId: "saved-guild", world: 37 });
    });
  });

  it("saves enabled changes from the rule list toggle for non-selected rules", async () => {
    const saveNotificationRule = vi.fn((input: { readonly rule: Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt"> }) =>
      Promise.resolve({
        id: "rule-1",
        ...input.rule
      })
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "防衛ゼロ検知", enabled: true })]
        })
      ),
      undefined,
      saveNotificationRule
    );
    await openNotificationSettings();

    const enabledToggle = document.querySelector<HTMLInputElement>(".notification-rule-card__enabled-toggle input");
    if (!enabledToggle) {
      throw new Error("notification rule enabled toggle was not found");
    }

    await act(async () => {
      enabledToggle.click();
      await flushPromises();
    });

    await vi.waitFor(() => {
      expect(saveNotificationRule).toHaveBeenCalledWith({
        guildId: "saved-guild",
        ruleId: "rule-1",
        rule: expect.objectContaining({ enabled: false })
      });
    });
    expect(document.body.textContent).not.toContain("通知ルールを保存しました。");
  });

  it("uses the same rule editor for new rules after the empty state", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );

    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("通知ルール新規作成");
    expect(document.body.textContent).toContain("作成前の通知ルールです。");
    expect(document.body.textContent).toContain("破棄");
    expect(document.body.textContent).toContain("作成");
    expect(document.body.textContent).toContain("有効");

    const editorTopbar = document.querySelector(".notification-rule-workspace__topbar");
    expect(editorTopbar?.textContent).toContain("通知ルール新規作成");
    expect(editorTopbar?.querySelector<HTMLInputElement>("input[type='checkbox']")).toBeNull();
    expect(editorTopbar?.querySelector(".notification-rule-workspace__toggle-track")).toBeNull();
    expect(editorTopbar?.querySelector(".notification-settings-dialog__checkbox")).toBeNull();
    expect(document.querySelector(".notification-rule-editor__topbar")).toBeNull();

    const selectedListToggle = document.querySelector<HTMLInputElement>(
      ".notification-rule-card.is-selected .notification-rule-card__enabled-toggle input"
    );
    expect(selectedListToggle?.checked).toBe(true);
  });

  it("treats the selected rule list enabled toggle as an unsaved edit", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "終盤アラート", enabled: true })]
        })
      )
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();

    const selectedRuleToggle = document.querySelector<HTMLInputElement>(
      ".notification-rule-card.is-selected .notification-rule-card__enabled-toggle input"
    );
    if (!selectedRuleToggle) {
      throw new Error("selected notification rule enabled toggle was not found");
    }

    await act(async () => {
      selectedRuleToggle.click();
      await flushPromises();
    });

    expect(document.body.textContent).toContain("保存されていない変更があります。保存まで通知は一時停止されています。");
    expect(document.body.textContent).toContain("保存まで一時停止");
  });

  it("shows an unsaved draft row while creating a new rule", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("新規ルール");
    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("作成前");

    const draftToggle = document.querySelector<HTMLInputElement>(".notification-rule-card.is-selected .notification-rule-card__enabled-toggle input");
    if (!draftToggle) {
      throw new Error("new rule draft enabled toggle was not found");
    }
    expect(draftToggle.checked).toBe(true);

    await act(async () => {
      draftToggle.click();
      await flushPromises();
    });

    expect(document.querySelector<HTMLInputElement>(".notification-rule-card.is-selected .notification-rule-card__enabled-toggle input")?.checked).toBe(
      false
    );

    const nameInput = Array.from(document.querySelectorAll<HTMLInputElement>(".notification-rule-editor input")).find(
      (candidate) => candidate.value === "新規ルール"
    );
    if (!nameInput) {
      throw new Error("new rule name input was not found");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "作成中ルール");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("作成中ルール");

    const discardButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-workspace__action-bar button")).find(
      (candidate) => candidate.textContent === "破棄"
    );
    if (!discardButton) {
      throw new Error("discard new rule button was not found");
    }

    await act(async () => {
      discardButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).not.toContain("作成中ルール");
  });

  it("duplicates from the actions menu into an unsaved copy row and closes the menu", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "見落とし防止" })]
        })
      )
    );
    await openNotificationSettings();

    const menuButton = document.querySelector<HTMLButtonElement>(".notification-rule-card__actions-trigger");
    if (!menuButton) {
      throw new Error("notification rule actions menu button was not found");
    }

    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-card__actions-menu")?.textContent).toContain("複製");
    expect(document.querySelector(".notification-rule-card__actions-menu")?.textContent).not.toContain("編集");

    const duplicateButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-card__actions-menu button")).find(
      (candidate) => candidate.textContent === "複製"
    );
    if (!duplicateButton) {
      throw new Error("duplicate notification rule button was not found");
    }

    await act(async () => {
      duplicateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-card__actions-menu")).toBeNull();
    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("見落とし防止 コピー");
    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("作成前");
  });

  it("confirms before discarding unsaved edits for new rule creation", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "終盤アラート" })]
        })
      )
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();
    await editSelectedNotificationRuleName("変更中アラート");

    const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-settings-dialog__section-header button")).find(
      (candidate) => candidate.textContent === "新規ルール追加"
    );
    if (!addButton) {
      throw new Error("new rule add button was not found");
    }

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-settings-dialog__confirm-backdrop")).not.toBeNull();
    expect(document.querySelector(".notification-settings-dialog__confirm")?.getAttribute("aria-modal")).toBe("true");
    expect(document.body.textContent).toContain("保存されていない変更があります。");
    expect(document.body.textContent).toContain("変更を破棄して新規作成しますか？");

    const cancelButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-settings-dialog__confirm button")).find(
      (candidate) => candidate.textContent === "キャンセル"
    );
    if (!cancelButton) {
      throw new Error("discard confirmation cancel button was not found");
    }

    await act(async () => {
      cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).not.toContain("変更を破棄して新規作成しますか？");
    expect(document.querySelector(".notification-settings-dialog__confirm-backdrop")).toBeNull();
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>(".notification-rule-editor input")).some(
        (candidate) => candidate.value === "変更中アラート"
      )
    ).toBe(true);
  });

  it("shows a centered confirmation before discarding a new draft for rule selection", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "テスト通知" })]
        })
      )
    );
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    await openFirstNotificationRuleForEdit();

    expect(document.querySelector(".notification-settings-dialog__confirm-backdrop")).not.toBeNull();
    expect(document.body.textContent).toContain("作成中の通知ルールがあります。");
    expect(document.body.textContent).toContain("作成内容を破棄して「テスト通知」を編集しますか？");

    const backdrop = document.querySelector<HTMLElement>(".notification-settings-dialog__confirm-backdrop");
    if (!backdrop) {
      throw new Error("discard confirmation backdrop was not found");
    }

    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-settings-dialog__confirm-backdrop")).toBeNull();
    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("新規ルール");
  });

  it("allows detail condition numbers to be blank while focused and restores zero on blur", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const conditionValueInput = document.querySelector<HTMLInputElement>(".notification-rule-editor__condition-row input[inputmode='numeric']");
    if (!conditionValueInput) {
      throw new Error("condition value input was not found");
    }

    await act(async () => {
      conditionValueInput.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(conditionValueInput, "");
      conditionValueInput.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
    });

    expect(conditionValueInput.value).toBe("");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(conditionValueInput, "50");
      conditionValueInput.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
    });

    expect(conditionValueInput.value).toBe("50");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(conditionValueInput, "");
      conditionValueInput.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
    });

    expect(conditionValueInput.value).toBe("");

    await act(async () => {
      conditionValueInput.blur();
      await flushPromises();
    });

    expect(conditionValueInput.value).toBe("0");
  });

  it("limits detail condition dragging to drag handles and marks non-attacking conditions", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-editor__condition-row[draggable='true']")).toBeNull();
    expect(document.querySelector(".notification-rule-editor__condition-group[draggable='true']")).toBeNull();
    const dragHandles = document.querySelectorAll(".notification-rule-editor__drag-handle[draggable='true']");
    expect(dragHandles.length).toBeGreaterThan(0);
    expect(dragHandles[0]?.textContent).toBe("⋮⋮");
    expect(dragHandles[0]?.getAttribute("aria-label")).toBe("並べ替え");

    const addConditionButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__condition-actions button")).find(
      (candidate) => candidate.textContent === "＋ 条件を追加"
    );
    if (!addConditionButton) {
      throw new Error("add root condition button was not found");
    }

    await act(async () => {
      addConditionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(`[title="攻撃中でない拠点もこの条件に一致する可能性があります。"]`)).not.toBeNull();
  });

  it("shows template variable labels without braces but inserts braced variables", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const variableButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__variables button"));
    expect(variableButtons.map((button) => button.textContent)).toEqual([
      "拠点名",
      "侵攻ギルド",
      "防衛数",
      "侵攻数",
      "通知時刻",
      "通知ルール名"
    ]);

    const [baseNameButton, attackerGuildButton, , , notificationTimeButton] = variableButtons;
    const templateFields = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        ".notification-rule-preview-panel input.field__input--wide, .notification-rule-preview-panel textarea.field__input--wide"
      )
    );
    const [usernameInput, titleInput, bodyTextarea] = templateFields;
    if (!baseNameButton || !attackerGuildButton || !notificationTimeButton || !usernameInput || !titleInput || !bodyTextarea) {
      throw new Error("variable buttons or notification template fields were not found");
    }

    async function changeTemplateField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(
          field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          "value"
        )?.set;
        valueSetter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        await flushPromises();
      });
    }

    async function clickVariableButton(button: HTMLButtonElement) {
      await act(async () => {
        button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });
    }

    const baseNameToken = `{${baseNameButton.textContent}}`;
    await changeTemplateField(usernameInput, "ABCDEF");
    usernameInput.focus();
    usernameInput.setSelectionRange(3, 3);
    await clickVariableButton(baseNameButton);
    expect(usernameInput.value).toBe(`ABC${baseNameToken}DEF`);
    expect(document.activeElement).toBe(usernameInput);
    expect(usernameInput.selectionStart).toBe(3 + baseNameToken.length);

    const attackerGuildToken = `{${attackerGuildButton.textContent}}`;
    await changeTemplateField(titleInput, "ABCDEFGHI");
    titleInput.focus();
    titleInput.setSelectionRange(3, 6);
    await clickVariableButton(attackerGuildButton);
    expect(titleInput.value).toBe(`ABC${attackerGuildToken}GHI`);
    expect(document.activeElement).toBe(titleInput);
    expect(titleInput.selectionStart).toBe(3 + attackerGuildToken.length);

    const notificationTimeToken = `{${notificationTimeButton.textContent}}`;
    await changeTemplateField(bodyTextarea, "ABCDEF");
    bodyTextarea.focus();
    bodyTextarea.setSelectionRange(3, 3);
    await clickVariableButton(notificationTimeButton);
    expect(bodyTextarea.value).toBe(`ABC${notificationTimeToken}DEF`);
    expect(document.activeElement).toBe(bodyTextarea);
    expect(bodyTextarea.selectionStart).toBe(3 + notificationTimeToken.length);
    expect(usernameInput.value).toBe(`ABC${baseNameToken}DEF`);
    expect(titleInput.value).toBe(`ABC${attackerGuildToken}GHI`);

    const previousUsername = usernameInput.value;
    const previousTitle = titleInput.value;
    const previousBody = bodyTextarea.value;
    document.body.tabIndex = -1;
    document.body.focus();
    await clickVariableButton(baseNameButton);

    expect(usernameInput.value).toBe(previousUsername);
    expect(titleInput.value).toBe(previousTitle);
    expect(bodyTextarea.value).toBe(previousBody);
  });

  it("scrolls the condition editor to the bottom after adding conditions or groups", async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;

    try {
      await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
      await openNotificationSettings();

      const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
        (candidate) => candidate.textContent === "新規作成"
      );
      if (!newRuleButton) {
        throw new Error("new rule button was not found");
      }

      await act(async () => {
        newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      const ruleEditor = document.querySelector<HTMLElement>(".notification-rule-editor");
      const rootActionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__condition-actions button"));
      const addConditionButton = rootActionButtons.find(
        (candidate) => candidate.textContent === "＋ 条件を追加"
      );
      const addGroupButton = rootActionButtons.find(
        (candidate) => candidate.textContent === "＋ グループを追加"
      );
      if (!ruleEditor || !addConditionButton || !addGroupButton) {
        throw new Error("rule editor or root add button was not found");
      }

      Object.defineProperty(ruleEditor, "scrollHeight", { configurable: true, value: 1200 });

      await act(async () => {
        addConditionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      expect(ruleEditor.scrollTop).toBe(1200);

      ruleEditor.scrollTop = 0;
      Object.defineProperty(ruleEditor, "scrollHeight", { configurable: true, value: 1400 });

      await act(async () => {
        addGroupButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      expect(ruleEditor.scrollTop).toBe(1400);

      const addGroupConditionButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__condition-group-header button")
      ).find((candidate) => candidate.textContent === "＋ 条件追加");
      if (!addGroupConditionButton) {
        throw new Error("group add condition button was not found");
      }

      ruleEditor.scrollTop = 0;
      Object.defineProperty(ruleEditor, "scrollHeight", { configurable: true, value: 1600 });

      await act(async () => {
        addGroupConditionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      expect(ruleEditor.scrollTop).toBe(1600);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("creates Grand Battle v2 rules without target guild candidates", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: "grand-created",
        ...input.rule
      } satisfies NotificationRuleV2)
    );
    const syncGuildBattleGuildCandidates = vi.fn(() =>
      Promise.resolve({
        worldId: 1037,
        candidates: [{ guildId: "guild-a", guildName: "Alpha連盟", rank: 1 }]
      })
    );

    await renderNotificationSettingsDialog({
      initialBattleType: "grandBattle",
      saveNotificationRuleV2,
      syncGuildBattleGuildCandidates
    });

    expect(syncGuildBattleGuildCandidates).not.toHaveBeenCalled();

    const newRuleButton = document.querySelector<HTMLButtonElement>(
      ".notification-settings-dialog__section-header .load-form__button"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("通知ルール新規作成");
    expect(document.body.textContent).toContain("対象ギルド");
    expect(document.body.textContent).toContain("グランドバトルでは全ギルド固定です。");
    expect(document.body.textContent).toContain("全ギルド");
    expect(document.body.textContent).toContain("指定ギルドのみ");
    expect(document.body.textContent).not.toContain("Grand Battleでは対象ギルド指定は使用しません。");
    expect(document.body.textContent).not.toContain("Alpha連盟");
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).toBeNull();

    const readonlyTargetGroup = document.querySelector<HTMLElement>(".notification-rule-editor__target-guilds.is-readonly");
    expect(readonlyTargetGroup).not.toBeNull();
    expect(readonlyTargetGroup?.querySelector("input")).toBeNull();
    const readonlyTargetOptions = document.querySelectorAll<HTMLElement>(
      ".notification-rule-editor__target-guilds.is-readonly .notification-rule-editor__target-guild-radio"
    );
    expect(readonlyTargetOptions).toHaveLength(2);
    expect(readonlyTargetOptions[0]?.getAttribute("role")).toBe("radio");
    expect(readonlyTargetOptions[0]?.getAttribute("aria-checked")).toBe("true");
    expect(readonlyTargetOptions[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(readonlyTargetOptions[0]?.querySelector(".notification-rule-editor__readonly-radio.is-checked")).not.toBeNull();
    expect(readonlyTargetOptions[1]?.getAttribute("role")).toBe("radio");
    expect(readonlyTargetOptions[1]?.getAttribute("aria-checked")).toBe("false");
    expect(readonlyTargetOptions[1]?.getAttribute("aria-disabled")).toBe("true");
    expect(readonlyTargetOptions[1]?.querySelector(".notification-rule-editor__readonly-radio:not(.is-checked)")).not.toBeNull();
    await act(async () => {
      readonlyTargetOptions[1]?.click();
      await flushPromises();
    });
    expect(readonlyTargetOptions[0]?.getAttribute("aria-checked")).toBe("true");
    expect(readonlyTargetOptions[1]?.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      readonlyTargetOptions[0]?.click();
      await flushPromises();
    });
    expect(readonlyTargetOptions[0]?.getAttribute("aria-checked")).toBe("true");
    expect(readonlyTargetOptions[1]?.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector(".notification-preview__avatar svg")).not.toBeNull();

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      rule: expect.objectContaining({
        schemaVersion: 2,
        battleType: "grandBattle",
        targetGuildIds: [],
        detailConditions: expect.objectContaining({ operator: "OR" })
      })
    });
    expect(syncGuildBattleGuildCandidates).not.toHaveBeenCalled();
  });

  it("uses the initial battle type only for the first notification tab selection", async () => {
    const request = { guildId: "saved-guild" };
    const getNotificationSettings = vi.fn(() =>
      Promise.resolve({
        rules: [createNotificationRule({ battleType: "grandBattle", id: "gb-rule-1", name: "Grand Rule" })]
      })
    );

    function renderDialog() {
      root?.render(
        <NotificationSettingsDialog
          request={request}
          role="admin"
          initialBattleType="grandBattle"
          getNotificationSettings={getNotificationSettings}
          onClose={() => {}}
        />
      );
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      renderDialog();
      await flushPromises();
    });

    const getTab = (label: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-settings-dialog__tab")).find(
        (candidate) => candidate.textContent === label
      );
    const guildBattleTab = getTab("Guild Battle");
    const grandBattleTab = getTab("Grand Battle");
    if (guildBattleTab === undefined || grandBattleTab === undefined) {
      throw new Error("notification battle tabs were not found");
    }

    expect(grandBattleTab.className).toContain("is-active");
    expect(document.body.textContent).toContain("通知ルールを選択してください");
    expect(document.body.textContent).toContain("Grand Rule");
    expect(document.body.textContent).not.toContain("Grand Battle通知設定は準備中です");

    await act(async () => {
      guildBattleTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    await act(async () => {
      renderDialog();
      await flushPromises();
    });

    expect(guildBattleTab.className).toContain("is-active");
    expect(grandBattleTab.className).not.toContain("is-active");
  });

  it("keeps the main notification settings dialog open on backdrop clicks", async () => {
    const onClose = vi.fn();

    await renderNotificationSettingsDialog({ onClose });

    const backdrop = document.querySelector<HTMLElement>(".notification-settings-dialog-backdrop");
    if (!backdrop) {
      throw new Error("notification settings dialog backdrop was not found");
    }

    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await flushPromises();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".notification-settings-dialog")).not.toBeNull();

    const closeButton = document.querySelector<HTMLButtonElement>(".notification-settings-dialog .settings-dialog__close");
    if (!closeButton) {
      throw new Error("notification settings close button was not found");
    }

    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters and edits Grand Battle v2 rules independently from Guild Battle rules", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly ruleId?: string; readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: input.ruleId ?? "saved-rule-v2",
        ...input.rule
      } satisfies NotificationRuleV2)
    );
    const suspendNotificationRule = vi.fn(() =>
      Promise.resolve({
        suspendedAt: "2026-06-20T12:00:00.000Z",
        expiresAt: "2026-06-20T13:00:00.000Z",
        suspendedBy: { uid: "owner-uid" }
      })
    );

    await renderNotificationSettingsDialog({
      initialBattleType: "grandBattle",
      rules: [
        createNotificationRuleV2({ id: "guild-rule", battleType: "guildBattle", name: "Guild Rule" }),
        createNotificationRuleV2({
          id: "grand-rule",
          battleType: "grandBattle",
          name: "Grand Rule",
          targetGuildIds: ["guild-a"]
        })
      ],
      saveNotificationRuleV2,
      suspendNotificationRule
    });

    expect(document.body.textContent).toContain("Grand Rule");
    expect(document.body.textContent).not.toContain("Guild Rule");

    await openFirstNotificationRuleForEdit();
    expect(document.body.textContent).toContain("通知ルール編集");
    expect(
      document.querySelectorAll<HTMLElement>(
        ".notification-rule-editor__target-guilds.is-readonly .notification-rule-editor__target-guild-radio"
      )
    ).toHaveLength(2);
    expect(document.querySelector(".notification-rule-editor__target-guilds.is-readonly input")).toBeNull();
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).toBeNull();

    await editSelectedNotificationRuleName("Grand Rule Edited");

    await vi.waitFor(() => {
      expect(suspendNotificationRule).toHaveBeenCalledWith({
        guildId: "saved-guild",
        ruleId: "grand-rule"
      });
    });

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__action-buttons button")).find(
      (candidate) => candidate.textContent === "保存"
    );
    if (!saveButton) {
      throw new Error("save notification rule button was not found");
    }

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      ruleId: "grand-rule",
      rule: expect.objectContaining({
        battleType: "grandBattle",
        name: "Grand Rule Edited",
        targetGuildIds: []
      })
    });

    const guildBattleTab = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-settings-dialog__tab")).find(
      (candidate) => candidate.textContent === "Guild Battle"
    );
    if (!guildBattleTab) {
      throw new Error("Guild Battle tab was not found");
    }

    await act(async () => {
      guildBattleTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("Guild Rule");
    expect(document.body.textContent).not.toContain("Grand Rule Edited");
  });

  it("saves Grand Battle enabled changes from the rule list toggle", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly ruleId?: string; readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: input.ruleId ?? "saved-rule-v2",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    await renderNotificationSettingsDialog({
      initialBattleType: "grandBattle",
      rules: [createNotificationRuleV2({ id: "grand-rule", battleType: "grandBattle", name: "Grand Rule", enabled: true })],
      saveNotificationRuleV2
    });

    const enabledToggle = document.querySelector<HTMLInputElement>(".notification-rule-card__enabled-toggle input");
    if (!enabledToggle) {
      throw new Error("notification rule enabled toggle was not found");
    }

    await act(async () => {
      enabledToggle.click();
      await flushPromises();
    });

    await vi.waitFor(() => {
      expect(saveNotificationRuleV2).toHaveBeenCalledWith({
        guildId: "saved-guild",
        ruleId: "grand-rule",
        rule: expect.objectContaining({
          battleType: "grandBattle",
          enabled: false,
          targetGuildIds: []
        })
      });
    });
    expect(document.body.textContent).not.toContain("通知ルール編集");
  });

  it("duplicates Grand Battle rules into unsaved Grand Battle copies", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly ruleId?: string; readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: input.ruleId ?? "grand-copy",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    await renderNotificationSettingsDialog({
      initialBattleType: "grandBattle",
      rules: [createNotificationRuleV2({ id: "grand-rule", battleType: "grandBattle", name: "Grand Rule" })],
      saveNotificationRuleV2
    });

    const menuButton = document.querySelector<HTMLButtonElement>(".notification-rule-card__actions-trigger");
    if (!menuButton) {
      throw new Error("notification rule actions menu button was not found");
    }

    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const duplicateButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-card__actions-menu button")).find(
      (candidate) => candidate.textContent === "複製"
    );
    if (!duplicateButton) {
      throw new Error("duplicate notification rule button was not found");
    }

    await act(async () => {
      duplicateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.querySelector(".notification-rule-card.is-selected")?.textContent).toContain("Grand Rule コピー");

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      rule: expect.objectContaining({
        battleType: "grandBattle",
        name: "Grand Rule コピー",
        targetGuildIds: []
      })
    });
  });

  it("deletes Grand Battle rules from the actions menu", async () => {
    const deleteNotificationRule = vi.fn(() => Promise.resolve());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      await renderNotificationSettingsDialog({
        initialBattleType: "grandBattle",
        rules: [createNotificationRuleV2({ id: "grand-rule", battleType: "grandBattle", name: "Grand Rule" })],
        deleteNotificationRule
      });

      const menuButton = document.querySelector<HTMLButtonElement>(".notification-rule-card__actions-trigger");
      if (!menuButton) {
        throw new Error("notification rule actions menu button was not found");
      }

      await act(async () => {
        menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      const deleteButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-card__actions-menu button")).find(
        (candidate) => candidate.textContent === "削除"
      );
      if (!deleteButton) {
        throw new Error("delete notification rule button was not found");
      }

      await act(async () => {
        deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
      });

      expect(deleteNotificationRule).toHaveBeenCalledWith({
        guildId: "saved-guild",
        ruleId: "grand-rule"
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("shows target guild default state from the owned guild world", async () => {
    await renderApp("/", signedInState, vi.fn(() => Promise.resolve(createProfile())), vi.fn());
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const battleSideRadios = document.querySelectorAll<HTMLInputElement>(".notification-rule-editor__battle-side input");
    expect(battleSideRadios).toHaveLength(2);
    expect(battleSideRadios[0]?.checked).toBe(true);
    expect(battleSideRadios[1]?.checked).toBe(false);
    expect(document.body.textContent).toContain("通知対象");
    expect(document.body.textContent).toContain("防衛中の拠点");
    expect(document.body.textContent).toContain("攻撃中の拠点");

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    expect(targetGuildModeRadios).toHaveLength(2);
    expect(targetGuildModeRadios[0]?.closest(".notification-rule-editor__target-guilds")?.className).not.toContain("is-readonly");
    expect(targetGuildModeRadios[0]?.checked).toBe(true);
    expect(targetGuildModeRadios[1]?.checked).toBe(false);
    expect(document.body.textContent).toContain("対象ギルド");
    expect(document.body.textContent).not.toContain("未指定の場合は全ギルドが対象です");
    expect(document.body.textContent).not.toContain("Alpha連盟");
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).toBeNull();
  });

  it("saves multiple target guilds from the target guild checklist", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: "saved-rule-v2",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <NotificationSettingsDialog
          request={{ guildId: "saved-guild" }}
          role="guildOwner"
          targetGuildWorld={37}
          useRuleV2Storage
          getNotificationSettings={vi.fn(() => Promise.resolve({ rules: [] }))}
          getNotificationSettingsV2={vi.fn(() => Promise.resolve({ rules: [] }))}
          saveNotificationRule={vi.fn(() => Promise.resolve(createNotificationRule()))}
          saveNotificationRuleV2={saveNotificationRuleV2}
          deleteNotificationRule={vi.fn(() => Promise.resolve())}
          suspendNotificationRule={vi.fn(() =>
            Promise.resolve({
              suspendedAt: "2026-06-20T12:00:00.000Z",
              expiresAt: "2026-06-20T13:00:00.000Z",
              suspendedBy: { role: "guildOwner" as const }
            })
          )}
          saveNotificationDestination={vi.fn(() =>
            Promise.resolve({
              id: "discord" as const,
              type: "discord_webhook" as const,
              enabled: true,
              webhookUrl: "",
              defaultUsernameTemplate: ""
            })
          )}
          syncGuildBattleGuildCandidates={vi.fn(() =>
            Promise.resolve({
              worldId: 1037,
              candidates: [
                { guildId: "guild-a", guildName: "Alpha連盟", rank: 1 },
                { guildId: "guild-b", guildName: "Bravo隊", rank: 2 }
              ]
            })
          )}
          onClose={() => {}}
        />
      );
      await flushPromises();
    });

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).toBeNull();
    await act(async () => {
      targetGuildModeRadios[1]?.click();
      await flushPromises();
    });
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).not.toBeNull();

    const targetGuildCheckboxes = document.querySelectorAll<HTMLInputElement>(".notification-rule-editor__target-guild-checkbox input");
    await act(async () => {
      targetGuildCheckboxes[0]?.click();
      targetGuildCheckboxes[1]?.click();
      await flushPromises();
    });

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      rule: expect.objectContaining({
        battleSide: "defense",
        targetGuildIds: ["guild-a", "guild-b"]
      })
    });
    expect(saveNotificationRuleV2.mock.calls[0]?.[0].rule).not.toHaveProperty("targetGuildSelectionMode");
  });

  it("blocks saving when specific target guild mode has no checked guilds", async () => {
    const saveNotificationRuleV2 = vi.fn((input: { readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: "saved-rule-v2",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() => Promise.resolve({ rules: [] })),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() => Promise.resolve({ rules: [] })),
      saveNotificationRuleV2,
      true
    );
    await openNotificationSettings();

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    await act(async () => {
      targetGuildModeRadios[1]?.click();
      await flushPromises();
    });

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRuleV2).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("対象ギルドを1件以上選択してください。");
  });

  it("restores selected target guilds and keeps out-of-candidate ids visible", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() => Promise.resolve({ rules: [] })),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRuleV2({ id: "v2-rule", name: "指定通知", targetGuildIds: ["guild-a", "guild-z"] })]
        })
      ),
      undefined,
      true
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    expect(targetGuildModeRadios[0]?.checked).toBe(false);
    expect(targetGuildModeRadios[1]?.checked).toBe(true);

    const checkedTargetGuilds = Array.from(
      document.querySelectorAll<HTMLInputElement>(".notification-rule-editor__target-guild-checkbox input")
    ).filter((candidate) => candidate.checked);
    expect(checkedTargetGuilds).toHaveLength(2);
    expect(document.body.textContent).toContain("Alpha連盟");
    expect(document.body.textContent).toContain("guild-z（現在Stock上位16位外）");
  });

  it("uses v2 notification rule storage only when the feature path is enabled", async () => {
    const getNotificationSettings = vi.fn(() => Promise.resolve({ rules: [] }));
    const getNotificationSettingsV2 = vi.fn(() => Promise.resolve({ rules: [] }));
    const saveNotificationRule = vi.fn((input: { readonly rule: Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt"> }) =>
      Promise.resolve({
        id: "legacy-rule",
        ...input.rule
      })
    );
    const saveNotificationRuleV2 = vi.fn((input: { readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: "v2-rule",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      getNotificationSettings,
      undefined,
      saveNotificationRule,
      undefined,
      undefined,
      undefined,
      getNotificationSettingsV2,
      saveNotificationRuleV2,
      true
    );
    await openNotificationSettings();

    expect(getNotificationSettings).not.toHaveBeenCalled();
    expect(getNotificationSettingsV2).toHaveBeenCalledWith({ guildId: "saved-guild" });

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("Discord表示名");
    expect(document.body.textContent).not.toContain("Webhook名");
    const previewAvatar = document.querySelector<HTMLElement>(".notification-preview__avatar");
    expect(previewAvatar?.textContent?.trim()).toBe("");
    expect(previewAvatar?.querySelector("svg")).not.toBeNull();
    const battleSideRadios = document.querySelectorAll<HTMLInputElement>(".notification-rule-editor__battle-side input");
    expect(battleSideRadios[0]?.checked).toBe(true);
    expect(battleSideRadios[1]?.checked).toBe(false);

    await act(async () => {
      battleSideRadios[1]?.click();
      await flushPromises();
    });
    expect(battleSideRadios[0]?.checked).toBe(false);
    expect(battleSideRadios[1]?.checked).toBe(true);

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRule).not.toHaveBeenCalled();
    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      rule: expect.objectContaining({
        schemaVersion: 2,
        battleSide: "attack",
        targetGuildIds: [],
        detailConditions: expect.objectContaining({ operator: "OR" })
      })
    });
  });

  it("uses v2 notification rule storage by default when the env flag is unset", async () => {
    const getNotificationSettings = vi.fn(() => Promise.resolve({ rules: [] }));
    const getNotificationSettingsV2 = vi.fn(() => Promise.resolve({ rules: [] }));
    const saveNotificationRule = vi.fn((input: { readonly rule: Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt"> }) =>
      Promise.resolve({
        id: "legacy-rule",
        ...input.rule
      })
    );
    const saveNotificationRuleV2 = vi.fn((input: { readonly rule: NotificationRuleV2Input }) =>
      Promise.resolve({
        id: "v2-rule",
        ...input.rule
      } satisfies NotificationRuleV2)
    );

    vi.stubEnv("VITE_ENABLE_NOTIFICATION_RULE_V2", undefined);
    const { FirebasePhase0App } = await import("./FirebasePhase0App");

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AppModeProvider pathname="/">
          <FirebasePhase0App
            getOwnerGuildShare={vi.fn(() => Promise.resolve(createOwnerShareResult()))}
            getNotificationSettings={getNotificationSettings}
            getNotificationSettingsV2={getNotificationSettingsV2}
            deleteNotificationRule={vi.fn(() => Promise.resolve())}
            loadKoGuildKoTotals={() => Promise.resolve([])}
            loadKoObserverRunMeta={() => Promise.resolve(null)}
            loadOwnedGuildProfile={vi.fn(() => Promise.resolve(createProfile()))}
            loadSnapshot={vi.fn(() => Promise.resolve(createGvgSnapshot()))}
            saveNotificationDestination={vi.fn((input) =>
              Promise.resolve({
                id: "discord",
                type: "discord_webhook",
                ...input.destination
              })
            )}
            saveNotificationRule={saveNotificationRule}
            saveNotificationRuleV2={saveNotificationRuleV2}
            saveOwnerGuildShare={vi.fn()}
            saveOwnedGuildProfile={vi.fn()}
            subscribeKoGuildKoTotals={() => () => {}}
            subscribeToAuthState={(onStateChanged) => {
              onStateChanged(signedInState);
              return () => {};
            }}
            syncGuildBattleGuildCandidates={vi.fn(() =>
              Promise.resolve({
                worldId: 1037,
                candidates: [
                  { guildId: "guild-a", guildName: "Alpha騾｣逶・", rank: 1 },
                  { guildId: "guild-b", guildName: "Bravo髫・", rank: 2 }
                ]
              })
            )}
            suspendNotificationRule={vi.fn(() =>
              Promise.resolve({
                suspendedAt: "2026-06-20T12:00:00.000Z",
                expiresAt: "2026-06-20T13:00:00.000Z",
                suspendedBy: { uid: "owner-uid" }
              })
            )}
            verifyGuildShareAccess={vi.fn()}
          />
        </AppModeProvider>
      );
      await flushPromises();
    });

    await openNotificationSettings();

    expect(getNotificationSettings).not.toHaveBeenCalled();
    expect(getNotificationSettingsV2).toHaveBeenCalledWith({ guildId: "saved-guild" });

    const newRuleButton = document.querySelector<HTMLButtonElement>(
      ".notification-settings-dialog__section-header .load-form__button"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    await act(async () => {
      targetGuildModeRadios[1]?.click();
      await flushPromises();
    });

    const targetGuildCheckboxes = document.querySelectorAll<HTMLInputElement>(".notification-rule-editor__target-guild-checkbox input");
    await act(async () => {
      targetGuildCheckboxes[0]?.click();
      targetGuildCheckboxes[1]?.click();
      await flushPromises();
    });

    const createButton = getNotificationRuleEditorActionButton("作成");

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRule).not.toHaveBeenCalled();
    expect(saveNotificationRuleV2).toHaveBeenCalledWith({
      guildId: "saved-guild",
      rule: expect.objectContaining({
        targetGuildIds: ["guild-a", "guild-b"]
      })
    });
  });

  it("disables the target guild field when the target guild world is not available", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <NotificationSettingsDialog
          request={{ guildId: "saved-guild" }}
          role="guildOwner"
          targetGuildWorld={null}
          getNotificationSettings={vi.fn(() => Promise.resolve({ rules: [] }))}
          saveNotificationRule={vi.fn(() => Promise.resolve(createNotificationRule()))}
          deleteNotificationRule={vi.fn(() => Promise.resolve())}
          suspendNotificationRule={vi.fn(() =>
            Promise.resolve({
              suspendedAt: "2026-06-20T12:00:00.000Z",
              expiresAt: "2026-06-20T13:00:00.000Z",
              suspendedBy: { role: "guildOwner" as const }
            })
          )}
          saveNotificationDestination={vi.fn(() =>
            Promise.resolve({
              id: "discord" as const,
              type: "discord_webhook" as const,
              enabled: true,
              webhookUrl: "",
              defaultUsernameTemplate: ""
            })
          )}
          onClose={() => {}}
        />
      );
      await flushPromises();
    });

    const newRuleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor button")).find(
      (candidate) => candidate.textContent === "新規作成"
    );
    if (!newRuleButton) {
      throw new Error("new rule button was not found");
    }

    await act(async () => {
      newRuleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const targetGuildModeRadios = document.querySelectorAll<HTMLInputElement>(
      ".notification-rule-editor__target-guilds .notification-rule-editor__target-guild-radio input"
    );
    expect(targetGuildModeRadios[0]?.checked).toBe(true);
    expect(targetGuildModeRadios[1]?.disabled).toBe(true);
    expect(document.querySelector(".notification-rule-editor__target-guild-list")).toBeNull();
    expect(document.body.textContent).toContain(
      "対象ギルド候補を取得するには、所属ギルド設定でワールドを登録してください。"
    );
  });

  it("shows the edit dirty bar and restores the saved rule when discarded", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "終盤アラート" })]
        })
      )
    );
    await openNotificationSettings();

    const ruleButton = document.querySelector<HTMLButtonElement>(".notification-rule-card__main");
    if (!ruleButton) {
      throw new Error("notification rule row button was not found");
    }

    await act(async () => {
      ruleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const nameInput = Array.from(document.querySelectorAll<HTMLInputElement>(".notification-rule-editor input")).find(
      (candidate) => candidate.value === "終盤アラート"
    );
    if (!nameInput) {
      throw new Error("notification rule name input was not found");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "変更中アラート");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("保存されていない変更があります。保存まで通知は一時停止されています。");
    expect(document.body.textContent).toContain("保存まで一時停止");

    const discardButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-workspace__action-bar button")).find(
      (candidate) => candidate.textContent === "破棄して戻す"
    );
    if (!discardButton) {
      throw new Error("discard rule changes button was not found");
    }
    expect(discardButton.className).toContain("load-form__button--secondary");

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-workspace__action-bar button")).find(
      (candidate) => candidate.textContent === "保存"
    );
    if (!saveButton) {
      throw new Error("save rule changes button was not found");
    }
    expect(saveButton.className).toContain("load-form__button");
    expect(saveButton.className).toContain("notification-rule-footer-save-button");
    expect(saveButton.className).not.toContain("load-form__button--secondary");

    await act(async () => {
      discardButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).not.toContain("保存されていない変更があります。保存まで通知は一時停止されています。");
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>(".notification-rule-editor input")).some(
        (candidate) => candidate.value === "終盤アラート"
      )
    ).toBe(true);
  });

  it("temporarily suspends an existing rule when editing starts", async () => {
    const suspendNotificationRule = vi.fn(() =>
      Promise.resolve({
        suspendedAt: "2026-06-20T12:00:00.000Z",
        expiresAt: "2026-06-20T13:00:00.000Z",
        suspendedBy: { uid: "owner-uid" }
      })
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "Rule One" })]
        })
      ),
      undefined,
      undefined,
      undefined,
      suspendNotificationRule
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();
    await editSelectedNotificationRuleName("Rule One Edited");

    await vi.waitFor(() => {
      expect(suspendNotificationRule).toHaveBeenCalledWith({
        guildId: "saved-guild",
      ruleId: "rule-1"
      });
    });
  });

  it("keeps existing rule saving available while temporary suspension is pending", async () => {
    let resolveSuspension:
      | ((value: {
          readonly suspendedAt: string;
          readonly expiresAt: string;
          readonly suspendedBy?: { readonly uid?: string; readonly role?: "guildOwner" | "admin" };
        }) => void)
      | null = null;
    const suspendNotificationRule = vi.fn(
      () =>
        new Promise<{
          readonly suspendedAt: string;
          readonly expiresAt: string;
          readonly suspendedBy?: { readonly uid?: string; readonly role?: "guildOwner" | "admin" };
        }>((resolve) => {
          resolveSuspension = resolve;
        })
    );
    const saveNotificationRule = vi.fn((input: { readonly rule: Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt"> }) =>
      Promise.resolve({
        id: "rule-1",
        ...input.rule
      })
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "Rule One" })]
        })
      ),
      undefined,
      saveNotificationRule,
      undefined,
      suspendNotificationRule
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();
    await editSelectedNotificationRuleName("Rule One Edited");

    await vi.waitFor(() => {
      expect(suspendNotificationRule).toHaveBeenCalled();
    });

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__action-buttons button")).find(
      (candidate) => candidate.textContent === "保存"
    );
    if (!saveButton) {
      throw new Error("save notification rule button was not found");
    }

    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(saveNotificationRule).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "saved-guild",
        ruleId: "rule-1"
      })
    );
    expect(document.body.textContent).not.toContain("通知ルールを保存しました。");
    expect(document.querySelector(".notification-rule-workspace__action-bar")).toBeNull();

    await act(async () => {
      resolveSuspension?.({
        suspendedAt: "2026-06-20T12:00:00.000Z",
        expiresAt: "2026-06-20T13:00:00.000Z",
        suspendedBy: { uid: "owner-uid" }
      });
      await flushPromises();
    });
  });

  it("keeps the notification rule save error visible when saving fails", async () => {
    const saveNotificationRule = vi.fn(() => Promise.reject(new Error("save failed")));

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "Rule One" })]
        })
      ),
      undefined,
      saveNotificationRule
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();
    await editSelectedNotificationRuleName("Rule One Edited");

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__action-buttons button")).find(
      (candidate) => candidate.textContent === "保存"
    );
    if (!saveButton) {
      throw new Error("save notification rule button was not found");
    }

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("通知ルールの保存に失敗しました。");
  });

  it("cancels editing when temporary suspension fails", async () => {
    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [createNotificationRule({ id: "rule-1", name: "Rule One" })]
        })
      ),
      undefined,
      undefined,
      undefined,
      vi.fn(() => Promise.reject(new Error("suspend failed")))
    );
    await openNotificationSettings();
    await openFirstNotificationRuleForEdit();
    await editSelectedNotificationRuleName("Rule One Edited");

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(
        "通知の一時停止に失敗したため、編集を開始できませんでした。時間をおいて再度お試しください。"
      );
    });
    expect(document.querySelector(".notification-rule-editor__empty-state")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Rule One Edited");
  });

  it("saves the webhook destination from the notification dialog, not the common settings save button", async () => {
    const saveNotificationDestination = vi.fn((input: {
      readonly guildId: string;
      readonly destination: Pick<NotificationDestination, "enabled" | "webhookUrl" | "defaultUsernameTemplate">;
    }) =>
      Promise.resolve({
        id: "discord" as const,
        type: "discord_webhook" as const,
        ...input.destination
      })
    );

    await renderApp(
      "/",
      signedInState,
      vi.fn(() => Promise.resolve(createProfile())),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(() =>
        Promise.resolve({
          rules: [],
          destination: {
            id: "discord" as const,
            type: "discord_webhook" as const,
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/123/old"
          }
        })
      ),
      saveNotificationDestination
    );
    await openNotificationSettings();

    expect(saveNotificationDestination).not.toHaveBeenCalled();
    await clickSettingsSaveButton();
    expect(saveNotificationDestination).not.toHaveBeenCalled();

    await act(async () => {
      getNotificationDestinationSaveButton().click();
      await flushPromises();
    });

    expect(saveNotificationDestination).toHaveBeenCalledWith({
      guildId: "saved-guild",
      destination: expect.objectContaining({
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123/old"
      })
    });
  });
});

async function renderNotificationSettingsDialog({
  initialBattleType = "guildBattle",
  rules = [],
  targetGuildWorld = 37,
  getNotificationSettingsV2 = vi.fn(() => Promise.resolve({ rules })),
  saveNotificationRuleV2 = vi.fn((input: { readonly ruleId?: string; readonly rule: NotificationRuleV2Input }) =>
    Promise.resolve({
      id: input.ruleId ?? "saved-rule-v2",
      ...input.rule
    } satisfies NotificationRuleV2)
  ),
  deleteNotificationRule = vi.fn(() => Promise.resolve()),
  suspendNotificationRule = vi.fn(() =>
    Promise.resolve({
      suspendedAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T13:00:00.000Z",
      suspendedBy: { role: "guildOwner" as const }
    })
  ),
  syncGuildBattleGuildCandidates = vi.fn(() =>
    Promise.resolve({
      worldId: 1037,
      candidates: [
        { guildId: "guild-a", guildName: "Alpha連盟", rank: 1 },
        { guildId: "guild-b", guildName: "Bravo隊", rank: 2 }
      ]
    })
  ),
  onClose = vi.fn()
}: {
  readonly initialBattleType?: NotificationBattleType;
  readonly rules?: readonly NotificationRuleV2[];
  readonly targetGuildWorld?: number | null;
  readonly getNotificationSettingsV2?: (input: { readonly guildId: string; readonly accessKey?: string }) => Promise<{
    readonly rules: readonly NotificationRuleV2[];
    readonly destination?: NotificationDestination;
  }>;
  readonly saveNotificationRuleV2?: (input: {
    readonly guildId: string;
    readonly accessKey?: string;
    readonly ruleId?: string;
    readonly rule: NotificationRuleV2Input;
  }) => Promise<NotificationRuleV2>;
  readonly deleteNotificationRule?: (input: {
    readonly guildId: string;
    readonly accessKey?: string;
    readonly ruleId: string;
  }) => Promise<void>;
  readonly suspendNotificationRule?: (input: { readonly guildId: string; readonly accessKey?: string; readonly ruleId: string }) => Promise<{
    readonly suspendedAt: string;
    readonly expiresAt: string;
    readonly suspendedBy?: { readonly uid?: string; readonly role?: "guildOwner" | "admin" };
  }>;
  readonly syncGuildBattleGuildCandidates?: (input: { readonly guildId: string; readonly accessKey?: string; readonly world?: number }) => Promise<{
    readonly worldId: number;
    readonly candidates: readonly { readonly guildId: string; readonly guildName: string; readonly rank: number }[];
  }>;
  readonly onClose?: () => void;
} = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <NotificationSettingsDialog
        request={{ guildId: "saved-guild" }}
        role="guildOwner"
        initialBattleType={initialBattleType}
        targetGuildWorld={targetGuildWorld}
        useRuleV2Storage
        getNotificationSettingsV2={getNotificationSettingsV2}
        saveNotificationRuleV2={saveNotificationRuleV2}
        deleteNotificationRule={deleteNotificationRule}
        suspendNotificationRule={suspendNotificationRule}
        syncGuildBattleGuildCandidates={syncGuildBattleGuildCandidates}
        onClose={onClose}
      />
    );
    await flushPromises();
  });
}

async function renderApp(
  pathname: string,
  authState: AuthState,
  loadProfile: (uid: string) => Promise<OwnedGuildProfile | null>,
  saveProfile: (uid: string, profile: OwnedGuildProfile) => Promise<void>,
  getOwnerShare: (
    guildId: string
  ) => Promise<ReturnType<typeof createOwnerShareResult> | ReturnType<typeof createMissingOwnerShareResult>> = vi.fn(() =>
    Promise.resolve(createOwnerShareResult())
  ),
  saveOwnerShare: (input: { readonly guildId: string; readonly world: number; readonly guildName: string }) => Promise<ReturnType<typeof createSaveOwnerShareResult>> = vi.fn(() =>
    Promise.resolve(createSaveOwnerShareResult())
  ),
  verifyShareAccess: (input: { readonly guildId: string; readonly accessKey: string }) => Promise<ReturnType<typeof createSharedAccessResult>> = vi.fn((input) =>
    input.accessKey === "g_guest"
      ? Promise.resolve(createSharedAccessResult("viewer"))
      : input.accessKey === "a_admin"
        ? Promise.resolve(createSharedAccessResult("admin"))
        : Promise.reject(new Error("invalid access key"))
  ),
  _unusedShareWriter: unknown = undefined,
  loadSnapshot: typeof loadLocalGvgSnapshot = vi.fn(() => Promise.resolve(createGvgSnapshot())),
  getNotificationSettings: (input: { readonly guildId: string; readonly accessKey?: string }) => Promise<{
    readonly rules: readonly NotificationRule[];
    readonly destination?: NotificationDestination;
  }> = vi.fn(() => Promise.resolve({ rules: [] })),
  saveNotificationDestination: (input: {
    readonly guildId: string;
    readonly destination: Pick<NotificationDestination, "enabled" | "webhookUrl" | "defaultUsernameTemplate">;
  }) => Promise<NotificationDestination> = vi.fn((input) =>
    Promise.resolve({
      id: "discord",
      type: "discord_webhook",
      ...input.destination
    })
  ),
  saveNotificationRule: (input: { readonly rule: Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt"> }) => Promise<NotificationRule> = vi.fn((input) =>
    Promise.resolve({
      id: "saved-rule",
      ...input.rule
    })
  ),
  deleteNotificationRule: (input: { readonly ruleId: string }) => Promise<void> = vi.fn(() => Promise.resolve()),
  suspendNotificationRule: (input: { readonly ruleId: string }) => Promise<{
    readonly suspendedAt: string;
    readonly expiresAt: string;
    readonly suspendedBy?: { readonly uid?: string; readonly role?: "guildOwner" | "admin" };
  }> = vi.fn(() =>
    Promise.resolve({
      suspendedAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T13:00:00.000Z",
      suspendedBy: { uid: "owner-uid" }
    })
  ),
  syncGuildBattleGuildCandidates = vi.fn(() =>
    Promise.resolve({
      worldId: 1037,
      candidates: [
        { guildId: "guild-a", guildName: "Alpha連盟", rank: 1 },
        { guildId: "guild-b", guildName: "Bravo隊", rank: 2 }
      ]
    })
  ),
  getNotificationSettingsV2: (input: { readonly guildId: string; readonly accessKey?: string }) => Promise<{
    readonly rules: readonly NotificationRuleV2[];
    readonly destination?: NotificationDestination;
  }> = vi.fn(() => Promise.resolve({ rules: [] })),
  saveNotificationRuleV2: (input: { readonly rule: NotificationRuleV2Input }) => Promise<NotificationRuleV2> = vi.fn((input) =>
    Promise.resolve({
      id: "saved-rule-v2",
      ...input.rule
    })
  ),
  useNotificationRuleV2 = false
) {
  const { FirebasePhase0App } = await import("./FirebasePhase0App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  const renderTree = () => (
    <AppModeProvider pathname={pathname}>
      <FirebasePhase0App
        getOwnerGuildShare={getOwnerShare}
        getNotificationSettings={getNotificationSettings}
        getNotificationSettingsV2={getNotificationSettingsV2}
        deleteNotificationRule={deleteNotificationRule}
        loadKoGuildKoTotals={() => Promise.resolve([])}
        loadKoObserverRunMeta={() => Promise.resolve(null)}
        loadOwnedGuildProfile={loadProfile}
        loadSnapshot={loadSnapshot}
        saveNotificationDestination={saveNotificationDestination}
        saveNotificationRule={saveNotificationRule}
        saveNotificationRuleV2={saveNotificationRuleV2}
        syncGuildBattleGuildCandidates={syncGuildBattleGuildCandidates}
        suspendNotificationRule={suspendNotificationRule}
        saveOwnerGuildShare={saveOwnerShare}
        saveOwnedGuildProfile={saveProfile}
        subscribeKoGuildKoTotals={() => () => {}}
        subscribeToAuthState={(onStateChanged) => {
          onStateChanged(authState);
          return () => {};
        }}
        useNotificationRuleV2={useNotificationRuleV2}
        verifyGuildShareAccess={verifyShareAccess}
      />
    </AppModeProvider>
  );

  await act(async () => {
    root?.render(renderTree());
    await flushPromises();
  });

  await waitForAppReady(pathname, authState);

  return {
    rerender: async () => {
      await act(async () => {
        root?.render(renderTree());
        await flushPromises();
      });
      await waitForAppReady(pathname, authState);
    }
  };
}

async function waitForAppReady(pathname: string, authState: AuthState) {
  if (pathname === "/" && authState.status === "signed-in") {
    await vi.waitFor(() => {
      expect(document.querySelector(".firebase-auth-user")).not.toBeNull();
    });
    return;
  }

  if (pathname !== "/") {
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Guild Battle Monitor");
    });
  }
}

async function openOwnedGuildSettings() {
  await openSettings();
  const settings = document.querySelector<HTMLDetailsElement>(".owned-guild-settings");

  if (!settings) {
    throw new Error("owned guild settings were not found");
  }

  await openDetails(settings);
}

async function openNotificationSettings() {
  await openSettings();
  const settings = document.querySelector<HTMLDetailsElement>(".notification-settings");

  if (!settings) {
    throw new Error("notification settings were not found");
  }

  await openDetails(settings);
  const button = Array.from(settings.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === "通知設定画面を開く"
  );

  if (!button) {
    throw new Error("notification settings open button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function openFirstNotificationRuleForEdit() {
  const ruleButton = document.querySelector<HTMLButtonElement>(".notification-rule-card__main");
  if (!ruleButton) {
    throw new Error("notification rule row button was not found");
  }

  await act(async () => {
    ruleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function editSelectedNotificationRuleName(nextName: string) {
  const nameInput = Array.from(document.querySelectorAll<HTMLInputElement>(".notification-rule-editor input")).find(
    (candidate) => candidate.type !== "checkbox" && !candidate.disabled
  );
  if (!nameInput) {
    throw new Error("notification rule name input was not found");
  }

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(nameInput, nextName);
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
  });
}

function getNotificationRuleEditorActionButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-rule-editor__action-buttons button")).find(
    (candidate) => candidate.textContent === label
  );
  if (!button) {
    throw new Error(`notification rule editor action button was not found: ${label}`);
  }
  return button;
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

function getNotificationDestinationSaveButton() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".notification-settings-dialog button")).find(
    (candidate) => candidate.textContent === "保存"
  );

  if (!button) {
    throw new Error("notification destination save button was not found");
  }

  return button;
}

async function clickSettingsSaveButton() {
  const button = document.querySelector<HTMLButtonElement>(".settings-dialog__actions button");

  if (!button) {
    throw new Error("settings save button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
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

function createNotificationRule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: "rule-1",
    battleType: "guildBattle",
    name: "見落とし防止",
    enabled: true,
    conditions: {
      startTime: "21:00",
      defenseCountMax: 20,
      attackCountMin: 15
    },
    message: {
      usernameTemplate: "ギルバト監視BOT - {拠点名}",
      mention: { type: "here" },
      titleTemplate: "⚠ {拠点名}が攻撃されています！",
      bodyTemplate: "{拠点名}が{侵攻ギルド}から攻撃を受けています。"
    },
    ...overrides
  };
}

function createNotificationRuleV2(overrides: Partial<NotificationRuleV2> = {}): NotificationRuleV2 {
  return {
    id: "v2-rule",
    schemaVersion: 2,
    battleType: "guildBattle",
    battleSide: "defense",
    name: "見落とし防止",
    enabled: true,
    sortOrder: 0,
    schedule: {
      startTime: "21:00",
      endTime: null
    },
    targetGuildIds: [],
    detailConditions: {
      operator: "OR",
      children: [
        {
          type: "group",
          operator: "AND",
          children: [
            { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
            { type: "condition", field: "attackCount", operator: ">=", value: 1 }
          ]
        }
      ]
    },
    message: {
      usernameTemplate: "ギルバト監視BOT - {拠点名}",
      mention: { type: "here" },
      titleTemplate: "⚠ {拠点名}が攻撃されています！",
      bodyTemplate: "{拠点名}が{侵攻ギルド}から攻撃を受けています。"
    },
    ...overrides
  };
}

function createOwnerShareResult() {
  return {
    exists: true as const,
    guildId: "saved-guild",
    world: 37,
    guildName: "Saved Guild",
    adminAccessKey: "a_admin",
    guestAccessKey: "g_guest"
  };
}

function createMissingOwnerShareResult() {
  return {
    exists: false as const,
    guildId: "saved-guild"
  };
}

function createSaveOwnerShareResult() {
  return {
    guildId: "saved-guild",
    world: 37,
    guildName: "Saved Guild",
    adminAccessKey: "a_admin",
    guestAccessKey: "g_guest"
  };
}

function createSharedAccessResult(role: "admin" | "viewer") {
  return {
    role,
    guildId: "saved-guild",
    world: 37,
    guildName: "Saved Guild"
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


async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
