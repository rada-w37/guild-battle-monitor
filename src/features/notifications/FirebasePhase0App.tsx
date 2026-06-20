import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFirebaseAppCapabilities } from "../../app/appCapabilities";
import { getFirebasePermissionsOverride, useAppRoute, type AppRoute } from "../../app/appMode";
import { signInWithGoogle, signOutCurrentUser, subscribeToAuthState } from "../auth/authService";
import type { AuthState } from "../auth/types";
import { createGuildShareUrl } from "../guildBattle/guildShare";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import {
  getOwnerGuildShare,
  saveOwnerGuildShare,
  verifyGuildShareAccess
} from "../guildBattle/guildShareFunctionsRepository";
import {
  GuildBattlePlaceholder,
  type OwnedGuildProfilePersistence,
  type SettingsDraftExternal,
  type SharedGuildContext
} from "../guildBattle/GuildBattlePlaceholder";
import {
  loadKoGuildKoTotals,
  loadKoObserverRunMeta,
  subscribeKoGuildKoTotals
} from "../koMonitor/koObserverRepository";
import type { KoGuildKoTotal, KoGuildKoTotalsSubscriber, KoObserverRunMeta } from "../koMonitor/types";
import {
  loadOwnedGuildProfile,
  saveOwnedGuildProfile
} from "../guildBattle/ownedGuildProfileRepository";
import type { GuildShare, OwnedGuildProfile } from "../guildBattle/types";
import { NotificationSettingsDialog } from "./NotificationSettingsDialog";
import {
  deleteNotificationRule,
  getNotificationSettings,
  saveNotificationDestination,
  saveNotificationRule,
  suspendNotificationRule
} from "./notificationSettingsFunctionsRepository";
import type { NotificationSettingsRole } from "./types";

const OWNED_GUILD_PROFILE_ERROR_MESSAGE =
  "所属ギルド設定の保存に失敗しました。ログイン状態またはFirestore設定を確認してください。";
const SHARE_GENERATION_ERROR_MESSAGE =
  "共有URLの生成に失敗しました。ログイン状態またはFirestore設定を確認してください。";

interface GuildShareState {
  readonly exists: boolean;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly saveMetadata: (profile: OwnedGuildProfile) => Promise<GuildShare | null>;
  readonly share: GuildShare | null;
  readonly sourceGuildName: string | null;
  readonly sourceWorld: number | null;
}

interface FirebasePhase0AppProps {
  readonly loadOwnedGuildProfile?: typeof loadOwnedGuildProfile;
  readonly getOwnerGuildShare?: typeof getOwnerGuildShare;
  readonly getNotificationSettings?: typeof getNotificationSettings;
  readonly loadKoObserverRunMeta?: () => Promise<KoObserverRunMeta | null>;
  readonly loadKoGuildKoTotals?: () => Promise<readonly KoGuildKoTotal[]>;
  readonly subscribeKoGuildKoTotals?: KoGuildKoTotalsSubscriber;
  readonly deleteNotificationRule?: typeof deleteNotificationRule;
  readonly saveOwnedGuildProfile?: typeof saveOwnedGuildProfile;
  readonly saveOwnerGuildShare?: typeof saveOwnerGuildShare;
  readonly verifyGuildShareAccess?: typeof verifyGuildShareAccess;
  readonly saveNotificationDestination?: typeof saveNotificationDestination;
  readonly saveNotificationRule?: typeof saveNotificationRule;
  readonly suspendNotificationRule?: typeof suspendNotificationRule;
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly subscribeToAuthState?: typeof subscribeToAuthState;
}

