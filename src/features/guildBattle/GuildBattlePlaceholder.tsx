import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { BrowserGvgRealtimeClient } from "../gvg/browserRealtimeClient";
import { createGvgScopeLabel } from "../gvg/createGvgScopeLabel";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgRealtimeClient, GvgRealtimeConnectionState } from "../gvg/realtimeClientTypes";
import { GvgRealtimeSnapshotRuntime } from "../gvg/realtimeSnapshotRuntime";
import type { GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import {
  createGuildBattleCastleDisplayViewModel,
  createGuildBattleGuildCandidates,
  createGuildBattleCastleSummaryViewModel,
  sortGuildBattleCastleViewModels
} from "./selectors";
import type {
  GuildBattleAlertLevel,
  GuildBattleCastleDisplayReason,
  GuildBattleCastleListSortMode,
  GuildBattleCastleViewModel,
  GuildBattleGuildCandidateViewModel
} from "./types";

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
  const [castleSortMode, setCastleSortMode] = useState<GuildBattleCastleListSortMode>("castleId");
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);

  const trimmedWorldId = worldId.trim();
  const trimmedOwnGuildId = ownGuildId.trim();
  const isLoading = loadState.status === "loading";
  const hasLoadedSnapshot = loadState.status === "success";
  const guildCandidates = useMemo(
    () => (loadState.status === "success" ? createGuildBattleGuildCandidates(loadState.data) : []),
    [loadState]
  );
  const selectedGuildCandidate = guildCandidates.find((candidate) => candidate.guildId === trimmedOwnGuildId);
  const guildSelectValue = selectedGuildCandidate?.guildId ?? "";
  const hasRealtimeInputs = trimmedWorldId.length > 0 && trimmedOwnGuildId.length > 0;
  const canStartRealtime = hasLoadedSnapshot && hasRealtimeInputs && realtimeState.status === "idle";
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

  function stopRealtime(reason: string, options: { readonly nextState?: "idle" } = {}) {
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
          REST初期状態から正規化済みスナップショットを取得し、拠点一覧と防衛状態を確認します。
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
          <GuildCandidateSelect
            candidates={guildCandidates}
            disabled={isLoading || loadState.status !== "success"}
            value={guildSelectValue}
            onChange={setOwnGuildId}
          />
          <button className="load-form__button" type="submit" disabled={isLoading || trimmedWorldId.length === 0}>
            初期状態を取得
          </button>
        </form>

        <SnapshotStatus
          castleSortMode={castleSortMode}
          loadState={loadState}
          ownGuildId={trimmedOwnGuildId}
          onCastleSortModeChange={setCastleSortMode}
        />
        <RealtimeControls
          canReconnect={canReconnectRealtime}
          canStart={canStartRealtime}
          canStop={canStopRealtime}
          realtimeState={realtimeState}
          onReconnect={handleReconnectRealtime}
          onStart={handleStartRealtime}
          onStop={handleStopRealtime}
        />
      </section>
    </main>
  );
}

function GuildCandidateSelect({
  candidates,
  disabled,
  value,
  onChange
}: {
  readonly candidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly disabled: boolean;
  readonly value: string;
  readonly onChange: (guildId: string) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">ギルド選択</span>
      <select
        className="field__input field__input--wide"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">全拠点表示</option>
        {candidates.map((candidate) => (
          <option key={candidate.guildId} value={candidate.guildId}>
            {candidate.guildName} ({candidate.ownedCastleCount})
          </option>
        ))}
      </select>
    </label>
  );
}

function RealtimeControls({
  canReconnect,
  canStart,
  canStop,
  realtimeState,
  onReconnect,
  onStart,
  onStop
}: {
  readonly canReconnect: boolean;
  readonly canStart: boolean;
  readonly canStop: boolean;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly onReconnect: () => void;
  readonly onStart: () => void;
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
  castleSortMode,
  loadState,
  ownGuildId,
  onCastleSortModeChange
}: {
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly ownGuildId: string;
  readonly onCastleSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
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

  return (
    <SnapshotSummary
      castleSortMode={castleSortMode}
      ownGuildId={ownGuildId}
      snapshot={loadState.data}
      onCastleSortModeChange={onCastleSortModeChange}
    />
  );
}

function SnapshotSummary({
  castleSortMode,
  ownGuildId,
  snapshot,
  onCastleSortModeChange
}: {
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly ownGuildId: string;
  readonly snapshot: GvgSnapshot;
  readonly onCastleSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
}) {
  const castleDisplay = useMemo(() => {
    return createGuildBattleCastleDisplayViewModel(snapshot, {
      ownGuildId: ownGuildId.length === 0 ? "" : (ownGuildId as GvgGuildId),
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    });
  }, [ownGuildId, snapshot]);
  const sortedCastles = useMemo(
    () => sortGuildBattleCastleViewModels(castleDisplay.castles, castleSortMode),
    [castleDisplay.castles, castleSortMode]
  );
  const summary = useMemo(
    () => createGuildBattleCastleSummaryViewModel(castleDisplay.castles, castleDisplay.mode),
    [castleDisplay.castles, castleDisplay.mode]
  );

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

      <CastleDisplayNotice reason={castleDisplay.reason} />
      <CastleListToolbar sortMode={castleSortMode} onSortModeChange={onCastleSortModeChange} />
      <CastleSummary summary={summary} />
      <CastleList capturedAt={snapshot.capturedAt} viewModels={sortedCastles} />
    </section>
  );
}

