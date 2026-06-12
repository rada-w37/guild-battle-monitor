import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createFirebaseAppCapabilities } from "../../app/appCapabilities";
import { getFirebasePermissionsOverride, useAppRoute, type AppRoute } from "../../app/appMode";
import { signInWithGoogle, signOutCurrentUser, subscribeToAuthState } from "../auth/authService";
import type { AuthState } from "../auth/types";
import { createGuildShare, createGuildShareUrl } from "../guildBattle/guildShare";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import {
  loadGuildShare,
  loadPublicGuildShare,
  saveGuildShare,
  savePublicGuildShare
} from "../guildBattle/guildShareRepository";
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
import type { GuildShare, OwnedGuildProfile, PublicGuildShare } from "../guildBattle/types";
import { loadNotificationDestination, saveNotificationDestination } from "./notificationDestinationRepository";

const DEFAULT_DESTINATION_ID = "default";
const DEFAULT_DESTINATION_NAME = "ギルドDiscord";
const DEFAULT_SELECTABLE_MENTIONS = ["@here", "@everyone"] as const;
const OWNED_GUILD_PROFILE_ERROR_MESSAGE =
  "所属ギルド設定の保存に失敗しました。ログイン状態またはFirestore設定を確認してください。";
const SHARE_GENERATION_ERROR_MESSAGE =
  "共有URLの生成に失敗しました。ログイン状態またはFirestore設定を確認してください。";

interface GuildShareState {
  readonly error: string | null;
  readonly ensureShare: (profile: OwnedGuildProfile) => Promise<GuildShare | null>;
  readonly isLoading: boolean;
  readonly share: GuildShare | null;
}

interface PublicGuildShareCacheState {
  readonly error: string | null;
  readonly isSaving: boolean;
  readonly saveForProfile: (profile: OwnedGuildProfile, share: GuildShare) => Promise<boolean>;
}

interface FirebasePhase0AppProps {
  readonly loadOwnedGuildProfile?: typeof loadOwnedGuildProfile;
  readonly loadGuildShare?: typeof loadGuildShare;
  readonly loadPublicGuildShare?: typeof loadPublicGuildShare;
  readonly loadNotificationDestination?: typeof loadNotificationDestination;
  readonly loadKoObserverRunMeta?: () => Promise<KoObserverRunMeta | null>;
  readonly loadKoGuildKoTotals?: () => Promise<readonly KoGuildKoTotal[]>;
  readonly subscribeKoGuildKoTotals?: KoGuildKoTotalsSubscriber;
  readonly saveOwnedGuildProfile?: typeof saveOwnedGuildProfile;
  readonly saveGuildShare?: typeof saveGuildShare;
  readonly savePublicGuildShare?: typeof savePublicGuildShare;
  readonly saveNotificationDestination?: typeof saveNotificationDestination;
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly subscribeToAuthState?: typeof subscribeToAuthState;
}