export function FirebasePhase0App({
  loadOwnedGuildProfile: loadProfile = loadOwnedGuildProfile,
  getOwnerGuildShare: getOwnerShare = getOwnerGuildShare,
  getNotificationSettings: getNotificationSettingsForDialog = getNotificationSettings,
  loadKoObserverRunMeta: loadKoMeta = loadKoObserverRunMeta,
  loadKoGuildKoTotals: loadKoTotals = loadKoGuildKoTotals,
  subscribeKoGuildKoTotals: subscribeKoTotals = subscribeKoGuildKoTotals,
  deleteNotificationRule: deleteNotificationRuleForDialog = deleteNotificationRule,
  saveOwnedGuildProfile: saveProfile = saveOwnedGuildProfile,
  saveOwnerGuildShare: saveOwnerShare = saveOwnerGuildShare,
  verifyGuildShareAccess: verifyShareAccess = verifyGuildShareAccess,
  saveNotificationDestination: saveNotificationDestinationForDialog = saveNotificationDestination,
  saveNotificationRule: saveNotificationRuleForDialog = saveNotificationRule,
  suspendNotificationRule: suspendNotificationRuleForDialog = suspendNotificationRule,
  loadSnapshot = loadLocalGvgSnapshot,
  subscribeToAuthState: subscribeAuthState = subscribeToAuthState
}: FirebasePhase0AppProps = {}) {
  const appRoute = useAppRoute();
  const appMode = appRoute?.mode ?? "owner";
  const authState = useFirebaseAuthState(subscribeAuthState);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  const notificationSettingsUid = authState.status === "signed-in" ? authState.user.uid : null;
  const isSignedInOwner = appMode === "owner" && authState.status === "signed-in";
  const permissionsOverride = useMemo(
    () => getFirebasePermissionsOverride({ isSignedInOwner, mode: appMode }),
    [appMode, isSignedInOwner]
  );
  const appCapabilities = useMemo(
    () => createFirebaseAppCapabilities({ isSignedInOwner, mode: appMode }),
    [appMode, isSignedInOwner]
  );
  const ownerUid = appMode === "owner" ? notificationSettingsUid : null;
  const ownedGuildProfilePersistence = useOwnedGuildProfilePersistence(
    ownerUid,
    loadProfile,
    saveProfile
  );
  const guildShare = useGuildShare(ownerUid, ownedGuildProfilePersistence.profile, getOwnerShare, saveOwnerShare);
  const routeMode = appRoute?.mode ?? null;
  const routeGuildId = appRoute?.mode === "admin" || appRoute?.mode === "guest" ? appRoute.guildId : null;
  const routeAccessKey = appRoute?.mode === "admin" || appRoute?.mode === "guest" ? appRoute.accessKey : null;
  const sharedGuild = useResolvedSharedGuild({
    verifyShareAccess,
    routeAccessKey,
    routeGuildId,
    routeMode
  });

  const shareDraftExternal = useMemo<SettingsDraftExternal | undefined>(() => {
    if (appMode !== "owner" || !isCompleteOwnedGuildProfile(ownedGuildProfilePersistence.profile)) {
      return undefined;
    }

    const profile = ownedGuildProfilePersistence.profile;
    const hasExistingShare = guildShare.share?.guildId === profile.guildId;
    const isMetadataDirty =
      hasExistingShare &&
      (guildShare.sourceWorld !== profile.world || guildShare.sourceGuildName !== profile.guildName);

    return {
      hasValidationError: false,
      isDirty: isMetadataDirty,
      onCancel: () => {},
      onSave: async () => (await guildShare.saveMetadata(profile)) !== null
    };
  }, [appMode, guildShare, ownedGuildProfilePersistence.profile]);
  const settingsDraftExternal = shareDraftExternal;
  const ownedGuildProfilePersistenceWithShare = useMemo(
    () =>
      ({
        ...ownedGuildProfilePersistence,
        onSave: async (profile: OwnedGuildProfile) => {
          const profileSaved =
            ownedGuildProfilePersistence.onSave !== undefined
              ? await ownedGuildProfilePersistence.onSave(profile)
              : true;

          if (!profileSaved) {
            return false;
          }

          if (!isCompleteOwnedGuildProfile(profile)) {
            return true;
          }

          if (guildShare.share?.guildId !== profile.guildId) {
            return true;
          }

          return (await guildShare.saveMetadata(profile)) !== null;
        }
      }) satisfies OwnedGuildProfilePersistence,
    [guildShare, ownedGuildProfilePersistence]
  );

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch {
      setAuthError("Googleログインに失敗しました。");
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutCurrentUser();
    } catch {
      setAuthError("ログアウトに失敗しました。");
    }
  }, []);

  if (sharedGuild.status === "loading") {
    return (
      <main>
        <p>Loading</p>
      </main>
    );
  }

  const effectiveMode =
    sharedGuild.status === "valid" ? sharedGuild.sharedGuild.mode : sharedGuild.status === "fallback" ? "guest" : appMode;
  const effectiveSharedGuild = sharedGuild.status === "valid" ? sharedGuild.sharedGuild : null;
  const notificationSettingsContext = createNotificationSettingsContext({
    appMode,
    guildShare,
    ownedGuildProfile: ownedGuildProfilePersistence.profile,
    routeAccessKey,
    sharedGuild: effectiveSharedGuild
  });

  return (
    <GuildBattlePlaceholder
      loadSnapshot={loadSnapshot}
      loadKoObserverRunMeta={loadKoMeta}
      loadKoGuildKoTotals={loadKoTotals}
      subscribeKoGuildKoTotals={subscribeKoTotals}
      modeOverride={sharedGuild.status === "fallback" ? "guest" : undefined}
      permissionsOverride={permissionsOverride}
      settingsDraftExternal={settingsDraftExternal}
      headerActions={
        <AuthControl
          authState={authState}
          mode={effectiveMode}
          sharedGuild={effectiveSharedGuild}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      }
      notificationSettings={
        notificationSettingsContext === null ? undefined : (
          <NotificationSettingsEntry onOpen={() => setIsNotificationSettingsOpen(true)} />
        )
      }
      notificationSettingsDialog={
        isNotificationSettingsOpen && notificationSettingsContext !== null ? (
          <NotificationSettingsDialog
            deleteNotificationRule={deleteNotificationRuleForDialog}
            getNotificationSettings={getNotificationSettingsForDialog}
            request={notificationSettingsContext.request}
            role={notificationSettingsContext.role}
            saveNotificationDestination={saveNotificationDestinationForDialog}
            saveNotificationRule={saveNotificationRuleForDialog}
            suspendNotificationRule={suspendNotificationRuleForDialog}
            onClose={() => setIsNotificationSettingsOpen(false)}
          />
        ) : undefined
      }
      ownedGuildProfilePersistence={ownedGuildProfilePersistenceWithShare}
      sharedGuild={effectiveSharedGuild}
      shareSettings={
        <GuildSharePanel
          profile={ownedGuildProfilePersistence.profile}
          isSignedIn={notificationSettingsUid !== null}
          share={guildShare}
        />
      }
      afterHeader={
        <>
          {authError !== null ? <p className="firebase-message firebase-message--error">{authError}</p> : null}
          {authState.status === "unavailable" ? (
            <p className="firebase-message">Firebase設定が未完了のため、ログイン・通知設定は利用できません。</p>
          ) : null}
        </>
      }
    />
  );
}

