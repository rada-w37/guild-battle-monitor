import { useEffect, useRef, useState } from "react";
import { useAppRoute } from "../../app/appMode";
import { signInWithGoogle, signOutCurrentUser, subscribeToAuthState } from "../auth/authService";
import type { AuthState } from "../auth/types";
import { createGuildShare, createGuildShareUrl } from "../guildBattle/guildShare";
import { loadGuildShare, saveGuildShare } from "../guildBattle/guildShareRepository";
import {
  GuildBattlePlaceholder,
  type OwnedGuildProfilePersistence
} from "../guildBattle/GuildBattlePlaceholder";
import {
  loadOwnedGuildProfile,
  saveOwnedGuildProfile
} from "../guildBattle/ownedGuildProfileRepository";
import type { GuildShare, OwnedGuildProfile } from "../guildBattle/types";
import { loadNotificationDestination, saveNotificationDestination } from "./notificationDestinationRepository";

const DEFAULT_DESTINATION_ID = "default";
const DEFAULT_DESTINATION_NAME = "ギルドDiscord";
const DEFAULT_SELECTABLE_MENTIONS = ["@here", "@everyone"] as const;

interface FirebasePhase0AppProps {
  readonly loadOwnedGuildProfile?: typeof loadOwnedGuildProfile;
  readonly loadGuildShare?: typeof loadGuildShare;
  readonly saveOwnedGuildProfile?: typeof saveOwnedGuildProfile;
  readonly saveGuildShare?: typeof saveGuildShare;
  readonly subscribeToAuthState?: typeof subscribeToAuthState;
}

export function FirebasePhase0App({
  loadOwnedGuildProfile: loadProfile = loadOwnedGuildProfile,
  loadGuildShare: loadShare = loadGuildShare,
  saveOwnedGuildProfile: saveProfile = saveOwnedGuildProfile,
  saveGuildShare: saveShare = saveGuildShare,
  subscribeToAuthState: subscribeAuthState = subscribeToAuthState
}: FirebasePhase0AppProps = {}) {
  const appRoute = useAppRoute();
  const appMode = appRoute?.mode ?? "owner";
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [authError, setAuthError] = useState<string | null>(null);
  const notificationSettingsUid = authState.status === "signed-in" ? authState.user.uid : null;
  const ownedGuildProfilePersistence = useOwnedGuildProfilePersistence(
    notificationSettingsUid,
    loadProfile,
    saveProfile
  );
  const guildShare = useGuildShare(
    appMode === "owner" ? notificationSettingsUid : null,
    ownedGuildProfilePersistence.profile?.guildId ?? null,
    loadShare,
    saveShare
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

  return (
    <GuildBattlePlaceholder
      headerActions={
        <AuthControl
          authState={authState}
          mode={appMode}
          ownedGuildProfile={ownedGuildProfilePersistence.profile}
          sharedGuildId={appRoute !== null && appRoute.mode !== "owner" ? appRoute.guildId : null}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      }
      notificationSettings={<NotificationDestinationPanel uid={notificationSettingsUid} />}
      ownedGuildProfilePersistence={ownedGuildProfilePersistence}
      shareSettings={
        <GuildSharePanel
          guildId={ownedGuildProfilePersistence.profile?.guildId ?? null}
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
  guildId: string | null,
  loadShare: typeof loadGuildShare,
  saveShare: typeof saveGuildShare
): GuildShare | null {
  const [share, setShare] = useState<GuildShare | null>(null);

  useEffect(() => {
    let isDisposed = false;

    if (uid === null || guildId === null) {
      setShare(null);
      return;
    }

    setShare(null);
    void loadShare(uid)
      .then(async (loadedShare) => {
        if (isDisposed) {
          return;
        }

        if (loadedShare?.guildId === guildId) {
          setShare(loadedShare);
          return;
        }

        const nextShare = createGuildShare(guildId);
        await saveShare(uid, nextShare);

        if (!isDisposed) {
          setShare(nextShare);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setShare(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [guildId, loadShare, saveShare, uid]);

  return share;
}

function GuildSharePanel({
  guildId,
  isSignedIn,
  share
}: {
  readonly guildId: string | null;
  readonly isSignedIn: boolean;
  readonly share: GuildShare | null;
}) {
  const [copiedRole, setCopiedRole] = useState<"admin" | "guest" | null>(null);

  if (guildId === null) {
    return <p className="firebase-message">所属ギルドを設定してください</p>;
  }

  if (!isSignedIn) {
    return <p className="firebase-message">ログインすると共有URLを生成できます</p>;
  }

  if (share === null || share.guildId !== guildId) {
    return <p className="firebase-message">共有URLを生成中です</p>;
  }

  const adminUrl = createGuildShareUrl(window.location.origin, share.guildId, share.adminAccessKey);
  const guestUrl = createGuildShareUrl(window.location.origin, share.guildId, share.guestAccessKey);

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
  const [isLoading, setIsLoading] = useState(false);
  const persistedProfileKeyRef = useRef<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let isDisposed = false;
    persistedProfileKeyRef.current = null;

    if (uid === null) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void loadProfile(uid)
      .then((loadedProfile) => {
        if (!isDisposed) {
          setProfile(loadedProfile);
          persistedProfileKeyRef.current = createOwnedGuildProfileKey(loadedProfile);
          setIsLoading(false);
        }
      })
      .catch(() => {
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
      .catch(() => {
        if (persistedProfileKeyRef.current === nextProfileKey) {
          persistedProfileKeyRef.current = null;
        }
      });
  }

  return {
    isLoading,
    isSignedIn: uid !== null,
    profile,
    onChange: handleChange
  };
}

function createOwnedGuildProfileKey(profile: OwnedGuildProfile | null): string {
  return JSON.stringify(
    profile ?? {
      worldId: null,
      guildId: null,
      guildName: null
    }
  );
}

function AuthControl({
  authState,
  mode,
  ownedGuildProfile,
  sharedGuildId,
  onSignIn,
  onSignOut
}: {
  readonly authState: AuthState;
  readonly mode: "owner" | "admin" | "guest";
  readonly ownedGuildProfile: OwnedGuildProfile | null;
  readonly sharedGuildId: string | null;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}) {
  if (mode !== "owner") {
    const guildName =
      ownedGuildProfile?.guildId === sharedGuildId && ownedGuildProfile.guildName !== null
        ? ownedGuildProfile.guildName
        : "";

    return guildName.length > 0 ? <span className="firebase-auth-status">{guildName}</span> : null;
  }

  if (authState.status === "signed-out") {
    return (
      <div className="firebase-auth-user">
        <span>Owner</span>
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
    return <span className="firebase-auth-status">認証確認中</span>;
  }

  if (authState.status === "error") {
    return <span className="firebase-auth-status">認証エラー</span>;
  }

  return null;
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