export function FirebasePhase0App({
  loadOwnedGuildProfile: loadProfile = loadOwnedGuildProfile,
  loadGuildShare: loadShare = loadGuildShare,
  loadPublicGuildShare: loadPublicShare = loadPublicGuildShare,
  loadNotificationDestination: loadDestination = loadNotificationDestination,
  loadKoObserverRunMeta: loadKoMeta = loadKoObserverRunMeta,
  loadKoGuildKoTotals: loadKoTotals = loadKoGuildKoTotals,
  subscribeKoGuildKoTotals: subscribeKoTotals = subscribeKoGuildKoTotals,
  saveOwnedGuildProfile: saveProfile = saveOwnedGuildProfile,
  saveGuildShare: saveShare = saveGuildShare,
  savePublicGuildShare: savePublicShare = savePublicGuildShare,
  saveNotificationDestination: saveDestination = saveNotificationDestination,
  loadSnapshot = loadLocalGvgSnapshot,
  subscribeToAuthState: subscribeAuthState = subscribeToAuthState
}: FirebasePhase0AppProps = {}) {
  const appRoute = useAppRoute();
  const appMode = appRoute?.mode ?? "owner";
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [authError, setAuthError] = useState<string | null>(null);
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
  const guildShare = useGuildShare(
    ownerUid,
    loadShare,
    saveShare
  );
  const sharedGuild = useResolvedSharedGuild(appRoute, loadPublicShare);
  const notificationDestinationDraft = useNotificationDestinationDraft(
    notificationSettingsUid,
    loadDestination,
    saveDestination,
    appCapabilities.notifications.webhookUrlVisible
  );

  const publicGuildShareCache = usePublicGuildShareCache(savePublicShare);
  const shareDraftExternal = useMemo<SettingsDraftExternal | undefined>(() => {
    if (appMode !== "owner" || !isCompleteOwnedGuildProfile(ownedGuildProfilePersistence.profile)) {
      return undefined;
    }

    const profile = ownedGuildProfilePersistence.profile;

    return {
      hasValidationError: false,
      isDirty: guildShare.share?.guildId !== profile.guildId,
      onCancel: () => {},
      onSave: async () => {
        const ensuredShare = await guildShare.ensureShare(profile);
        return ensuredShare === null ? false : publicGuildShareCache.saveForProfile(profile, ensuredShare);
      }
    };
  }, [appMode, guildShare, ownedGuildProfilePersistence.profile, publicGuildShareCache]);
  const settingsDraftExternal = useMemo(
    () => combineSettingsDraftExternals(notificationDestinationDraft.external, shareDraftExternal),
    [notificationDestinationDraft.external, shareDraftExternal]
  );
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

          const ensuredShare = await guildShare.ensureShare(profile);

          if (ensuredShare === null) {
            return false;
          }

          return publicGuildShareCache.saveForProfile(profile, ensuredShare);
        }
      }) satisfies OwnedGuildProfilePersistence,
    [guildShare, ownedGuildProfilePersistence, publicGuildShareCache]
  );

  useEffect(() => subscribeAuthState(setAuthState), [subscribeAuthState]);

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch {
      setAuthError("Googleログインに失敗しました。");
    }
  }

  async function handleSignOut() {
    setAuthError(null);
    try {
      await signOutCurrentUser();
    } catch {
      setAuthError("ログアウトに失敗しました。");
    }
  }

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
        <NotificationDestinationPanel
          draft={notificationDestinationDraft}
          showWebhookUrl={appCapabilities.notifications.webhookUrlVisible}
        />
      }
      ownedGuildProfilePersistence={ownedGuildProfilePersistenceWithShare}
      sharedGuild={effectiveSharedGuild}
      shareSettings={
        <GuildSharePanel
          profile={ownedGuildProfilePersistence.profile}
          publicCache={publicGuildShareCache}
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

function useGuildShare(uid: string | null, loadShare: typeof loadGuildShare, saveShare: typeof saveGuildShare): GuildShareState {
  const [state, setState] = useState<GuildShareState>({
    error: null,
    ensureShare,
    isLoading: false,
    share: null
  });

  useEffect(() => {
    let isDisposed = false;

    if (uid === null) {
      setState({ error: null, ensureShare, isLoading: false, share: null });
      return;
    }

    setState({ error: null, ensureShare, isLoading: true, share: null });
    void loadShare(uid)
      .then((loadedShare) => {
        if (!isDisposed) {
          setState({ error: null, ensureShare, isLoading: false, share: loadedShare });
        }
      })
      .catch((error) => {
        console.error("Failed to load users/{uid}/guild/share.", error);
        if (!isDisposed) {
          setState({ error: SHARE_GENERATION_ERROR_MESSAGE, ensureShare, isLoading: false, share: null });
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadShare, uid]);

  async function ensureShare(profile: OwnedGuildProfile): Promise<GuildShare | null> {
    if (uid === null || !isCompleteOwnedGuildProfile(profile)) {
      return null;
    }

    if (state.share?.guildId === profile.guildId) {
      return state.share;
    }

    const nextShare = createGuildShare(profile.guildId);
    setState((currentState) => ({ ...currentState, error: null, isLoading: true }));

    try {
      await saveShare(uid, nextShare);
      setState({ error: null, ensureShare, isLoading: false, share: nextShare });
      return nextShare;
    } catch (error) {
      console.error("Failed to save users/{uid}/guild/share.", error);
      setState({ error: SHARE_GENERATION_ERROR_MESSAGE, ensureShare, isLoading: false, share: null });
      return null;
    }
  }

  return state;
}

type ResolvedSharedGuildState =
  | { readonly status: "owner" }
  | { readonly status: "loading" }
  | { readonly status: "fallback" }
  | { readonly status: "valid"; readonly sharedGuild: SharedGuildContext };

function useResolvedSharedGuild(
  appRoute: AppRoute | null,
  loadPublicShare: typeof loadPublicGuildShare
): ResolvedSharedGuildState {
  const [state, setState] = useState<ResolvedSharedGuildState>({ status: "owner" });
  const routeMode = appRoute?.mode ?? null;
  const routeGuildId = appRoute?.mode === "admin" || appRoute?.mode === "guest" ? appRoute.guildId : null;
  const routeAccessKey = appRoute?.mode === "admin" || appRoute?.mode === "guest" ? appRoute.accessKey : null;

  useEffect(() => {
    let isDisposed = false;

    if (routeMode === null || routeMode === "owner" || routeGuildId === null || routeAccessKey === null) {
      setState((currentState) => (currentState.status === "owner" ? currentState : { status: "owner" }));
      return;
    }

    setState((currentState) => (currentState.status === "loading" ? currentState : { status: "loading" }));
    void loadPublicShare(routeGuildId)
      .then((share) => {
        if (isDisposed) {
          return;
        }

        const mode = resolveSharedMode(routeAccessKey, share);

        if (share === null || mode === null) {
          setState((currentState) => (currentState.status === "fallback" ? currentState : { status: "fallback" }));
          return;
        }

        setState((currentState) =>
          getNextResolvedSharedGuildState(currentState, {
            status: "valid",
            sharedGuild: {
              mode,
              guildId: routeGuildId,
              world: share.world,
              guildName: share.guildName
            }
          })
        );
      })
      .catch((error) => {
        console.error("Failed to load guildShares/{guildId}.", error);
        if (!isDisposed) {
          setState((currentState) => (currentState.status === "fallback" ? currentState : { status: "fallback" }));
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadPublicShare, routeAccessKey, routeGuildId, routeMode]);

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

function resolveSharedMode(accessKey: string, share: PublicGuildShare | null): "admin" | "guest" | null {
  if (share === null) {
    return null;
  }

  if (accessKey === share.adminAccessKey) {
    return "admin";
  }

  if (accessKey === share.guestAccessKey) {
    return "guest";
  }

  return null;
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

function combineSettingsDraftExternals(
  first: SettingsDraftExternal | undefined,
  second: SettingsDraftExternal | undefined
): SettingsDraftExternal | undefined {
  if (first === undefined) {
    return second;
  }

  if (second === undefined) {
    return first;
  }

  return {
    hasValidationError: first.hasValidationError || second.hasValidationError,
    isDirty: first.isDirty || second.isDirty,
    onCancel: () => {
      first.onCancel();
      second.onCancel();
    },
    onSave: async () => {
      const firstSaved = first.isDirty ? await first.onSave() : true;
      const secondSaved = second.isDirty ? await second.onSave() : true;
      return firstSaved && secondSaved;
    }
  };
}

function usePublicGuildShareCache(savePublicShare: typeof savePublicGuildShare): PublicGuildShareCacheState {
  const [state, setState] = useState<PublicGuildShareCacheState>({
    error: null,
    isSaving: false,
    saveForProfile
  });

  async function saveForProfile(profile: OwnedGuildProfile, share: GuildShare): Promise<boolean> {
    if (
      !isCompleteOwnedGuildProfile(profile) ||
      share === null ||
      share.guildId !== profile.guildId
    ) {
      return false;
    }

    const publicShare = {
      world: profile.world,
      guildName: profile.guildName,
      adminAccessKey: share.adminAccessKey,
      guestAccessKey: share.guestAccessKey
    };

    setState({ error: null, isSaving: true, saveForProfile });

    try {
      await savePublicShare(profile.guildId, publicShare);
      setState({ error: null, isSaving: false, saveForProfile });
      return true;
    } catch (error) {
      console.error("Failed to save guildShares/{guildId}.", error);
      setState({ error: SHARE_GENERATION_ERROR_MESSAGE, isSaving: false, saveForProfile });
      return false;
    }
  }

  return state;
}

function GuildSharePanel({
  profile,
  publicCache,
  isSignedIn,
  share
}: {
  readonly profile: OwnedGuildProfile | null;
  readonly publicCache: PublicGuildShareCacheState;
  readonly isSignedIn: boolean;
  readonly share: GuildShareState;
}) {
  const [copiedRole, setCopiedRole] = useState<"admin" | "guest" | null>(null);

  if (!isCompleteOwnedGuildProfile(profile)) {
    return <p className="firebase-message">所属ギルドを設定してください</p>;
  }

  if (!isSignedIn) {
    return <p className="firebase-message">ログインすると共有URLを生成できます</p>;
  }

  if (share.error !== null || publicCache.error !== null) {
    return <p className="firebase-message firebase-message--error">{share.error ?? publicCache.error}</p>;
  }

  if (share.isLoading || publicCache.isSaving) {
    return <p className="firebase-message">共有URLを生成中です</p>;
  }

  if (share.share === null || share.share.guildId !== profile.guildId) {
    return <p className="firebase-message">設定を保存すると共有URLを生成します。</p>;
  }

  const adminUrl = createGuildShareUrl(window.location.origin, share.share.guildId, share.share.adminAccessKey);
  const guestUrl = createGuildShareUrl(window.location.origin, share.share.guildId, share.share.guestAccessKey);

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
        label="管理者URL"
        url={adminUrl}
        wasCopied={copiedRole === "admin"}
        onCopy={() => void handleCopy("admin", adminUrl)}
      />
      <ShareUrlField
        label="閲覧者URL"
        url={guestUrl}
        wasCopied={copiedRole === "guest"}
        onCopy={() => void handleCopy("guest", guestUrl)}
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
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    void loadProfile(uid)
      .then((loadedProfile) => {
        if (!isDisposed) {
          setProfile(loadedProfile);
          persistedProfileKeyRef.current = createOwnedGuildProfileKey(loadedProfile);
          setIsLoading(false);
        }
      })
      .catch((loadError) => {
        console.error("Failed to load users/{uid}/guild/profile.", loadError);
        if (!isDisposed) {
          setProfile(null);
          setIsLoading(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadProfile, uid]);

  async function saveProfileNow(nextProfile: OwnedGuildProfile): Promise<boolean> {
    setProfile(nextProfile);
    setError(null);

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
  }

  function handleChange(nextProfile: OwnedGuildProfile) {
    void saveProfileNow(nextProfile);
  }

  return {
    error,
    isLoading,
    isSignedIn: uid !== null,
    profile,
    onChange: handleChange,
    onSave: saveProfileNow
  };
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

interface NotificationDestinationDraft {
  readonly enabled: boolean;
  readonly endpoint: string;
}

interface NotificationDestinationDraftController {
  readonly draft: NotificationDestinationDraft;
  readonly external: SettingsDraftExternal;
  readonly isError: boolean;
  readonly message: string | null;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setEndpoint: (endpoint: string) => void;
  readonly status: "loading" | "idle" | "saving";
  readonly uid: string | null;
  readonly validateEndpoint: () => void;
  readonly validationError: string | null;
}

function useNotificationDestinationDraft(
  uid: string | null,
  loadDestination: typeof loadNotificationDestination,
  saveDestination: typeof saveNotificationDestination,
  canEditEndpoint: boolean
): NotificationDestinationDraftController {
  const [persisted, setPersisted] = useState<NotificationDestinationDraft>({ enabled: true, endpoint: "" });
  const [draft, setDraft] = useState<NotificationDestinationDraft>({ enabled: true, endpoint: "" });
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isDirty = persisted.enabled !== draft.enabled || persisted.endpoint !== draft.endpoint;

  useEffect(() => {
    let isDisposed = false;
    setStatus("loading");
    setMessage(null);
    setValidationError(null);

    if (uid === null) {
      const initialDraft = { enabled: true, endpoint: "" };
      setPersisted(initialDraft);
      setDraft(initialDraft);
      setStatus("idle");
      return;
    }

    void loadDestination(uid, DEFAULT_DESTINATION_ID)
      .then((destination) => {
        if (!isDisposed) {
          const loadedDraft = {
            endpoint: typeof destination?.config.endpoint === "string" ? destination.config.endpoint : "",
            enabled: destination?.enabled ?? true
          };
          setPersisted(loadedDraft);
          setDraft(loadedDraft);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setIsError(true);
          setMessage("通知先設定の読込に失敗しました。");
          setStatus("idle");
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadDestination, uid]);

  useEffect(() => {
    if (!canEditEndpoint) {
      setValidationError(null);
    }
  }, [canEditEndpoint]);

  function setDraftEndpoint(endpoint: string) {
    setDraft((currentDraft) => ({ ...currentDraft, endpoint }));
    setMessage(null);
    setIsError(false);
  }

  function setDraftEnabled(enabled: boolean) {
    setDraft((currentDraft) => ({ ...currentDraft, enabled }));
    setMessage(null);
    setIsError(false);
  }

  function validateEndpoint() {
    if (!canEditEndpoint) {
      setValidationError(null);
      return;
    }

    const validation = validateWebhookUrl(draft.endpoint);
    setValidationError(validation);
  }

  async function saveDraft(): Promise<boolean> {
    if (uid === null) {
      return true;
    }

    const validation = canEditEndpoint ? validateWebhookUrl(draft.endpoint) : null;
    setValidationError(validation);

    if (validation !== null) {
      return false;
    }

    if (!isDirty) {
      return true;
    }

    setStatus("saving");
    setMessage(null);
    setIsError(false);

    try {
      await saveDestination(uid, DEFAULT_DESTINATION_ID, {
        name: DEFAULT_DESTINATION_NAME,
        provider: "discord",
        type: "webhook",
        enabled: draft.enabled,
        selectableMentions: DEFAULT_SELECTABLE_MENTIONS,
        config: { endpoint: draft.endpoint.trim() }
      });
      setPersisted({ enabled: draft.enabled, endpoint: draft.endpoint });
      setMessage("通知先設定を保存しました。");
      return true;
    } catch {
      setIsError(true);
      setMessage("通知先設定の保存に失敗しました。");
      return false;
    } finally {
      setStatus("idle");
    }
  }

  function cancelDraft() {
    setDraft(persisted);
    setValidationError(null);
    setMessage(null);
    setIsError(false);
  }

  return {
    draft,
    external: {
      hasValidationError: canEditEndpoint && validationError !== null,
      isDirty,
      onCancel: cancelDraft,
      onSave: saveDraft
    },
    isError,
    message,
    setEnabled: setDraftEnabled,
    setEndpoint: setDraftEndpoint,
    status,
    uid,
    validateEndpoint,
    validationError
  };
}

function validateWebhookUrl(endpoint: string): string | null {
  const trimmedEndpoint = endpoint.trim();

  if (trimmedEndpoint.length === 0) {
    return null;
  }

  try {
    const url = new URL(trimmedEndpoint);
    return url.protocol === "http:" || url.protocol === "https:" ? null : "Webhook URLの形式を確認してください。";
  } catch {
    return "Webhook URLの形式を確認してください。";
  }
}

function blurInputOnEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  event.currentTarget.blur();
}

function NotificationDestinationPanel({
  draft,
  showWebhookUrl
}: {
  readonly draft: NotificationDestinationDraftController;
  readonly showWebhookUrl: boolean;
}) {
  const { uid, status, message, isError, validationError } = draft;

  return (
    <section className="notification-destination" aria-labelledby="notification-destination-title">
      <h3 id="notification-destination-title">Discord通知</h3>
      <label className="notification-destination__toggle">
        <input
          checked={draft.draft.enabled}
          disabled={uid === null || status !== "idle"}
          type="checkbox"
          onChange={(event) => draft.setEnabled(event.target.checked)}
        />
        Discord通知を有効にする
      </label>
      {showWebhookUrl ? (
        <>
          <label className="field" htmlFor="notification-endpoint">
            <span className="field__label">Discord Webhook URL</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="field__input"
              disabled={uid === null || status !== "idle"}
              id="notification-endpoint"
              name="notification-endpoint"
              spellCheck={false}
              type="url"
              value={draft.draft.endpoint}
              onBlur={draft.validateEndpoint}
              onChange={(event) => draft.setEndpoint(event.target.value)}
              onKeyDown={blurInputOnEnter}
            />
          </label>
          {validationError !== null ? (
            <p className="firebase-message firebase-message--error">{validationError}</p>
          ) : null}
        </>
      ) : null}
      {uid === null ? <p className="firebase-message">ログイン後に通知先設定を利用できます。</p> : null}
      {status === "loading" ? <p className="firebase-message">通知先設定を読込中です。</p> : null}
      {status === "saving" ? <p className="firebase-message">通知先設定を保存中です。</p> : null}
      {message !== null ? (
        <p className={`firebase-message ${isError ? "firebase-message--error" : "firebase-message--success"}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