function CastleDisplayNotice({ reason }: { readonly reason: GuildBattleCastleDisplayReason }) {
  if (reason === "ownGuildUnspecified") {
    return <p className="status-message">自ギルドが未指定のため、全拠点を表示しています。</p>;
  }

  if (reason === "ownedCastlesNotFound") {
    return (
      <p className="status-message">
        指定されたギルドの防衛拠点が見つからないため、全拠点を表示しています。
      </p>
    );
  }

  return <p className="status-message">指定ギルドの防衛拠点のみ表示しています。</p>;
}

function CastleListToolbar({
  sortMode,
  onSortModeChange
}: {
  readonly sortMode: GuildBattleCastleListSortMode;
  readonly onSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
}) {
  return (
    <div className="list-toolbar">
      <label className="field list-toolbar__field">
        <span className="field__label">並び順</span>
        <select
          className="field__input"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as GuildBattleCastleListSortMode)}
        >
          <option value="castleId">拠点ID順</option>
          <option value="alertLevel">危険度順</option>
        </select>
      </label>
    </div>
  );
}

function CastleSummary({
  summary
}: {
  readonly summary: ReturnType<typeof createGuildBattleCastleSummaryViewModel>;
}) {
  return (
    <dl className="summary-grid summary-grid--alerts" aria-label="castle alert summary">
      <div>
        <dt>表示モード</dt>
        <dd>{summary.mode === "allCastles" ? "全拠点" : "指定ギルドのみ"}</dd>
      </div>
      <div>
        <dt>表示対象</dt>
        <dd>{summary.totalCount}</dd>
      </div>
      <div>
        <dt>安全</dt>
        <dd>{summary.safeCount}</dd>
      </div>
      <div>
        <dt>注意</dt>
        <dd>{summary.warningCount}</dd>
      </div>
      <div>
        <dt>危険</dt>
        <dd>{summary.dangerCount}</dd>
      </div>
      <div>
        <dt>最優先</dt>
        <dd>{summary.criticalCount}</dd>
      </div>
    </dl>
  );
}

function CastleList({
  capturedAt,
  viewModels
}: {
  readonly capturedAt: string;
  readonly viewModels: readonly GuildBattleCastleViewModel[];
}) {
  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  return (
    <div className="castle-list" aria-label="castle list">
      <div className="castle-list__header castle-list__header--owned">
        <span>拠点ID</span>
        <span>所有ギルドID</span>
        <span>所有ギルド名</span>
        <span>防衛数</span>
        <span>侵攻数</span>
        <span>状態</span>
        <span>alert</span>
        <span>攻撃ギルドID</span>
        <span>攻撃ギルド名</span>
        <span>最終取得時刻</span>
      </div>
      {viewModels.map((viewModel) => (
        <div className="castle-list__row castle-list__row--owned" key={viewModel.castleId}>
          <span>{viewModel.castleId}</span>
          <span>{viewModel.ownerGuildId ?? "-"}</span>
          <span>{viewModel.ownerGuildName}</span>
          <span>{viewModel.defenseCount}</span>
          <span>{viewModel.attackCount}</span>
          <span>{viewModel.state}</span>
          <span className={`alert-level alert-${viewModel.alertLevel}`}>
            {formatAlertLevel(viewModel.alertLevel)}
          </span>
          <span>{viewModel.attackerGuildId ?? "-"}</span>
          <span>{viewModel.attackerGuildName ?? "-"}</span>
          <span>{capturedAt}</span>
        </div>
      ))}
    </div>
  );
}

function formatAlertLevel(alertLevel: GuildBattleAlertLevel): string {
  switch (alertLevel) {
    case "safe":
      return "安全";
    case "warning":
      return "注意";
    case "danger":
      return "危険";
    case "critical":
      return "最優先 / 侵攻中";
  }
}
