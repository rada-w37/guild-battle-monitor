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
  readonly hasNotificationSettings: boolean;
  readonly hasOwnedGuildProfilePersistence: boolean;
  readonly hasShareSettings: boolean;
  readonly isSignedInOwner: boolean;
  readonly mode: AppMode;
  readonly modePermissions?: AppModePermissions;
}

export function createAppCapabilities({
  firebaseEnabled,
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
      visible: false
    }
  };
}
