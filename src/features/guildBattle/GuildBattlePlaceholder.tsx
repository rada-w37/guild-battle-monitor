import { useEffect, useMemo, useRef, useState } from "react";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { BrowserGvgRealtimeClient } from "../gvg/browserRealtimeClient";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgRealtimeClient, GvgRealtimeConnectionState } from "../gvg/realtimeClientTypes";
import { GvgRealtimeSnapshotRuntime } from "../gvg/realtimeSnapshotRuntime";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import {
  createGuildBattleAlertThresholds,
  getDefaultEditableGuildBattleAlertThresholds,
  loadGuildBattleAlertThresholds,
  saveGuildBattleAlertThresholds,
  validateGuildBattleAlertThresholds,
  type EditableGuildBattleAlertThresholds
} from "./alertThresholdStorage";
import {
  createGuildBattleCastleDisplayViewModel,
  createGuildBattleCastleSummaryViewModel,
  createGuildBattleGuildCandidates,
  sortGuildBattleCastleViewModels
} from "./selectors";
import { TestModeGvgRealtimeClient } from "./testModeRealtimeClient";
import type {
  GuildBattleAlertLevel,
  GuildBattleAlertThresholds,
  GuildBattleCastleDisplayMode,
  GuildBattleCastleDisplayReason,
  GuildBattleCastleListSortMode,
  GuildBattleCastleViewModel,
  GuildBattleGuildCandidateViewModel
} from "./types";

const IS_DEV = import.meta.env.DEV;
const WORLD_ID_BASE = 1000;
const AUTO_LOAD_DELAY_MS = 500;

interface GuildBattlePlaceholderProps {
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly createRealtimeClient?: () => GvgRealtimeClient;
}

