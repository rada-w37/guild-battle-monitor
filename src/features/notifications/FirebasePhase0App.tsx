import { useEffect, useRef, useState } from "react";
import { useAppRoute, type AppModePermissions, type AppRoute } from "../../app/appMode";
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
  type SharedGuildContext
} from "../guildBattle/GuildBattlePlaceholder";
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
  readonly isLoading: boolean;
  readonly share: GuildShare | null;
}

interface PublicGuildShareCacheState {
  readonly error: string | null;
  readonly isSaving: boolean;
}

interface FirebasePhase0AppProps {
  readonly loadOwnedGuildProfile?: typeof loadOwnedGuildProfile;
  readonly loadGuildShare?: typeof loadGuildShare;
  readonly loadPublicGuildShare?: typeof loadPublicGuildShare;
  readonly saveOwnedGuildProfile?: typeof saveOwnedGuildProfile;
  readonly saveGuildShare?: typeof saveGuildShare;
  readonly savePublicGuildShare?: typeof savePublicGuildShare;
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly subscribeToAuthState?: typeof subscribeToAuthState;
}

export function FirebasePhase0App({
  loadOwnedGuildProfile: loadProfile = loadOwnedGuildProfile,
  loadGuildShare: loadShare = loadGuildShare,
  loadPublicGuildShare: loadPublicShare = loadPublicGuildShare,
  saveOwnedGuildProfile: saveProfile = saveOwnedGuildProfile,
  saveGuildShare: saveShare = saveGuildShare,
  savePublicGuildShare: savePublicShare = savePublicGuildShare,
  loadSnapshot = loadLocalGvgSnapshot,
  subscribeToAuthState: subscribeAuthState = subscribeToAuthState
}: FirebasePhase0AppProps = {}) {
  const appRoute = useAppRoute();
  const appMode = appRoute?.mode ?? "owner";
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [authError, setAuthError] = useState<string | null>(null);
  const notificationSettingsUid = authState.status === "signed-in" ? authState.user.uid : null;
  const isSignedInOwner = appMode === "owner" && authState.status === "signed-in";
  const permissionsOverride: Partial<AppModePermissions> | undefined =
    appMode === "owner" && !isSignedInOwner
      ? {
          canEditBattleState: false,
          canPersistViewSettings: false,
          canManageNotifications: false,
          canManageGuildProfile: false,
          canManageShareUrls: false,
          showNotificationSettings: false,
          showOwnedGuildSettings: false,
          showShareSettings: false
        }
      : undefined;
  const ownedGuildProfilePersistence = useOwnedGuildProfilePersistence(
    appMode === "owner" ? notificationSettingsUid : null,
    loadProfile,
    saveProfile
  );
  const guildShare = useGuildShare(
    appMode === "owner" ? notificationSettingsUid : null,
    appMode === "owner" ? ownedGuildProfilePersistence.profile : null,
    loadShare,
    saveShare
  );
  const sharedGuild = useResolvedSharedGuild(appRoute, loadPublicShare);

  const publicGuildShareCache = usePublicGuildShareCache(
    appMode === "owner" ? ownedGuildProfilePersistence.profile : null,
    appMode === "owner" ? guildShare.share : null,
    savePublicShare
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
      modeOverride={sharedGuild.status === "fallback" ? "guest" : undefined}
      permissionsOverride={permissionsOverride}
      headerActions={
        <AuthControl
          authState={authState}
          mode={effectiveMode}
          sharedGuild={effectiveSharedGuild}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      }
      notificationSettings={<NotificationDestinationPanel uid={notificationSettingsUid} />}
      ownedGuildProfilePersistence={ownedGuildProfilePersistence}
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

function useGuildShare(
  uid: string | null,
  profile: OwnedGuildProfile | null,
  loadShare: typeof loadGuildShare,
  saveShare: typeof saveGuildShare
): GuildShareState {
  const [state, setState] = useState<GuildShareState>({
    error: null,
    isLoading: false,
    share: null
  });

  useEffect(() => {
    let isDisposed = false;

    if (uid === null || !isCompleteOwnedGuildProfile(profile)) {
      setState({ error: null, isLoading: false, share: null });
      return;
    }

    const guildId = profile.guildId;
    setState({ error: null, isLoading: true, share: null });
    void loadShare(uid)
      .then(async (loadedShare) => {
        if (isDisposed) {
          return;
        }

        if (loadedShare?.guildId === guildId) {
          setState({ error: null, isLoading: false, share: loadedShare });
          return;
        }

        const nextShare = createGuildShare(guildId);
        try {
          await saveShare(uid, nextShare);
        } catch (error) {
          console.error("Failed to save users/{uid}/guild/share.", error);
          throw error;
        }

        if (!isDisposed) {
          setState({ error: null, isLoading: false, share: nextShare });
        }
      })
      .catch((error) => {
        console.error("Failed to load or generate users/{uid}/guild/share.", error);
        if (!isDisposed) {
          setState({ error: SHARE_GENERATION_ERROR_MESSAGE, isLoading: false, share: null });
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [loadShare, profile, saveShare, uid]);

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

  useEffect(() => {
    let isDisposed = false;

    if (appRoute === null || appRoute.mode === "owner") {
      setState({ status: "owner" });
      return;
    }

    setState({ status: "loading" });
    void loadPublicShare(appRoute.guildId)
      .then((share) => {
        if (isDisposed) {
          return;
        }

        const mode = resolveSharedMode(appRoute.accessKey, share);

        if (share === null || mode === null) {
          setState({ status: "fallback" });
          return;
        }

        setState({
          status: "valid",
          sharedGuild: {
            mode,
            guildId: appRoute.guildId,
            world: share.world,
            guildName: share.guildName
          }
        });
      })
      .catch((error) => {
        console.error("Failed to load guildShares/{guildId}.", error);
        if (!isDisposed) {
          setState({ status: "fallback" });
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [appRoute, loadPublicShare]);

  return state;
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

function usePublicGuildShareCache(
  profile: OwnedGuildProfile | null,
  share: GuildShare | null,
  savePublicShare: typeof savePublicGuildShare
): PublicGuildShareCacheState {
  const savedKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<PublicGuildShareCacheState>({
    error: null,
    isSaving: false
  });

  useEffect(() => {
    if (
      !isCompleteOwnedGuildProfile(profile) ||
      share === null ||
      share.guildId !== profile.guildId
    ) {
      savedKeyRef.current = null;
      setState({ error: null, isSaving: false });
      return;
    }

    const publicShare = {
      world: profile.world,
      guildName: profile.guildName,
      adminAccessKey: share.adminAccessKey,
      guestAccessKey: share.guestAccessKey
    };
    const nextKey = JSON.stringify({ guildId: profile.guildId, ...publicShare });

    if (savedKeyRef.current === nextKey) {
      setState({ error: null, isSaving: false });
      return;
    }

    savedKeyRef.current = nextKey;
    setState({ error: null, isSaving: true });
    void savePublicShare(profile.guildId, publicShare)
      .then(() => {
        setState({ error: null, isSaving: false });
      })
      .catch((error) => {
        console.error("Failed to save guildShares/{guildId}.", error);
        if (savedKeyRef.current === nextKey) {
          savedKeyRef.current = null;
        }
        setState({ error: SHARE_GENERATION_ERROR_MESSAGE, isSaving: false });
      });
  }, [profile, savePublicShare, share]);

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

  if (share.isLoading || publicCache.isSaving || share.share === null || share.share.guildId !== profile.guildId) {
    return <p className="firebase-message">共有URLを生成中です</p>;
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

  function handleChange(nextProfile: OwnedGuildProfile) {
    setProfile(nextProfile);
    setError(null);

    if (uid === null || isLoading) {
      return;
    }

    const nextProfileKey = createOwnedGuildProfileKey(nextProfile);

    if (persistedProfileKeyRef.current === nextProfileKey) {
      return;
    }

    persistedProfileKeyRef.current = nextProfileKey;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => saveProfile(uid, nextProfile))
      .catch((saveError) => {
        console.error("Failed to save users/{uid}/guild/profile.", saveError);
        if (persistedProfileKeyRef.current === nextProfileKey) {
          persistedProfileKeyRef.current = null;
        }
        setError(OWNED_GUILD_PROFILE_ERROR_MESSAGE);
      });
  }

  return {
    error,
    isLoading,
    isSignedIn: uid !== null,
    profile,
    onChange: handleChange
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

function NotificationDestinationPanel({ uid }: { readonly uid: string | null }) {
  const [endpoint, setEndpoint] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isDisposed = false;
    setStatus("loading");
    setMessage(null);

    if (uid === null) {
      setEndpoint("");
      setEnabled(true);
      setStatus("idle");
      return;
    }

    void loadNotificationDestination(uid, DEFAULT_DESTINATION_ID)
      .then((destination) => {
        if (!isDisposed) {
          setEndpoint(typeof destination?.config.endpoint === "string" ? destination.config.endpoint : "");
          setEnabled(destination?.enabled ?? true);
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
  }, [uid]);

  async function handleSave() {
    if (uid === null) {
      return;
    }

    setStatus("saving");
    setMessage(null);
    setIsError(false);

    try {
      await saveNotificationDestination(uid, DEFAULT_DESTINATION_ID, {
        name: DEFAULT_DESTINATION_NAME,
        provider: "discord",
        type: "webhook",
        enabled,
        selectableMentions: DEFAULT_SELECTABLE_MENTIONS,
        config: { endpoint: endpoint.trim() }
      });
      setMessage("通知先設定を保存しました。");
    } catch {
      setIsError(true);
      setMessage("通知先設定の保存に失敗しました。");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="notification-destination" aria-labelledby="notification-destination-title">
      <h3 id="notification-destination-title">Discord通知</h3>
      <label className="notification-destination__toggle">
        <input
          checked={enabled}
          disabled={uid === null || status !== "idle"}
          type="checkbox"
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Discord通知を有効にする
      </label>
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
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <button className="load-form__button" disabled={uid === null || status !== "idle"} type="button" onClick={handleSave}>
        {status === "saving" ? "保存中" : "保存"}
      </button>
      {uid === null ? <p className="firebase-message">ログイン後に通知先設定を利用できます。</p> : null}
      {status === "loading" ? <p className="firebase-message">通知先設定を読込中です。</p> : null}
      {message !== null ? (
        <p className={`firebase-message ${isError ? "firebase-message--error" : "firebase-message--success"}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
