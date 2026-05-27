import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { BrowserGvgRealtimeClient } from "../gvg/browserRealtimeClient";
import { createGvgScopeLabel } from "../gvg/createGvgScopeLabel";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgRealtimeClient, GvgRealtimeConnectionState } from "../gvg/realtimeClientTypes";
import { GvgRealtimeSnapshotRuntime } from "../gvg/realtimeSnapshotRuntime";
import type { GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import { createOwnedCastleViewModels } from "./selectors";
import type { GuildBattleOwnedCastleViewModel } from "./types";

interface GuildBattlePlaceholderProps {
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly createRealtimeClient?: () => GvgRealtimeClient;
}

export function GuildBattlePlaceholder({
  loadSnapshot = loadLocalGvgSnapshot,
  createRealtimeClient = () => new BrowserGvgRealtimeClient()
}: GuildBattlePlaceholderProps) {
  const [worldId, setWorldId] = useState("1001");
  const [ownGuildId, setOwnGuildId] = useState("");
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });
  const [realtimeState, setRealtimeState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);

  const trimmedWorldId = worldId.trim();
  const trimmedOwnGuildId = ownGuildId.trim();
  const isLoading = loadState.status === "loading";
  const hasLoadedSnapshot = loadState.status === "success";
  const hasRealtimeInputs = trimmedWorldId.length > 0 && trimmedOwnGuildId.length > 0;
  const canStartRealtime =
    hasLoadedSnapshot && hasRealtimeInputs && realtimeState.status === "idle";
  const canReconnectRealtime =
    hasLoadedSnapshot &&
    hasRealtimeInputs &&
    (realtimeState.status === "disconnected" || realtimeState.status === "error");
  const canStopRealtime = realtimeState.status === "connecting" || realtimeState.status === "connected";

  useEffect(() => {
    return () => {
      stopRealtime("component unmounted");
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedWorldId.length === 0) {
      setLoadState({ status: "error", error: new Error("worldIdを入力してください。") });
      return;
    }

    stopRealtime("snapshot reload");
    setLoadState({ status: "loading" });

    try {
      const snapshot = await loadSnapshot(trimmedWorldId as GvgWorldId);
      setLoadState({ status: "success", data: snapshot });
    } catch (error) {
      setLoadState({
        status: "error",
        error: error instanceof Error ? error : new Error("初期状態の取得に失敗しました。")
      });
    }
  }

  async function handleStartRealtime() {
    if (!canStartRealtime || loadState.status !== "success") {
      return;
    }

    await startRealtime(loadState.data);
  }

  async function handleReconnectRealtime() {
    if (!canReconnectRealtime || loadState.status !== "success") {
      return;
    }

    await startRealtime(loadState.data);
  }

  async function startRealtime(snapshot: GvgSnapshot) {
    stopRealtime("realtime restart", { nextState: "idle" });

    const client = createRealtimeClient();
    const removeRealtimeListener = client.addEventListener((event) => {
      if (event.type === "stateChanged") {
        setRealtimeState(event.state);
      }

      if (event.type === "error") {
        setRealtimeState({ status: "error", error: event.error });
      }
    });
    const runtime = new GvgRealtimeSnapshotRuntime({
      client,
      onSnapshotUpdated: (snapshot) => {
        setLoadState({ status: "success", data: snapshot });
      },
      onError: (error) => {
        setRealtimeState({ status: "error", error });
      }
    });

    removeRealtimeListenerRef.current = removeRealtimeListener;
    runtimeRef.current = runtime;

    try {
      await runtime.start(snapshot);
    } catch (error) {
      setRealtimeState({
        status: "error",
        error: error instanceof Error ? error : new Error("realtime start failed")
      });
    }
  }

  function handleStopRealtime() {
    stopRealtime("manual stop");
  }

  function stopRealtime(reason: string, options: { readonly nextState?: "idle" | "disconnected" } = {}) {
    runtimeRef.current?.dispose(reason);
    runtimeRef.current = null;
    removeRealtimeListenerRef.current?.();
    removeRealtimeListenerRef.current = null;

    if (options.nextState === "idle") {
      setRealtimeState({ status: "idle" });
      return;
    }

    if (realtimeState.status !== "idle" && realtimeState.status !== "disconnected") {
      setRealtimeState({ status: "disconnected", reason });
    }
  }

  return (
    <main className="app-shell">
      <section className="placeholder monitor-panel" aria-labelledby="app-title">
        <p className="placeholder__eyebrow">{createGvgScopeLabel()}</p>
        <h1 className="placeholder__title" id="app-title">
          GuildBattleMonitor
        </h1>
        <p className="placeholder__description">
          REST初期状態から正規化済みスナップショットを取得し、自ギルドの防衛拠点だけを表示します。
        </p>

        <form className="load-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">worldId</span>
            <input
              className="field__input"
              type="text"
              value={worldId}
              onChange={(event) => setWorldId(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field__label">自ギルドID</span>
            <input
              className="field__input field__input--wide"
              type="text"
              value={ownGuildId}
              onChange={(event) => setOwnGuildId(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
            />
          </label>
          <button
            className="load-form__button"
            type="submit"
            disabled={isLoading || trimmedWorldId.length === 0}
          >
            初期状態を取得
          </button>
        </form>

        <SnapshotStatus loadState={loadState} ownGuildId={trimmedOwnGuildId} />
        <RealtimeControls
          canStart={canStartRealtime}
          canReconnect={canReconnectRealtime}
          canStop={canStopRealtime}
          realtimeState={realtimeState}
          onStart={handleStartRealtime}
          onReconnect={handleReconnectRealtime}
          onStop={handleStopRealtime}
        />
      </section>
    </main>
  );
}

function RealtimeControls({
  canStart,
  canReconnect,
  canStop,
  realtimeState,
  onStart,
  onReconnect,
  onStop
}: {
  readonly canStart: boolean;
  readonly canReconnect: boolean;
  readonly canStop: boolean;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly onStart: () => void;
  readonly onReconnect: () => void;
  readonly onStop: () => void;
}) {
  const stateView = getRealtimeStateView(realtimeState);

  return (
    <section className="realtime-controls" aria-labelledby="realtime-title">
      <h2 className="realtime-controls__title" id="realtime-title">
        realtime
      </h2>
      <p className={`status-message realtime-controls__state realtime-state realtime-state--${stateView.tone}`}>
        接続状態: {stateView.label}
      </p>
      {realtimeState.status === "error" ? (
        <p className="status-message status-message--error realtime-controls__hint" role="alert">
          接続エラーが発生しました
        </p>
      ) : null}
      <div className="realtime-controls__actions">
        <button className="load-form__button" type="button" disabled={!canStart} onClick={onStart}>
          監視開始
        </button>
        <button className="load-form__button" type="button" disabled={!canReconnect} onClick={onReconnect}>
          再接続
        </button>
        <button className="load-form__button load-form__button--secondary" type="button" disabled={!canStop} onClick={onStop}>
          監視停止
        </button>
      </div>
    </section>
  );
}

function getRealtimeStateView(state: GvgRealtimeConnectionState): {
  readonly label: string;
  readonly tone: "idle" | "connecting" | "connected" | "disconnected" | "error";
} {
  switch (state.status) {
    case "connecting":
    case "reconnecting":
      return { label: "接続中...", tone: "connecting" };
    case "connected":
      return { label: "接続中", tone: "connected" };
    case "disconnected":
      return { label: "切断", tone: "disconnected" };
    case "error":
      return { label: "エラー", tone: "error" };
    case "idle":
      return { label: "未接続", tone: "idle" };
  }
}

function SnapshotStatus({
  loadState,
  ownGuildId
}: {
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly ownGuildId: string;
}) {
  if (loadState.status === "idle") {
    return <p className="status-message">未取得です。</p>;
  }

  if (loadState.status === "loading") {
    return (
      <p className="status-message" aria-live="polite">
        取得中です。
      </p>
    );
  }

  if (loadState.status === "error") {
    return (
      <p className="status-message status-message--error" role="alert">
        {loadState.error.message}
      </p>
    );
  }

  return <SnapshotSummary ownGuildId={ownGuildId} snapshot={loadState.data} />;
}

function SnapshotSummary({
  ownGuildId,
  snapshot
}: {
  readonly ownGuildId: string;
  readonly snapshot: GvgSnapshot;
}) {
  const ownedCastleViewModels = useMemo(() => {
    if (ownGuildId.length === 0) {
      return [];
    }

    return createOwnedCastleViewModels(snapshot, {
      ownGuildId: ownGuildId as GvgGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    });
  }, [ownGuildId, snapshot]);

  return (
    <section className="snapshot-summary" aria-labelledby="snapshot-title">
      <h2 className="snapshot-summary__title" id="snapshot-title">
        取得結果
      </h2>
      <dl className="summary-grid">
        <div>
          <dt>worldId</dt>
          <dd>{snapshot.worldId}</dd>
        </div>
        <div>
          <dt>castles</dt>
          <dd>{snapshot.castles.length}</dd>
        </div>
        <div>
          <dt>guilds</dt>
          <dd>{Object.keys(snapshot.guildNames).length}</dd>
        </div>
        <div>
          <dt>capturedAt</dt>
          <dd>{snapshot.capturedAt}</dd>
        </div>
      </dl>

      {ownGuildId.length === 0 ? (
        <p className="status-message">自ギルドIDを入力してください。</p>
      ) : (
        <OwnedCastleList capturedAt={snapshot.capturedAt} viewModels={ownedCastleViewModels} />
      )}
    </section>
  );
}

function OwnedCastleList({
  capturedAt,
  viewModels
}: {
  readonly capturedAt: string;
  readonly viewModels: readonly GuildBattleOwnedCastleViewModel[];
}) {
  if (viewModels.length === 0) {
    return <p className="status-message">自ギルドの防衛拠点はありません。</p>;
  }

  return (
    <div className="castle-list" aria-label="owned castle list">
      <div className="castle-list__header castle-list__header--owned">
        <span>拠点ID</span>
        <span>防衛数</span>
        <span>侵攻数</span>
        <span>状態</span>
        <span>アラート</span>
        <span>攻撃ギルドID</span>
        <span>攻撃ギルド名</span>
        <span>最終取得時刻</span>
      </div>
      {viewModels.map((viewModel) => (
        <div className="castle-list__row castle-list__row--owned" key={viewModel.castleId}>
          <span>{viewModel.castleId}</span>
          <span>{viewModel.defenseCount}</span>
          <span>{viewModel.attackCount}</span>
          <span>{viewModel.state}</span>
          <span className={`alert-level alert-${viewModel.alertLevel}`}>
            {viewModel.alertLevel}
          </span>
          <span>{viewModel.attackerGuildId ?? "-"}</span>
          <span>{viewModel.attackerGuildName ?? "-"}</span>
          <span>{capturedAt}</span>
        </div>
      ))}
    </div>
  );
}
