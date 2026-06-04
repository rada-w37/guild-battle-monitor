import { useEffect, useState } from "react";
import { signInWithGoogle, signOutCurrentUser, subscribeToAuthState } from "../auth/authService";
import type { AuthState } from "../auth/types";
import { GuildBattlePlaceholder } from "../guildBattle/GuildBattlePlaceholder";
import { loadNotificationDestination, saveNotificationDestination } from "./notificationDestinationRepository";

const DEFAULT_DESTINATION_ID = "default";
const DEFAULT_DESTINATION_NAME = "ギルドDiscord";
const DEFAULT_SELECTABLE_MENTIONS = ["@here", "@everyone"] as const;

export function FirebasePhase0App() {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [authError, setAuthError] = useState<string | null>(null);
  const notificationSettingsUid = authState.status === "signed-in" ? authState.user.uid : null;

  useEffect(() => subscribeToAuthState(setAuthState), []);

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
      headerActions={<AuthControl authState={authState} onSignIn={handleSignIn} onSignOut={handleSignOut} />}
      notificationSettings={<NotificationDestinationPanel uid={notificationSettingsUid} />}
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

function AuthControl({
  authState,
  onSignIn,
  onSignOut
}: {
  readonly authState: AuthState;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}) {
  if (authState.status === "signed-out") {
    return <button className="firebase-auth-button" type="button" onClick={onSignIn}>ログイン</button>;
  }

  if (authState.status === "signed-in") {
    return (
      <div className="firebase-auth-user">
        <span>{authState.user.displayName || authState.user.email}</span>
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
