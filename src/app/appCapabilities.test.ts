import { describe, expect, it } from "vitest";
import { createAppCapabilities, createFirebaseAppCapabilities } from "./appCapabilities";

describe("createAppCapabilities", () => {
  it("keeps only local settings available for GitHub Pages-like owner usage", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: false,
      hasNotificationSettings: false,
      hasOwnedGuildProfilePersistence: false,
      hasShareSettings: false,
      isSignedInOwner: false,
      mode: "owner"
    });

    expect(capabilities.localSettings).toEqual({
      visible: true,
      editable: true,
      persistable: true
    });
    expect(capabilities.ownedGuildProfile.visible).toBe(false);
    expect(capabilities.notifications.visible).toBe(false);
    expect(capabilities.shareUrls.visible).toBe(false);
    expect(capabilities.koMonitor.visible).toBe(false);
  });

  it("shows owner Firebase settings when signed in and persistence is available", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: true,
      hasNotificationSettings: true,
      hasOwnedGuildProfilePersistence: true,
      hasShareSettings: true,
      isSignedInOwner: true,
      mode: "owner"
    });

    expect(capabilities.ownedGuildProfile.visible).toBe(true);
    expect(capabilities.notifications.visible).toBe(true);
    expect(capabilities.notifications.webhookUrlVisible).toBe(true);
    expect(capabilities.shareUrls.visible).toBe(true);
  });

  it("keeps admin notification controls visible without owner-only webhook URL", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: true,
      hasNotificationSettings: true,
      hasOwnedGuildProfilePersistence: true,
      hasShareSettings: true,
      isSignedInOwner: false,
      mode: "admin"
    });

    expect(capabilities.notifications.visible).toBe(true);
    expect(capabilities.notifications.webhookUrlVisible).toBe(false);
    expect(capabilities.ownedGuildProfile.visible).toBe(false);
    expect(capabilities.shareUrls.visible).toBe(false);
  });

  it("hides management settings for guest while keeping local settings editable", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: true,
      hasNotificationSettings: true,
      hasOwnedGuildProfilePersistence: true,
      hasShareSettings: true,
      isSignedInOwner: false,
      mode: "guest"
    });

    expect(capabilities.localSettings.editable).toBe(true);
    expect(capabilities.localSettings.persistable).toBe(false);
    expect(capabilities.notifications.visible).toBe(false);
    expect(capabilities.ownedGuildProfile.visible).toBe(false);
    expect(capabilities.shareUrls.visible).toBe(false);
  });

  it("shows KO monitor only when Firebase, the view, and guild context are available", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: true,
      hasConfiguredGuildContext: true,
      hasKoMonitorView: true,
      hasNotificationSettings: true,
      hasOwnedGuildProfilePersistence: true,
      hasShareSettings: true,
      isSignedInOwner: false,
      mode: "guest"
    });

    expect(capabilities.koMonitor.visible).toBe(true);
  });

  it("hides KO monitor without a configured guild context", () => {
    const capabilities = createAppCapabilities({
      firebaseEnabled: true,
      hasConfiguredGuildContext: false,
      hasKoMonitorView: true,
      hasNotificationSettings: true,
      hasOwnedGuildProfilePersistence: true,
      hasShareSettings: true,
      isSignedInOwner: true,
      mode: "owner"
    });

    expect(capabilities.koMonitor.visible).toBe(false);
  });
});

describe("createFirebaseAppCapabilities", () => {
  it.each([
    ["owner", true],
    ["admin", false],
    ["guest", false]
  ] as const)("matches the existing Firebase capability rules for %s", (mode, isSignedInOwner) => {
    expect(createFirebaseAppCapabilities({ isSignedInOwner, mode })).toEqual(
      createAppCapabilities({
        firebaseEnabled: true,
        hasNotificationSettings: true,
        hasOwnedGuildProfilePersistence: true,
        hasShareSettings: true,
        isSignedInOwner,
        mode
      })
    );
  });
});
