import { getAppModePermissions, type AppMode, type AppModePermissions } from "./appMode";

export interface CapabilityState {
  readonly visible: boolean;
  readonly editable: boolean;
}

export interface LocalSettingsCapabilities extends CapabilityState {
  readonly persistable: boolean;
}

export interface NotificationCapabilities extends CapabilityState {
  readonly webhookUrlVisible: boolean;
}

export interface KoMonitorCapabilities {
  readonly visible: boolean;
}

export interface AppCapabilities {
  readonly localSettings: LocalSettingsCapabilities;
  readonly ownedGuildProfile: CapabilityState;
  readonly notifications: NotificationCapabilities;
  readonly shareUrls: CapabilityState;
  readonly koMonitor: KoMonitorCapabilities;
}

export interface CreateAppCapabilitiesInput {
  readonly firebaseEnabled: boolean;
  readonly hasConfiguredGuildContext?: boolean;
  readonly hasKoMonitorView?: boolean;
  readonly hasNotificationSettings: boolean;
  readonly hasOwnedGuildProfilePersistence: boolean;
  readonly hasShareSettings: boolean;
  readonly isSignedInOwner: boolean;
  readonly mode: AppMode;
  readonly modePermissions?: AppModePermissions;
}

export interface CreateFirebaseAppCapabilitiesInput {
  readonly isSignedInOwner: boolean;
  readonly mode: AppMode;
}

export function createAppCapabilities({
  firebaseEnabled,
  hasConfiguredGuildContext = false,
  hasKoMonitorView = false,
  hasNotificationSettings,
  hasOwnedGuildProfilePersistence,
  hasShareSettings,
  isSignedInOwner,
  mode,
  modePermissions = getAppModePermissions(mode)
}: CreateAppCapabilitiesInput): AppCapabilities {
  const ownedGuildProfileVisible =
    modePermissions.canManageGuildProfile && hasOwnedGuildProfilePersistence;
  const notificationVisible =
    modePermissions.canManageNotifications && hasNotificationSettings;
  const shareUrlsVisible =
    modePermissions.canManageShareUrls && hasShareSettings && ownedGuildProfileVisible;
  const webhookUrlVisible =
    firebaseEnabled && mode === "owner" && isSignedInOwner && notificationVisible;

  return {
    localSettings: {
      visible: true,
      editable: modePermissions.canEditViewSettings,
      persistable: modePermissions.canPersistViewSettings
    },
    ownedGuildProfile: {
      visible: ownedGuildProfileVisible,
      editable: ownedGuildProfileVisible
    },
    notifications: {
      visible: notificationVisible,
      editable: notificationVisible,
      webhookUrlVisible
    },
    shareUrls: {
      visible: shareUrlsVisible,
      editable: shareUrlsVisible
    },
    koMonitor: {
      visible: firebaseEnabled && hasKoMonitorView && hasConfiguredGuildContext
    }
  };
}

export function createFirebaseAppCapabilities({
  isSignedInOwner,
  mode
}: CreateFirebaseAppCapabilitiesInput): AppCapabilities {
  return createAppCapabilities({
    firebaseEnabled: true,
    hasNotificationSettings: true,
    hasOwnedGuildProfilePersistence: true,
    hasShareSettings: true,
    isSignedInOwner,
    mode
  });
}