function useFirebaseAuthState(subscribeAuthState: typeof subscribeToAuthState): AuthState {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });

  useEffect(
    () =>
      subscribeAuthState((nextAuthState) => {
        setAuthState((currentAuthState) =>
          isSameAuthState(currentAuthState, nextAuthState) ? currentAuthState : nextAuthState
        );
      }),
    [subscribeAuthState]
  );

  return authState;
}

function isSameAuthState(currentAuthState: AuthState, nextAuthState: AuthState): boolean {
  if (currentAuthState.status !== nextAuthState.status) {
    return false;
  }

  if (currentAuthState.status === "error" && nextAuthState.status === "error") {
    return currentAuthState.error === nextAuthState.error;
  }

  if (currentAuthState.status !== "signed-in" || nextAuthState.status !== "signed-in") {
    return true;
  }

  return (
    currentAuthState.user.uid === nextAuthState.user.uid &&
    currentAuthState.user.displayName === nextAuthState.user.displayName &&
    currentAuthState.user.email === nextAuthState.user.email &&
    currentAuthState.user.photoUrl === nextAuthState.user.photoUrl
  );
}

type GuildShareDataState = Omit<GuildShareState, "saveMetadata">;

function useGuildShare(
  uid: string | null,
  profile: OwnedGuildProfile | null,
  getOwnerShare: typeof getOwnerGuildShare,
  saveOwnerShare: typeof saveOwnerGuildShare
): GuildShareState {
  const [state, setState] = useState<GuildShareDataState>({
    exists: false,
    error: null,
    isLoading: false,
    isSaving: false,
    share: null,
    sourceGuildName: null,
    sourceWorld: null
  });

  useEffect(() => {
    let isDisposed = false;

    if (uid === null || !isCompleteOwnedGuildProfile(profile)) {
      setState((currentState) =>
        getNextGuildShareState(currentState, {
          exists: false,
          error: null,
          isLoading: false,
          isSaving: false,
          share: null,
          sourceGuildName: null,
          sourceWorld: null
        })
      );
      return;
    }

    setState((currentState) =>
      getNextGuildShareState(currentState, {
        ...currentState,
        error: null,
        isLoading: true,
        isSaving: false,
        share: null
      })
    );
    void getOwnerShare(profile.guildId)
      .then((loadedShare) => {
        if (!isDisposed) {
          if (!loadedShare.exists) {
            setState((currentState) =>
              getNextGuildShareState(currentState, {
                exists: false,
                error: null,
                isLoading: false,
                isSaving: false,
                share: null,
                sourceGuildName: null,
                sourceWorld: null
              })
            );
            return;
          }

          setState((currentState) =>
            getNextGuildShareState(currentState, {
              exists: true,
              error: null,
              isLoading: false,
              isSaving: false,
              share: {
                guildId: loadedShare.guildId,
                adminAccessKey: loadedShare.adminAccessKey,
                guestAccessKey: loadedShare.guestAccessKey
              },
              sourceGuildName: loadedShare.guildName,
              sourceWorld: loadedShare.world
            })
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load owner guild share.", error);
        if (!isDisposed) {
          setState((currentState) =>
            getNextGuildShareState(currentState, {
              error: SHARE_GENERATION_ERROR_MESSAGE,
              isLoading: false,
              isSaving: false,
              exists: false,
              share: null,
              sourceGuildName: null,
              sourceWorld: null
            })
          );
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [getOwnerShare, profile, uid]);

  const saveMetadata = useCallback(async (nextProfile: OwnedGuildProfile): Promise<GuildShare | null> => {
    if (uid === null || !isCompleteOwnedGuildProfile(nextProfile) || state.share?.guildId !== nextProfile.guildId) {
      return null;
    }

    setState((currentState) => getNextGuildShareState(currentState, { ...currentState, error: null, isSaving: true }));

    try {
      const savedShare = await saveOwnerShare({
        guildId: nextProfile.guildId,
        world: nextProfile.world,
        guildName: nextProfile.guildName
      });
      const nextShare = {
        guildId: savedShare.guildId,
        adminAccessKey: savedShare.adminAccessKey,
        guestAccessKey: savedShare.guestAccessKey
      };
      setState({
        exists: true,
        error: null,
        isLoading: false,
        isSaving: false,
        share: nextShare,
        sourceGuildName: savedShare.guildName,
        sourceWorld: savedShare.world
      });
      return nextShare;
    } catch (error) {
      console.error("Failed to save owner guild share.", error);
      setState((currentState) =>
        getNextGuildShareState(currentState, { ...currentState, error: SHARE_GENERATION_ERROR_MESSAGE, isSaving: false })
      );
      return null;
    }
  }, [saveOwnerShare, state.share, uid]);

  return useMemo(
    () => ({
      ...state,
      saveMetadata
    }),
    [saveMetadata, state]
  );
}

function getNextGuildShareState(
  currentState: GuildShareDataState,
  nextState: GuildShareDataState
): GuildShareDataState {
  return currentState.error === nextState.error &&
    currentState.exists === nextState.exists &&
    currentState.isLoading === nextState.isLoading &&
    currentState.isSaving === nextState.isSaving &&
    currentState.share === nextState.share &&
    currentState.sourceGuildName === nextState.sourceGuildName &&
    currentState.sourceWorld === nextState.sourceWorld
    ? currentState
    : nextState;
}

type ResolvedSharedGuildState =
  | { readonly status: "owner" }
  | { readonly status: "loading" }
  | { readonly status: "fallback" }
  | { readonly status: "valid"; readonly sharedGuild: SharedGuildContext };

function useResolvedSharedGuild({
  verifyShareAccess,
  routeAccessKey,
  routeGuildId,
  routeMode
}: {
  readonly verifyShareAccess: typeof verifyGuildShareAccess;
  readonly routeAccessKey: string | null;
  readonly routeGuildId: string | null;
  readonly routeMode: AppRoute["mode"] | null;
}): ResolvedSharedGuildState {
  const [state, setState] = useState<ResolvedSharedGuildState>({ status: "owner" });

  useEffect(() => {
    let isDisposed = false;

    if (routeMode === null || routeMode === "owner" || routeGuildId === null || routeAccessKey === null) {
      setState((currentState) => (currentState.status === "owner" ? currentState : { status: "owner" }));
      return;
    }

    setState((currentState) => (currentState.status === "loading" ? currentState : { status: "loading" }));
    void verifyShareAccess({ guildId: routeGuildId, accessKey: routeAccessKey })
      .then((share) => {
        if (isDisposed) {
          return;
        }

        setState((currentState) =>
          getNextResolvedSharedGuildState(currentState, {
            status: "valid",
            sharedGuild: {
              mode: share.role === "viewer" ? "guest" : "admin",
              guildId: routeGuildId,
              world: share.world,
              guildName: share.guildName
            }
          })
        );
      })
      .catch((error) => {
        console.error("Failed to verify guild share access.", error);
        if (!isDisposed) {
          setState((currentState) => (currentState.status === "fallback" ? currentState : { status: "fallback" }));
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [routeAccessKey, routeGuildId, routeMode, verifyShareAccess]);

  return state;
}

function getNextResolvedSharedGuildState(
  currentState: ResolvedSharedGuildState,
  nextState: ResolvedSharedGuildState
): ResolvedSharedGuildState {
  if (currentState.status !== nextState.status) {
    return nextState;
  }

  if (currentState.status !== "valid" || nextState.status !== "valid") {
    return currentState;
  }

  return currentState.sharedGuild.mode === nextState.sharedGuild.mode &&
    currentState.sharedGuild.guildId === nextState.sharedGuild.guildId &&
    currentState.sharedGuild.world === nextState.sharedGuild.world &&
    currentState.sharedGuild.guildName === nextState.sharedGuild.guildName
    ? currentState
    : nextState;
}

function isCompleteOwnedGuildProfile(
  profile: OwnedGuildProfile | null
): profile is { readonly world: number; readonly guildId: string; readonly guildName: string } {
  return (
    profile !== null &&
    profile.world !== null &&
    profile.guildId !== null &&
    profile.guildName !== null
  );
}

function createNotificationSettingsContext({
  appMode,
  guildShare,
  ownedGuildProfile,
  routeAccessKey,
  sharedGuild
}: {
  readonly appMode: AppRoute["mode"];
  readonly guildShare: GuildShareState;
  readonly ownedGuildProfile: OwnedGuildProfile | null;
  readonly routeAccessKey: string | null;
  readonly sharedGuild: SharedGuildContext | null;
}): { readonly request: { readonly guildId: string; readonly accessKey?: string }; readonly role: NotificationSettingsRole } | null {
  if (
    appMode === "owner" &&
    isCompleteOwnedGuildProfile(ownedGuildProfile) &&
    guildShare.share !== null &&
    guildShare.share.guildId === ownedGuildProfile.guildId
  ) {
    return {
      request: { guildId: guildShare.share.guildId },
      role: "guildOwner"
    };
  }

  if (sharedGuild?.mode === "admin" && routeAccessKey !== null) {
    return {
      request: { guildId: sharedGuild.guildId, accessKey: routeAccessKey },
      role: "admin"
    };
  }

  return null;
}

function NotificationSettingsEntry({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <section className="notification-settings-entry">
      <h3>通知設定</h3>
      <p className="notification-settings-entry__description">通知ルールを管理します。</p>
      <button className="load-form__button" type="button" onClick={onOpen}>
        通知設定画面を開く
      </button>
    </section>
  );
}

function GuildSharePanel({
  profile,
  isSignedIn,
  share
}: {
  readonly profile: OwnedGuildProfile | null;
  readonly isSignedIn: boolean;
  readonly share: GuildShareState;
}) {
  const [copiedRole, setCopiedRole] = useState<"admin" | "guest" | null>(null);

  if (!isCompleteOwnedGuildProfile(profile)) {
    return <p className="firebase-message">所属ギルドを設定してください</p>;
  }

  if (!isSignedIn) {
    return <p className="firebase-message">ログインすると共有URLを表示できます</p>;
  }

  if (share.error !== null) {
    return <p className="firebase-message firebase-message--error">{share.error}</p>;
  }

  if (share.isLoading || share.isSaving) {
    return <p className="firebase-message">共有URLを確認中です</p>;
  }

  if (share.share === null || share.share.guildId !== profile.guildId) {
    return <p className="firebase-message">共有URLは未作成です</p>;
  }

  const adminUrl = createGuildShareUrl(window.location.origin, share.share.guildId, share.share.adminAccessKey);
  const viewerUrl = createGuildShareUrl(window.location.origin, share.share.guildId, share.share.guestAccessKey);

  async function handleCopy(role: "admin" | "guest", url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRole(role);
    } catch {
      setCopiedRole(null);
    }
  }

  return (
    <div className="share-settings__urls">
      <ShareUrlField
        label="Admin URL"
        url={adminUrl}
        wasCopied={copiedRole === "admin"}
        onCopy={() => void handleCopy("admin", adminUrl)}
      />
      <ShareUrlField
        label="Viewer URL"
        url={viewerUrl}
        wasCopied={copiedRole === "guest"}
        onCopy={() => void handleCopy("guest", viewerUrl)}
      />
    </div>
  );
}
function ShareUrlField({
  label,
  url,
  wasCopied,
  onCopy
}: {
  readonly label: string;
  readonly url: string;
  readonly wasCopied: boolean;
  readonly onCopy: () => void;
}) {
  return (
    <div className="share-settings__url">
      <span className="field__label">{label}</span>
      <div className="share-settings__url-row">
        <input className="field__input" readOnly type="url" value={url} />
        <button className="load-form__button" type="button" onClick={onCopy}>コピー</button>
      </div>
      {wasCopied ? <p className="firebase-message firebase-message--success">コピーしました</p> : null}
    </div>
  );
}

function useOwnedGuildProfilePersistence(
  uid: string | null,
  loadProfile: typeof loadOwnedGuildProfile,
  saveProfile: typeof saveOwnedGuildProfile
): OwnedGuildProfilePersistence {
  const [profile, setProfile] = useState<OwnedGuildProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const persistedProfileKeyRef = useRef<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let isDisposed = false;
    persistedProfileKeyRef.current = null;

    if (uid === null) {
      setProfile((currentProfile) => (currentProfile === null ? currentProfile : null));
      setError((currentError) => (currentError === null ? currentError : null));
      setIsLoading((currentIsLoading) => (currentIsLoading ? false : currentIsLoading));
      return;
    }

    setIsLoading((currentIsLoading) => (currentIsLoading ? currentIsLoading : true));
    setError((currentError) => (currentError === null ? currentError : null));
    void loadProfile(uid)
      .then((loadedProfile) => {
        if (!isDisposed) {
          setProfile((currentProfile) =>
            createOwnedGuildProfileKey(currentProfile) === createOwnedGuildProfileKey(loadedProfile)
              ? currentProfile
              : loadedProfile
          );
          persistedProfileKeyRef.current = createOwnedGuildProfileKey(loadedProfile);
          setIsLoading(false);
        }
      })
      .catch((loadError) => {
        console.error("Failed to load users/{uid}/guild/profile.", loadError);
        if (!isDisposed) {
          setProfile((currentProfile) => (currentProfile === null ? currentProfile : null));
          setIsLoading((currentIsLoading) => (currentIsLoading ? false : currentIsLoading));
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadProfile, uid]);

  const saveProfileNow = useCallback(async (nextProfile: OwnedGuildProfile): Promise<boolean> => {
    setProfile((currentProfile) =>
      createOwnedGuildProfileKey(currentProfile) === createOwnedGuildProfileKey(nextProfile)
        ? currentProfile
        : nextProfile
    );
    setError((currentError) => (currentError === null ? currentError : null));

    if (uid === null || isLoading) {
      return true;
    }

    const nextProfileKey = createOwnedGuildProfileKey(nextProfile);

    if (persistedProfileKeyRef.current === nextProfileKey) {
      return true;
    }

    persistedProfileKeyRef.current = nextProfileKey;

    try {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => saveProfile(uid, nextProfile));
      await saveQueueRef.current;
      return true;
    } catch (saveError) {
      console.error("Failed to save users/{uid}/guild/profile.", saveError);
      if (persistedProfileKeyRef.current === nextProfileKey) {
        persistedProfileKeyRef.current = null;
      }
      setError(OWNED_GUILD_PROFILE_ERROR_MESSAGE);
      return false;
    }
  }, [isLoading, saveProfile, uid]);

  const handleChange = useCallback((nextProfile: OwnedGuildProfile) => {
    void saveProfileNow(nextProfile);
  }, [saveProfileNow]);

  return useMemo(
    () => ({
      error,
      isLoading,
      isSignedIn: uid !== null,
      profile,
      onChange: handleChange,
      onSave: saveProfileNow
    }),
    [error, handleChange, isLoading, profile, saveProfileNow, uid]
  );
}

function createOwnedGuildProfileKey(profile: OwnedGuildProfile | null): string {
  return JSON.stringify(
    profile ?? {
      world: null,
      guildId: null,
      guildName: null
    }
  );
}

function AuthControl({
  authState,
  mode,
  sharedGuild,
  onSignIn,
  onSignOut
}: {
  readonly authState: AuthState;
  readonly mode: "owner" | "admin" | "guest";
  readonly sharedGuild: SharedGuildContext | null;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}) {
  if (mode !== "owner") {
    if (sharedGuild === null || sharedGuild.guildName.length === 0 || !Number.isFinite(sharedGuild.world)) {
      return null;
    }

    return <span className="firebase-auth-status">{`W${sharedGuild.world} : ${sharedGuild.guildName}`}</span>;
  }

  if (authState.status === "signed-out") {
    return (
      <div className="firebase-auth-user">
        <button className="firebase-auth-button" type="button" onClick={onSignIn}>ログイン</button>
      </div>
    );
  }

  if (authState.status === "signed-in") {
    return (
      <div className="firebase-auth-user">
        <span>{authState.user.displayName || authState.user.email || "Owner"}</span>
        <button className="firebase-auth-button" type="button" onClick={onSignOut}>ログアウト</button>
      </div>
    );
  }

  if (authState.status === "loading") {
    return null;
  }

  if (authState.status === "error") {
    return null;
  }

  return null;
}

function SharedGuildNotFoundPage() {
  return (
    <main>
      <h1>ギルドが見つかりません</h1>
    </main>
  );
}