export function GuildBattlePlaceholder({
  loadSnapshot = loadLocalGvgSnapshot,
  createRealtimeClient = () => new BrowserGvgRealtimeClient()
}: GuildBattlePlaceholderProps) {
  const [world, setWorld] = useState("");
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });
  const [realtimeState, setRealtimeState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const [castleSortMode, setCastleSortMode] = useState<GuildBattleCastleListSortMode>("castleId");
  const [isTestModeEnabled, setIsTestModeEnabled] = useState(false);
  const [editableAlertThresholds, setEditableAlertThresholds] = useState<EditableGuildBattleAlertThresholds>(() =>
    loadGuildBattleAlertThresholds()
  );
  const [alertThresholdError, setAlertThresholdError] = useState<string | null>(null);
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);
  const testModeClientRef = useRef<TestModeGvgRealtimeClient | null>(null);

  const worldId = useMemo(() => createWorldIdFromWorld(world), [world]);
  const isLoading = loadState.status === "loading";
  const hasLoadedSnapshot = loadState.status === "success";
  const guildCandidates = useMemo(
    () => (loadState.status === "success" ? createGuildBattleGuildCandidates(loadState.data) : []),
    [loadState]
  );
  const selectedGuildCandidate = guildCandidates.find((candidate) => candidate.guildId === selectedGuildId);
  const guildSelectValue = selectedGuildCandidate?.guildId ?? "";
  const alertThresholds = useMemo(
    () => createGuildBattleAlertThresholds(editableAlertThresholds),
    [editableAlertThresholds]
  );
  const canStartRealtime = hasLoadedSnapshot && worldId !== null && realtimeState.status === "idle";
  const canReconnectRealtime =
    hasLoadedSnapshot &&
    worldId !== null &&
    (realtimeState.status === "disconnected" || realtimeState.status === "error");
  const canStopRealtime = realtimeState.status === "connecting" || realtimeState.status === "connected";

  useEffect(() => {
    return () => {
      stopRealtime("component unmounted");
    };
  }, []);

  useEffect(() => {
    if (world.trim().length === 0) {
      stopRealtime("world cleared", { nextState: "idle" });
      setLoadState({ status: "idle" });
      setSelectedGuildId("");
      return;
    }

    if (worldId === null) {
      setLoadState({ status: "error", error: new Error("worldは数字で入力してください。") });
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadSnapshotForWorldId(worldId);
    }, AUTO_LOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [world, worldId]);

  async function loadSnapshotForWorldId(nextWorldId: GvgWorldId) {
    stopRealtime("snapshot reload", { nextState: "idle" });
    setLoadState({ status: "loading" });

    try {
      const snapshot = await loadSnapshot(nextWorldId);
      setLoadState({ status: "success", data: snapshot });
      setSelectedGuildId("");
    } catch (error) {
      setLoadState({
        status: "error",
        error: error instanceof Error ? error : new Error("初期状態の取得に失敗しました。")
      });
    }
  }

  async function handleRefresh() {
    if (worldId === null) {
      return;
    }

    await loadSnapshotForWorldId(worldId);
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

    const client = IS_DEV && isTestModeEnabled ? new TestModeGvgRealtimeClient() : createRealtimeClient();

    if (client instanceof TestModeGvgRealtimeClient) {
      client.setSnapshot(snapshot);
      testModeClientRef.current = client;
    } else {
      testModeClientRef.current = null;
    }

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
    testModeClientRef.current = null;
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

  function handleAlertThresholdChange(nextThresholds: EditableGuildBattleAlertThresholds) {
    const validation = validateGuildBattleAlertThresholds(nextThresholds);

    if (!validation.valid) {
      setAlertThresholdError(validation.error);
      return;
    }

    setAlertThresholdError(null);
    setEditableAlertThresholds(validation.thresholds);
    saveGuildBattleAlertThresholds(validation.thresholds);
  }

  function handleAlertThresholdReset() {
    const defaultThresholds = getDefaultEditableGuildBattleAlertThresholds();
    setAlertThresholdError(null);
    setEditableAlertThresholds(defaultThresholds);
    saveGuildBattleAlertThresholds(defaultThresholds);
  }

  return (
    <main className="app-shell">
      <section className="placeholder monitor-panel" aria-labelledby="app-title">
        <h1 className="placeholder__title" id="app-title">
          GuildBattleMonitor
        </h1>

        <div className="load-form">
          <label className="field">
            <span className="field__label">world</span>
            <input
              className="field__input field__input--world"
              type="text"
              value={world}
              onChange={(event) => setWorld(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
              placeholder="37"
            />
          </label>
          <GuildCandidateSelect
            candidates={guildCandidates}
            disabled={isLoading || loadState.status !== "success"}
            value={guildSelectValue}
            onChange={setSelectedGuildId}
          />
          <button className="load-form__button" type="button" disabled={isLoading || worldId === null} onClick={handleRefresh}>
            更新
          </button>
        </div>

        <AlertThresholdSettings
          error={alertThresholdError}
          thresholds={editableAlertThresholds}
          onChange={handleAlertThresholdChange}
          onReset={handleAlertThresholdReset}
        />

        {IS_DEV ? (
          <TestModeSettings
            checked={isTestModeEnabled}
            disabled={realtimeState.status === "connecting" || realtimeState.status === "connected"}
            onChange={setIsTestModeEnabled}
          />
        ) : null}

        <SnapshotStatus
          alertThresholds={alertThresholds}
          castleSortMode={castleSortMode}
          isTestModeEnabled={IS_DEV && isTestModeEnabled}
          loadState={loadState}
          selectedGuildId={guildSelectValue}
          showDevDetails={IS_DEV}
          onCastleSortModeChange={setCastleSortMode}
          onTestModeDefenseIncrease={(castleId, amount) => testModeClientRef.current?.increaseDefense(castleId, amount)}
          onTestModeAttackIncrease={(castleId, amount) => testModeClientRef.current?.increaseAttack(castleId, amount)}
          onTestModeRevive={(castleId) => testModeClientRef.current?.reviveCastle(castleId)}
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

function createWorldIdFromWorld(world: string): GvgWorldId | null {
  const trimmedWorld = world.trim();

  if (trimmedWorld.length === 0 || !/^\d+$/.test(trimmedWorld)) {
    return null;
  }

  const worldNumber = Number(trimmedWorld);

  if (!Number.isSafeInteger(worldNumber) || worldNumber <= 0) {
    return null;
  }

  return String(WORLD_ID_BASE + worldNumber) as GvgWorldId;
}

function TestModeSettings({
  checked,
  disabled,
  onChange
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <details className="test-mode-settings">
      <summary>DEVテストモード</summary>
      <label className="test-mode-settings__toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>TestModeGvgRealtimeClientを使う</span>
      </label>
    </details>
  );
}

function AlertThresholdSettings({
  error,
  thresholds,
  onChange,
  onReset
}: {
  readonly error: string | null;
  readonly thresholds: EditableGuildBattleAlertThresholds;
  readonly onChange: (thresholds: EditableGuildBattleAlertThresholds) => void;
  readonly onReset: () => void;
}) {
  return (
    <details className="alert-settings">
      <summary>アラート設定</summary>
      <p className="alert-settings__help">防衛数が設定値を下回るとalertが変わります。</p>
      <div className="alert-settings__fields">
        <ThresholdInput
          label="注意"
          value={thresholds.warningDefenseCount}
          onChange={(warningDefenseCount) => onChange({ ...thresholds, warningDefenseCount })}
        />
        <ThresholdInput
          label="危険"
          value={thresholds.dangerDefenseCount}
          onChange={(dangerDefenseCount) => onChange({ ...thresholds, dangerDefenseCount })}
        />
        <ThresholdInput
          label="最優先"
          value={thresholds.criticalDefenseCount}
          onChange={(criticalDefenseCount) => onChange({ ...thresholds, criticalDefenseCount })}
        />
        <button className="load-form__button load-form__button--secondary" type="button" onClick={onReset}>
          デフォルト
        </button>
      </div>
      {error !== null ? (
        <p className="status-message status-message--error alert-settings__error" role="alert">
          {error}
        </p>
      ) : null}
    </details>
  );
}

function ThresholdInput({
  label,
  value,
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="field threshold-field">
      <span className="field__label">{label}</span>
      <span className="threshold-field__control">
        <input
          className="field__input field__input--narrow"
          min="0"
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>未満</span>
      </span>
    </label>
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
      <span className="field__label">ギルド</span>
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
  alertThresholds,
  castleSortMode,
  isTestModeEnabled,
  loadState,
  selectedGuildId,
  showDevDetails,
  onCastleSortModeChange,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly isTestModeEnabled: boolean;
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly onCastleSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  if (loadState.status === "idle") {
    return <p className="status-message">worldを入力してください。</p>;
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
      alertThresholds={alertThresholds}
      castleSortMode={castleSortMode}
      isTestModeEnabled={isTestModeEnabled}
      selectedGuildId={selectedGuildId}
      showDevDetails={showDevDetails}
      snapshot={loadState.data}
      onCastleSortModeChange={onCastleSortModeChange}
      onTestModeDefenseIncrease={onTestModeDefenseIncrease}
      onTestModeAttackIncrease={onTestModeAttackIncrease}
      onTestModeRevive={onTestModeRevive}
    />
  );
}

function SnapshotSummary({
  alertThresholds,
  castleSortMode,
  isTestModeEnabled,
  selectedGuildId,
  showDevDetails,
  snapshot,
  onCastleSortModeChange,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly isTestModeEnabled: boolean;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly snapshot: GvgSnapshot;
  readonly onCastleSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  const castleDisplay = useMemo(() => {
    return createGuildBattleCastleDisplayViewModel(snapshot, {
      ownGuildId: selectedGuildId.length === 0 ? "" : (selectedGuildId as GvgGuildId),
      alertThresholds
    });
  }, [alertThresholds, selectedGuildId, snapshot]);
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
        拠点監視
      </h2>
      <CastleDisplayNotice reason={castleDisplay.reason} />
      <CastleListToolbar sortMode={castleSortMode} onSortModeChange={onCastleSortModeChange} />
      <CastleSummary summary={summary} />
      {showDevDetails ? <DevSnapshotDetails snapshot={snapshot} /> : null}
      <CastleList
        capturedAt={snapshot.capturedAt}
        displayMode={castleDisplay.mode}
        isTestModeEnabled={isTestModeEnabled}
        showDevDetails={showDevDetails}
        viewModels={sortedCastles}
        onTestModeDefenseIncrease={onTestModeDefenseIncrease}
        onTestModeAttackIncrease={onTestModeAttackIncrease}
        onTestModeRevive={onTestModeRevive}
      />
    </section>
  );
}

function DevSnapshotDetails({ snapshot }: { readonly snapshot: GvgSnapshot }) {
  return (
    <details className="dev-snapshot-details">
      <summary>DEV取得情報</summary>
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
    </details>
  );
}

function CastleDisplayNotice({ reason }: { readonly reason: GuildBattleCastleDisplayReason }) {
  if (reason === "ownGuildUnspecified") {
    return <p className="status-message">全拠点を表示しています。</p>;
  }

  if (reason === "ownedCastlesNotFound") {
    return <p className="status-message">指定ギルドの防衛拠点がないため、全拠点を表示しています。</p>;
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
      <label className="sort-toggle">
        <input
          type="checkbox"
          checked={sortMode === "alertLevel"}
          onChange={(event) => onSortModeChange(event.target.checked ? "alertLevel" : "castleId")}
        />
        <span>危険度順で表示</span>
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
        <dt>表示</dt>
        <dd>{summary.mode === "allCastles" ? "全拠点" : "指定ギルド"}</dd>
      </div>
      <div>
        <dt>対象</dt>
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
  displayMode,
  isTestModeEnabled,
  showDevDetails,
  viewModels,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly capturedAt: string;
  readonly displayMode: GuildBattleCastleDisplayMode;
  readonly isTestModeEnabled: boolean;
  readonly showDevDetails: boolean;
  readonly viewModels: readonly GuildBattleCastleViewModel[];
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  const showOwnerGuild = displayMode === "allCastles";

  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  return (
    <div
      className={`castle-list${showOwnerGuild ? " castle-list--with-owner" : ""}${
        showDevDetails ? " castle-list--with-dev" : ""
      }${isTestModeEnabled ? " castle-list--with-test" : ""}`}
      aria-label="castle list"
    >
      <div className="castle-list__header">
        <span>拠点</span>
        <span>alert</span>
        <span>状態</span>
        <span>防</span>
        <span>侵</span>
        {showOwnerGuild ? <span>所有</span> : null}
        <span>攻撃</span>
        {showDevDetails ? <span>更新</span> : null}
        {isTestModeEnabled ? <span>test</span> : null}
      </div>
      {viewModels.map((viewModel) => (
        <div className={`castle-list__row castle-list__row--${viewModel.alertLevel}`} key={viewModel.castleId}>
          <span className="castle-list__castle" data-label="拠点">
            <strong>{viewModel.castleName}</strong>
          </span>
          <span data-label="alert" className={`alert-level alert-${viewModel.alertLevel}`}>
            {formatAlertLevel(viewModel.alertLevel)}
          </span>
          <span data-label="状態" className={`battle-status battle-status--${viewModel.statusTone}`}>
            {viewModel.statusLabel}
          </span>
          <span className="castle-list__count" data-label="防">
            {viewModel.defenseCount}
          </span>
          <span className="castle-list__count" data-label="侵">
            {viewModel.attackCount}
          </span>
          {showOwnerGuild ? (
            <span className="castle-list__guild" data-label="所有">
              {viewModel.ownerGuildName}
            </span>
          ) : null}
          <span className="castle-list__guild" data-label="攻撃">
            {viewModel.attackerGuildName ?? "-"}
          </span>
          {showDevDetails ? (
            <span className="castle-list__updated" data-label="更新">
              {capturedAt}
            </span>
          ) : null}
          {isTestModeEnabled ? (
            <span className="test-mode-actions" data-label="test">
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 5)}>
                防 +5
              </button>
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 10)}>
                防 +10
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 5)}>
                侵 +5
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 10)}>
                侵 +10
              </button>
              <button type="button" onClick={() => onTestModeRevive(viewModel.castleId)}>
                復帰
              </button>
            </span>
          ) : null}
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
      return "最優先";
  }
}
