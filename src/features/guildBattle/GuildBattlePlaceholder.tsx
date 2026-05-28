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
  createGuildBattleGuildCandidates,
  sortGuildBattleCastleViewModels
} from "./selectors";
import type { TestModeGvgRealtimeClient } from "./testModeRealtimeClient";
import type {
  GuildBattleAlertLevel,
  GuildBattleAlertThresholds,
  GuildBattleCastleDisplayMode,
  GuildBattleCastleListSortMode,
  GuildBattleCastleViewModel,
  GuildBattleGuildCandidateViewModel
} from "./types";

const IS_DEV = import.meta.env.DEV;
const WORLD_ID_BASE = 1000;

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
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useState(true);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
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
  const isRealtimeActive = realtimeState.status === "connecting" || realtimeState.status === "connected";

  useEffect(() => {
    return () => {
      stopRealtime("component unmounted");
    };
  }, []);

  async function loadSnapshotForWorldId(nextWorldId: GvgWorldId) {
    stopRealtime("snapshot reload", { nextState: "idle" });
    setLoadState({ status: "loading" });

    try {
      const snapshot = await loadSnapshot(nextWorldId);
      setLoadState({ status: "success", data: snapshot });
      setSelectedGuildId("");

      if (isAutoUpdateEnabled) {
        await startRealtime(snapshot);
      }
    } catch (error) {
      setLoadState({
        status: "error",
        error: error instanceof Error ? error : new Error("初期状態の取得に失敗しました。")
      });
    }
  }

  async function handleRefresh() {
    if (world.trim().length === 0) {
      setLoadState({ status: "idle" });
      stopRealtime("world cleared", { nextState: "idle" });
      return;
    }

    if (worldId === null) {
      setLoadState({ status: "error", error: new Error("worldは数字で入力してください。") });
      return;
    }

    await loadSnapshotForWorldId(worldId);
  }

  async function handleAutoUpdateToggle() {
    const nextEnabled = !isAutoUpdateEnabled;
    setIsAutoUpdateEnabled(nextEnabled);

    if (!nextEnabled) {
      stopRealtime("auto update disabled", { nextState: "idle" });
      return;
    }

    if (loadState.status === "success") {
      await startRealtime(loadState.data);
    }
  }

  async function startRealtime(snapshot: GvgSnapshot) {
    stopRealtime("realtime restart", { nextState: "idle" });

    const { client, testModeClient } = await createRealtimeClientForCurrentMode(snapshot);
    testModeClientRef.current = testModeClient;

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

  async function createRealtimeClientForCurrentMode(snapshot: GvgSnapshot): Promise<{
    readonly client: GvgRealtimeClient;
    readonly testModeClient: TestModeGvgRealtimeClient | null;
  }> {
    if (IS_DEV && isTestModeEnabled) {
      const { TestModeGvgRealtimeClient } = await import("./testModeRealtimeClient");
      const testModeClient = new TestModeGvgRealtimeClient();
      testModeClient.setSnapshot(snapshot);

      return { client: testModeClient, testModeClient };
    }

    return { client: createRealtimeClient(), testModeClient: null };
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
        <div className="monitor-header">
          <h1 className="placeholder__title" id="app-title">
            GuildBattleMonitor
          </h1>
          <button
            className="settings-button"
            type="button"
            aria-label="設定を開く"
            onClick={() => setIsSettingsDialogOpen(true)}
          >
            <svg aria-hidden="true" className="settings-button__icon" viewBox="0 0 24 24">
              <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A8 8 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a9.3 9.3 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
            </svg>
          </button>
        </div>

        <div className="startup-panel" aria-label="起動">
          <label className="field">
            <span className="field__label">world</span>
            <input
              className="field__input field__input--world"
              type="text"
              value={world}
              onChange={(event) => setWorld(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
            />
          </label>
          <button className="load-form__button" type="button" disabled={isLoading || world.trim().length === 0} onClick={handleRefresh}>
            更新
          </button>
        </div>

        {isSettingsDialogOpen ? (
          <SettingsDialog
            alertThresholdError={alertThresholdError}
            castleSortMode={castleSortMode}
            editableAlertThresholds={editableAlertThresholds}
            isAutoUpdateEnabled={isAutoUpdateEnabled}
            isRealtimeActive={isRealtimeActive}
            isTestModeEnabled={isTestModeEnabled}
            realtimeState={realtimeState}
            onAlertThresholdChange={handleAlertThresholdChange}
            onAlertThresholdReset={handleAlertThresholdReset}
            onAutoUpdateToggle={handleAutoUpdateToggle}
            onClose={() => setIsSettingsDialogOpen(false)}
            onSortModeChange={setCastleSortMode}
            onTestModeChange={setIsTestModeEnabled}
          />
        ) : null}

        <SnapshotStatus
          alertThresholds={alertThresholds}
          castleSortMode={castleSortMode}
          guildCandidates={guildCandidates}
          guildSelectValue={guildSelectValue}
          isTestModeEnabled={IS_DEV && isTestModeEnabled}
          loadState={loadState}
          selectedGuildId={guildSelectValue}
          showDevDetails={IS_DEV}
          onGuildChange={setSelectedGuildId}
          onTestModeDefenseIncrease={(castleId, amount) => testModeClientRef.current?.increaseDefense(castleId, amount)}
          onTestModeAttackIncrease={(castleId, amount) => testModeClientRef.current?.increaseAttack(castleId, amount)}
          onTestModeRevive={(castleId) => testModeClientRef.current?.reviveCastle(castleId)}
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

function SettingsDialog({
  alertThresholdError,
  castleSortMode,
  editableAlertThresholds,
  isAutoUpdateEnabled,
  isRealtimeActive,
  isTestModeEnabled,
  realtimeState,
  onAlertThresholdChange,
  onAlertThresholdReset,
  onAutoUpdateToggle,
  onClose,
  onSortModeChange,
  onTestModeChange
}: {
  readonly alertThresholdError: string | null;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly editableAlertThresholds: EditableGuildBattleAlertThresholds;
  readonly isAutoUpdateEnabled: boolean;
  readonly isRealtimeActive: boolean;
  readonly isTestModeEnabled: boolean;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly onAlertThresholdChange: (thresholds: EditableGuildBattleAlertThresholds) => void;
  readonly onAlertThresholdReset: () => void;
  readonly onAutoUpdateToggle: () => void;
  readonly onClose: () => void;
  readonly onSortModeChange: (sortMode: GuildBattleCastleListSortMode) => void;
  readonly onTestModeChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="settings-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog__header">
          <h2 id="settings-dialog-title">設定</h2>
          <button className="settings-dialog__close" type="button" aria-label="設定を閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-dialog__body">
          <AlertThresholdSettings
            error={alertThresholdError}
            thresholds={editableAlertThresholds}
            onChange={onAlertThresholdChange}
            onReset={onAlertThresholdReset}
          />
          <section className="settings-section">
            <h3>並び順</h3>
            <label className="sort-toggle">
              <input
                type="checkbox"
                checked={castleSortMode === "alertLevel"}
                onChange={(event) => onSortModeChange(event.target.checked ? "alertLevel" : "castleId")}
              />
              <span>危険度順で表示</span>
            </label>
          </section>
          <section className="settings-section">
            <h3>自動更新</h3>
            <div className="auto-update-setting">
              <button
                className={`auto-update-toggle ${isAutoUpdateEnabled ? "auto-update-toggle--on" : "auto-update-toggle--off"}`}
                type="button"
                onClick={onAutoUpdateToggle}
              >
                {isAutoUpdateEnabled ? "ON" : "OFF"}
              </button>
              <span className={`auto-update-state auto-update-state--${getRealtimeStateTone(realtimeState)}`}>
                {getRealtimeStateLabel(realtimeState)}
              </span>
            </div>
          </section>
          {IS_DEV ? (
            <section className="settings-section">
              <TestModeSettings
                checked={isTestModeEnabled}
                disabled={isRealtimeActive}
                onChange={onTestModeChange}
              />
            </section>
          ) : null}
        </div>
      </section>
    </div>
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
    <section className="settings-section alert-settings">
      <h3>アラート設定</h3>
      <p className="alert-settings__help">防衛数が設定値未満になると色が変わります。</p>
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
    </section>
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
    <label className="field guild-select-field">
      <span className="field__label">防衛ギルド</span>
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

function SnapshotStatus({
  alertThresholds,
  castleSortMode,
  guildCandidates,
  guildSelectValue,
  isTestModeEnabled,
  loadState,
  selectedGuildId,
  showDevDetails,
  onGuildChange,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly guildSelectValue: string;
  readonly isTestModeEnabled: boolean;
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly onGuildChange: (guildId: string) => void;
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  if (loadState.status === "idle") {
    return <p className="status-message">worldを入力して更新してください。</p>;
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
      guildCandidates={guildCandidates}
      guildSelectValue={guildSelectValue}
      isTestModeEnabled={isTestModeEnabled}
      selectedGuildId={selectedGuildId}
      showDevDetails={showDevDetails}
      snapshot={loadState.data}
      onGuildChange={onGuildChange}
      onTestModeDefenseIncrease={onTestModeDefenseIncrease}
      onTestModeAttackIncrease={onTestModeAttackIncrease}
      onTestModeRevive={onTestModeRevive}
    />
  );
}

function SnapshotSummary({
  alertThresholds,
  castleSortMode,
  guildCandidates,
  guildSelectValue,
  isTestModeEnabled,
  selectedGuildId,
  showDevDetails,
  snapshot,
  onGuildChange,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly guildSelectValue: string;
  readonly isTestModeEnabled: boolean;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly snapshot: GvgSnapshot;
  readonly onGuildChange: (guildId: string) => void;
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
  const shouldShowDevDetails = IS_DEV && showDevDetails;
  const shouldShowTestControls = IS_DEV && isTestModeEnabled;

  return (
    <section className="snapshot-summary" aria-labelledby="snapshot-title">
      <h2 className="snapshot-summary__title" id="snapshot-title">
        拠点監視
      </h2>
      <GuildCandidateSelect
        candidates={guildCandidates}
        disabled={false}
        value={guildSelectValue}
        onChange={onGuildChange}
      />
      {shouldShowDevDetails ? <DevSnapshotDetails snapshot={snapshot} /> : null}
      <CastleList
        capturedAt={snapshot.capturedAt}
        displayMode={castleDisplay.mode}
        isTestModeEnabled={shouldShowTestControls}
        showDevDetails={shouldShowDevDetails}
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
  const shouldShowDevDetails = IS_DEV && showDevDetails;
  const shouldShowTestControls = IS_DEV && isTestModeEnabled;

  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  return (
    <div
      className={`castle-list${showOwnerGuild ? " castle-list--with-owner" : ""}${
        shouldShowDevDetails ? " castle-list--with-dev" : ""
      }${shouldShowTestControls ? " castle-list--with-test" : ""}`}
      aria-label="castle list"
    >
      <div className="castle-list__header">
        <span>拠点</span>
        <span>防</span>
        <span>攻</span>
        <span>KO</span>
        {showOwnerGuild ? <span>所有</span> : null}
        <span>攻撃</span>
        {shouldShowDevDetails ? <span>更新</span> : null}
        {shouldShowTestControls ? <span>test</span> : null}
      </div>
      {viewModels.map((viewModel) => (
        <div className={`castle-list__row castle-list__row--${viewModel.alertLevel}`} key={viewModel.castleId}>
          <span className="castle-list__castle" data-label="拠点">
            <strong>{viewModel.castleName}</strong>
          </span>
          <span className="castle-list__count" data-label="防">
            {viewModel.defenseCount}
          </span>
          <span className="castle-list__count" data-label="攻">
            {viewModel.attackCount}
          </span>
          <span className="castle-list__ko" data-label="KO">
            {viewModel.koDisplay !== null ? (
              <span className={`ko-badge ko-badge--${viewModel.koDisplay.tone}`}>
                {viewModel.koDisplay.count} KO
              </span>
            ) : null}
          </span>
          {showOwnerGuild ? (
            <span className="castle-list__guild" data-label="所有">
              {viewModel.ownerGuildName}
            </span>
          ) : null}
          <span className="castle-list__guild" data-label="攻撃">
            {viewModel.attackerGuildName ?? "-"}
          </span>
          {shouldShowDevDetails ? (
            <span className="castle-list__updated" data-label="更新">
              {capturedAt}
            </span>
          ) : null}
          {shouldShowTestControls ? (
            <span className="test-mode-actions" data-label="test">
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 5)}>
                防 +5
              </button>
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 10)}>
                防 +10
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 5)}>
                攻 +5
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 10)}>
                攻 +10
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

function getRealtimeStateTone(state: GvgRealtimeConnectionState): "idle" | "connecting" | "connected" | "disconnected" | "error" {
  switch (state.status) {
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "error":
      return "error";
    case "idle":
      return "idle";
  }
}

function getRealtimeStateLabel(state: GvgRealtimeConnectionState): string {
  switch (state.status) {
    case "connecting":
    case "reconnecting":
      return "接続中";
    case "connected":
      return "自動更新中";
    case "disconnected":
      return "停止中";
    case "error":
      return "エラー";
    case "idle":
      return "停止中";
  }
}
