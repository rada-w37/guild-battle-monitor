import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createAppCapabilities } from "../../app/appCapabilities";
import { getAppModePermissions, useAppRoute, type AppMode, type AppModePermissions } from "../../app/appMode";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { BattleMonitorCastleList, BattleMonitorGuildSelect } from "../battleMonitor/components";
import {
  loadGrandBattleParticipantGuilds,
  loadGrandBattleSnapshot
} from "../grandBattle/grandBattleParticipantService";
import { GrandBattleRealtimeSnapshotRuntime } from "../grandBattle/realtimeSnapshotRuntime";
import {
  createGrandBattleCastleListViewModels,
  createGrandBattleGuildCandidates
} from "../grandBattle/selectors";
import type {
  GrandBattleBlockId,
  GrandBattleClassId,
  GrandBattleParticipantGuildCandidate,
  GrandBattleResolvedSource,
  GrandBattleServerId,
  GrandBattleSource,
  GrandBattleSnapshot
} from "../grandBattle/types";
import { BrowserGvgRealtimeClient } from "../gvg/browserRealtimeClient";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import {
  createGuildBattleSubscription,
  type GvgRealtimeClient,
  type GvgRealtimeConnectionState,
  type GvgRealtimeSubscription
} from "../gvg/realtimeClientTypes";
import { GvgRealtimeSnapshotRuntime } from "../gvg/realtimeSnapshotRuntime";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { KoVictimSummaryPanel } from "../koMonitor/KoVictimSummaryPanel";
import {
  getNextKoObserverReadBoundary,
  isKoObserverStartedForToday,
  shouldUseKoObserverRealtime
} from "../koMonitor/koObserverTime";
import type {
  KoGuildKoTotal,
  KoGuildKoTotalsSubscriber,
  KoMonitorLoadState,
  KoObserverRunMeta
} from "../koMonitor/types";
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
  GuildBattleAlertThresholds,
  GuildBattleCastleListSortMode,
  GuildBattleGuildCandidateViewModel,
  OwnedGuildProfile
} from "./types";
import {
  loadBattleMonitorViewSettings,
  saveBattleMonitorViewSettings,
  type BattleMonitorSharedViewSettings
} from "./viewSettingsStorage";

const IS_DEV = import.meta.env.DEV;
const WORLD_ID_BASE = 1000;
const GRAND_BATTLE_DEFAULT_SERVER_ID: GrandBattleServerId = "japan";
const GRAND_BATTLE_DEFAULT_CLASS_ID: GrandBattleClassId = 3;
const GRAND_BATTLE_DEFAULT_BLOCK_ID: GrandBattleBlockId = 0;
const GRAND_BATTLE_SERVER_OPTIONS: readonly {
  readonly value: GrandBattleServerId;
  readonly label: string;
}[] = [{ value: "japan", label: "Japan" }];
const GRAND_BATTLE_CLASS_OPTIONS: readonly {
  readonly value: GrandBattleClassId;
  readonly label: string;
}[] = [
  { value: 3, label: "グランドマスター" },
  { value: 2, label: "エキスパート" },
  { value: 1, label: "エリート" }
];
const GRAND_BATTLE_BLOCK_OPTIONS: readonly {
  readonly value: GrandBattleBlockId;
  readonly label: string;
}[] = [
  { value: 0, label: "A" },
  { value: 1, label: "B" },
  { value: 2, label: "C" },
  { value: 3, label: "D" }
];
const CURRENT_TIME_REFRESH_INTERVAL_MS = 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

function getCurrentDate() {
  return new Date();
}

type BattleMonitorMode = "guildBattle" | "grandBattle";

type BattleMonitorSharedState = BattleMonitorSharedViewSettings;

interface GuildBattlePlaceholderProps {
  readonly afterHeader?: ReactNode;
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly loadGrandBattleParticipants?: typeof loadGrandBattleParticipantGuilds;
  readonly loadGrandBattleLatestSnapshot?: typeof loadGrandBattleSnapshot;
  readonly loadKoObserverRunMeta?: () => Promise<KoObserverRunMeta | null>;
  readonly loadKoGuildKoTotals?: () => Promise<readonly KoGuildKoTotal[]>;
  readonly subscribeKoGuildKoTotals?: KoGuildKoTotalsSubscriber;
  readonly koMonitorNow?: () => Date;
  readonly createRealtimeClient?: () => GvgRealtimeClient;
  readonly headerActions?: ReactNode;
  readonly modeOverride?: AppMode;
  readonly notificationSettings?: ReactNode;
  readonly ownedGuildProfilePersistence?: OwnedGuildProfilePersistence;
  readonly permissionsOverride?: Partial<AppModePermissions>;
  readonly settingsDraftExternal?: SettingsDraftExternal;
  readonly sharedGuild?: SharedGuildContext | null;
  readonly shareSettings?: ReactNode;
}

export interface SettingsDraftExternal {
  readonly hasValidationError: boolean;
  readonly isDirty: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => Promise<boolean>;
}

export interface SharedGuildContext {
  readonly mode: "admin" | "guest";
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
}

export interface OwnedGuildProfilePersistence {
  readonly error?: string | null;
  readonly isLoading: boolean;
  readonly isSignedIn: boolean;
  readonly profile: OwnedGuildProfile | null;
  readonly onChange: (profile: OwnedGuildProfile) => void;
  readonly onSave?: (profile: OwnedGuildProfile) => Promise<boolean>;
}

interface GuildBattleRuntimeService {
  readonly loadSnapshot: typeof loadLocalGvgSnapshot;
  readonly createRealtimeClient: () => GvgRealtimeClient;
  readonly createSubscription: (snapshot: GvgSnapshot) => GvgRealtimeSubscription;
}

export function GuildBattlePlaceholder({
  afterHeader,
  loadSnapshot = loadLocalGvgSnapshot,
  loadGrandBattleParticipants = loadGrandBattleParticipantGuilds,
  loadGrandBattleLatestSnapshot = loadGrandBattleSnapshot,
  loadKoObserverRunMeta,
  loadKoGuildKoTotals,
  subscribeKoGuildKoTotals,
  koMonitorNow = getCurrentDate,
  createRealtimeClient = () => new BrowserGvgRealtimeClient(),
  headerActions,
  modeOverride,
  notificationSettings,
  ownedGuildProfilePersistence,
  permissionsOverride,
  settingsDraftExternal,
  sharedGuild,
  shareSettings
}: GuildBattlePlaceholderProps) {
  const appRoute = useAppRoute();
  const appMode = modeOverride ?? sharedGuild?.mode ?? appRoute?.mode ?? "owner";
  const modePermissions = { ...getAppModePermissions(appMode), ...permissionsOverride };
  const hasConfiguredGuildContext =
    sharedGuild !== undefined && sharedGuild !== null
      ? true
      : isCompleteOwnedGuildProfile(ownedGuildProfilePersistence?.profile ?? null);
  const hasKoMonitorView =
    loadKoObserverRunMeta !== undefined &&
    loadKoGuildKoTotals !== undefined &&
    subscribeKoGuildKoTotals !== undefined;
  const appCapabilities = createAppCapabilities({
    firebaseEnabled:
      ownedGuildProfilePersistence !== undefined ||
      notificationSettings !== undefined ||
      settingsDraftExternal !== undefined ||
      shareSettings !== undefined ||
      hasKoMonitorView,
    hasConfiguredGuildContext,
    hasKoMonitorView,
    hasNotificationSettings: notificationSettings !== undefined,
    hasOwnedGuildProfilePersistence: ownedGuildProfilePersistence !== undefined,
    hasShareSettings: shareSettings !== undefined,
    isSignedInOwner: ownedGuildProfilePersistence?.isSignedIn ?? false,
    mode: appMode,
    modePermissions
  });
  const [initialViewSettings] = useState(() => loadBattleMonitorViewSettings());
  const [activeMode, setActiveMode] = useState<BattleMonitorMode>("guildBattle");
  const [shared, setShared] = useState<BattleMonitorSharedState>(() =>
    sharedGuild === undefined || sharedGuild === null
      ? initialViewSettings.shared
      : {
          ...initialViewSettings.shared,
          worldInput: String(sharedGuild.world),
          worldNumber: sharedGuild.world
        }
  );
  const [grandBattleDraftSource, setGrandBattleDraftSource] = useState<GrandBattleSource>(() =>
    createInitialGrandBattleSource(initialViewSettings.shared)
  );
  const [grandBattleCandidateSource, setGrandBattleCandidateSource] =
    useState<GrandBattleResolvedSource | null>(null);
  const [grandBattleAppliedSource, setGrandBattleAppliedSource] =
    useState<GrandBattleResolvedSource | null>(null);
  const [grandBattleParticipantLoadState, setGrandBattleParticipantLoadState] = useState<
    AsyncLoadState<readonly GrandBattleParticipantGuildCandidate[]>
  >({ status: "idle" });
  const [grandBattleParticipantCandidates, setGrandBattleParticipantCandidates] = useState<
    readonly GrandBattleParticipantGuildCandidate[]
  >([]);
  const [grandBattleSnapshotLoadState, setGrandBattleSnapshotLoadState] = useState<
    AsyncLoadState<GrandBattleSnapshot>
  >({ status: "idle" });
  const [grandBattleRealtimeState, setGrandBattleRealtimeState] = useState<GvgRealtimeConnectionState>({
    status: "idle"
  });
  const [selectedGrandBattleGuildId, setSelectedGrandBattleGuildId] = useState<GvgGuildId | "">("");
  const [selectedGuildId, setSelectedGuildId] = useState(initialViewSettings.guildBattle.selectedGuildId);
  const [selectedOwnedGuildWorldId, setSelectedOwnedGuildWorldId] = useState("");
  const [ownedGuildWorldError, setOwnedGuildWorldError] = useState<string | null>(null);
  const [selectedOwnedGuildId, setSelectedOwnedGuildId] = useState<GvgGuildId | "">("");
  const [selectedOwnedGuildName, setSelectedOwnedGuildName] = useState<string | null>(null);
  const [ownedGuildCandidateLoadState, setOwnedGuildCandidateLoadState] = useState<
    AsyncLoadState<readonly GuildBattleGuildCandidateViewModel[]>
  >({ status: "idle" });
  const [ownedGuildCandidates, setOwnedGuildCandidates] = useState<readonly GuildBattleGuildCandidateViewModel[]>([]);
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });
  const [realtimeState, setRealtimeState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isTestModeEnabled, setIsTestModeEnabled] = useState(false);
  const [koMonitorRefreshKey, setKoMonitorRefreshKey] = useState(0);
  const [editableAlertThresholds, setEditableAlertThresholds] = useState<EditableGuildBattleAlertThresholds>(() =>
    loadGuildBattleAlertThresholds()
  );
  const [alertThresholdError, setAlertThresholdError] = useState<string | null>(null);
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);
  const testModeClientRef = useRef<TestModeGvgRealtimeClient | null>(null);
  const grandBattleRuntimeRef = useRef<GrandBattleRealtimeSnapshotRuntime | null>(null);
  const removeGrandBattleRealtimeListenerRef = useRef<(() => void) | null>(null);
  const ownedGuildCandidateRequestSeqRef = useRef(0);
  const grandBattleParticipantRequestSeqRef = useRef(0);
  const grandBattleSnapshotRequestSeqRef = useRef(0);

  const runtimeService = useMemo<GuildBattleRuntimeService>(
    () => ({
      loadSnapshot,
      createRealtimeClient,
      createSubscription: (snapshot) => createGuildBattleSubscription(snapshot.worldId)
    }),
    [createRealtimeClient, loadSnapshot]
  );
  const world = shared.worldInput;
  const worldId = useMemo(() => createWorldIdFromWorldNumber(shared.worldNumber), [shared.worldNumber]);
  const castleSortMode = shared.sortMode;
  const isAutoUpdateEnabled = shared.autoUpdate;
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
  const isGrandBattleRealtimeActive =
    grandBattleRealtimeState.status === "connecting" || grandBattleRealtimeState.status === "connected";
  const koMonitorState = useKoMonitorLoadState({
    enabled: appCapabilities.koMonitor.visible,
    loadKoObserverRunMeta,
    loadKoGuildKoTotals,
    now: koMonitorNow,
    refreshKey: koMonitorRefreshKey,
    subscribeKoGuildKoTotals
  });

  useEffect(() => {
    return () => {
      stopRealtime("component unmounted");
      stopGrandBattleRealtime("component unmounted", { nextState: "idle" });
    };
  }, []);

  useEffect(() => {
    if (ownedGuildProfilePersistence === undefined || ownedGuildProfilePersistence.isLoading) {
      return;
    }

    const profile = ownedGuildProfilePersistence.profile;
    setSelectedOwnedGuildWorldId(profile?.world === null || profile === null ? "" : String(profile.world));
    setOwnedGuildWorldError(null);
    setSelectedOwnedGuildId((profile?.guildId ?? "") as GvgGuildId | "");
    setSelectedOwnedGuildName(profile?.guildName ?? null);
    void loadOwnedGuildCandidatesForWorld(profile?.world ?? null);
  }, [ownedGuildProfilePersistence?.isLoading, ownedGuildProfilePersistence?.profile]);

  useEffect(() => {
    if (sharedGuild === undefined || sharedGuild === null) {
      return;
    }

    const nextShared = {
      ...shared,
      worldInput: String(sharedGuild.world),
      worldNumber: sharedGuild.world
    };
    setShared(nextShared);
    void loadSnapshotForWorldId(createWorldIdFromWorldNumber(sharedGuild.world) as GvgWorldId, {
      startRealtimeOnSuccess: false
    });
  }, [sharedGuild]);

  async function loadSnapshotForWorldId(
    nextWorldId: GvgWorldId,
    options: { readonly startRealtimeOnSuccess: boolean } = { startRealtimeOnSuccess: true }
  ) {
    stopRealtime("snapshot reload", { nextState: "idle" });
    setLoadState({ status: "loading" });

    try {
      const snapshot = await runtimeService.loadSnapshot(nextWorldId);
      setLoadState({ status: "success", data: snapshot });

      if (options.startRealtimeOnSuccess && isAutoUpdateEnabled) {
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

    setKoMonitorRefreshKey((currentKey) => currentKey + 1);
    await loadSnapshotForWorldId(worldId);
  }

  async function handleViewSettingsSave(nextSettings: {
    readonly autoUpdate?: boolean;
    readonly sortMode?: GuildBattleCastleListSortMode;
  }) {
    if (!appCapabilities.localSettings.editable) {
      return;
    }

    const nextShared = {
      ...shared,
      autoUpdate: nextSettings.autoUpdate ?? shared.autoUpdate,
      sortMode: nextSettings.sortMode ?? shared.sortMode
    };
    const isAutoUpdateChanged = nextShared.autoUpdate !== shared.autoUpdate;

    setShared(nextShared);
    saveViewSettings({ shared: nextShared });

    if (!isAutoUpdateChanged) {
      return;
    }

    if (!nextShared.autoUpdate) {
      stopRealtime("auto update disabled", { nextState: "idle" });
      stopGrandBattleRealtime("auto update disabled", { nextState: "idle" });
      return;
    }

    if (activeMode === "guildBattle" && loadState.status === "success" && loadState.data.worldId === worldId) {
      await startRealtime(loadState.data);
    }

    if (activeMode === "grandBattle" && grandBattleSnapshotLoadState.status === "success") {
      await startGrandBattleRealtime(grandBattleSnapshotLoadState.data);
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
      createSubscription: runtimeService.createSubscription,
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

    return { client: runtimeService.createRealtimeClient(), testModeClient: null };
  }

  function handleAlertThresholdChange(nextThresholds: EditableGuildBattleAlertThresholds): boolean {
    if (!modePermissions.canEditAlertSettings) {
      return false;
    }

    const validation = validateGuildBattleAlertThresholds(nextThresholds);

    if (!validation.valid) {
      setAlertThresholdError(validation.error);
      return false;
    }

    setAlertThresholdError(null);
    setEditableAlertThresholds(validation.thresholds);
    if (appCapabilities.localSettings.persistable) {
      saveGuildBattleAlertThresholds(validation.thresholds);
    }
    return true;
  }

  function handleWorldChange(nextWorld: string) {
    if (!appCapabilities.localSettings.editable) {
      return;
    }

    if (sharedGuild !== undefined && sharedGuild !== null) {
      return;
    }

    const nextShared = {
      ...shared,
      worldInput: nextWorld,
      worldNumber: createWorldNumberFromWorldInput(nextWorld)
    };
    setShared(nextShared);
    saveViewSettings({ shared: nextShared });
  }

  function handleGrandBattleWorldInputChange(nextWorld: string) {
    if (!appCapabilities.localSettings.editable) {
      return;
    }

    setGrandBattleDraftSource((currentSource) => ({
      ...currentSource,
      worldInput: nextWorld,
      worldNumber: createWorldNumberFromWorldInput(nextWorld)
    }));
  }

  function handleGrandBattleWorldCommit() {
    if (!appCapabilities.localSettings.editable) {
      return;
    }

    const nextWorldNumber = createWorldNumberFromWorldInput(grandBattleDraftSource.worldInput);
    const nextDraftSource = {
      ...grandBattleDraftSource,
      worldNumber: nextWorldNumber
    };
    setGrandBattleDraftSource(nextDraftSource);

    const nextShared = {
      ...shared,
      worldInput: nextDraftSource.worldInput,
      worldNumber: nextWorldNumber
    };
    setShared(nextShared);
    saveViewSettings({ shared: nextShared });

    if (nextDraftSource.worldInput.trim().length === 0) {
      setGrandBattleCandidateSource(null);
      setGrandBattleParticipantLoadState({ status: "idle" });
      setGrandBattleParticipantCandidates([]);
      setGrandBattleSnapshotLoadState({ status: "idle" });
      setSelectedGrandBattleGuildId("");
      stopGrandBattleRealtime("grand battle world cleared", { nextState: "idle" });
      return;
    }

    if (nextWorldNumber === null) {
      setGrandBattleCandidateSource(null);
      setGrandBattleParticipantLoadState({
        status: "error",
        error: new Error("worldは数字で入力してください。")
      });
      setGrandBattleParticipantCandidates([]);
      setGrandBattleSnapshotLoadState({ status: "idle" });
      setSelectedGrandBattleGuildId("");
      stopGrandBattleRealtime("grand battle world invalid", { nextState: "idle" });
      return;
    }

    void loadGrandBattleParticipantsForSource({
      ...nextDraftSource,
      worldNumber: nextWorldNumber
    });
  }

  function handleGrandBattleServerChange(nextServerId: GrandBattleServerId) {
    updateGrandBattleSelectSource({ serverId: nextServerId });
  }

  function handleGrandBattleClassChange(nextClassId: GrandBattleClassId) {
    updateGrandBattleSelectSource({ classId: nextClassId });
  }

  function handleGrandBattleBlockChange(nextBlockId: GrandBattleBlockId) {
    updateGrandBattleSelectSource({ blockId: nextBlockId });
  }

  function updateGrandBattleSelectSource(
    nextValues: Partial<Pick<GrandBattleSource, "serverId" | "classId" | "blockId">>
  ) {
    const nextDraftSource = {
      ...grandBattleDraftSource,
      ...nextValues
    };
    setGrandBattleDraftSource(nextDraftSource);

    if (nextDraftSource.worldNumber === null) {
      return;
    }

    void loadGrandBattleParticipantsForSource({
      ...nextDraftSource,
      worldNumber: nextDraftSource.worldNumber
    });
  }

  async function loadGrandBattleParticipantsForSource(source: GrandBattleResolvedSource) {
    if (
      grandBattleCandidateSource !== null &&
      isSameGrandBattleSource(source, grandBattleCandidateSource) &&
      grandBattleParticipantLoadState.status !== "error"
    ) {
      return;
    }

    const requestSeq = grandBattleParticipantRequestSeqRef.current + 1;
    grandBattleParticipantRequestSeqRef.current = requestSeq;
    setGrandBattleCandidateSource(source);
    setGrandBattleParticipantLoadState({ status: "loading" });
    if (grandBattleSnapshotLoadState.status !== "success") {
      setGrandBattleSnapshotLoadState({ status: "idle" });
    }
    setSelectedGrandBattleGuildId("");
    stopGrandBattleRealtime("grand battle candidate changed", { nextState: "idle" });

    try {
      const participants = await loadGrandBattleParticipants(source);

      if (grandBattleParticipantRequestSeqRef.current === requestSeq) {
        setGrandBattleParticipantCandidates(participants);
        setGrandBattleParticipantLoadState({ status: "success", data: participants });
      }
    } catch (error) {
      if (grandBattleParticipantRequestSeqRef.current === requestSeq) {
        setGrandBattleParticipantLoadState({
          status: "error",
          error: error instanceof Error ? error : new Error("参加ギルド候補の取得に失敗しました。")
        });
      }
    }
  }

  function handleGrandBattleApplySource() {
    if (grandBattleCandidateSource !== null && grandBattleParticipantLoadState.status === "success") {
      setGrandBattleAppliedSource(grandBattleCandidateSource);
      setSelectedGrandBattleGuildId("");
      setKoMonitorRefreshKey((currentKey) => currentKey + 1);
      void loadGrandBattleSnapshotForSource(grandBattleCandidateSource);
    }
  }

  async function loadGrandBattleSnapshotForSource(source: GrandBattleResolvedSource) {
    stopGrandBattleRealtime("grand battle snapshot reload", { nextState: "idle" });
    const requestSeq = grandBattleSnapshotRequestSeqRef.current + 1;
    grandBattleSnapshotRequestSeqRef.current = requestSeq;
    if (grandBattleSnapshotLoadState.status !== "success") {
      setGrandBattleSnapshotLoadState({ status: "loading" });
    }

    try {
      const snapshot = await loadGrandBattleLatestSnapshot(source);

      if (grandBattleSnapshotRequestSeqRef.current === requestSeq) {
        setGrandBattleSnapshotLoadState({ status: "success", data: snapshot });
        if (isAutoUpdateEnabled) {
          await startGrandBattleRealtime(snapshot);
        }
      }
    } catch (error) {
      if (grandBattleSnapshotRequestSeqRef.current === requestSeq && grandBattleSnapshotLoadState.status !== "success") {
        setGrandBattleSnapshotLoadState({
          status: "error",
          error: error instanceof Error ? error : new Error("GrandBattle snapshotの取得に失敗しました。")
        });
      }
    }
  }

  async function startGrandBattleRealtime(snapshot: GrandBattleSnapshot) {
    stopGrandBattleRealtime("grand battle realtime restart", { nextState: "idle" });

    const client = runtimeService.createRealtimeClient();
    const removeRealtimeListener = client.addEventListener((event) => {
      if (event.type === "stateChanged") {
        setGrandBattleRealtimeState(event.state);
      }

      if (event.type === "error") {
        setGrandBattleRealtimeState({ status: "error", error: event.error });
      }
    });
    const runtime = new GrandBattleRealtimeSnapshotRuntime({
      client,
      onSnapshotUpdated: (snapshot) => {
        setGrandBattleSnapshotLoadState({ status: "success", data: snapshot });
      },
      onError: (error) => {
        setGrandBattleRealtimeState({ status: "error", error });
      }
    });

    removeGrandBattleRealtimeListenerRef.current = removeRealtimeListener;
    grandBattleRuntimeRef.current = runtime;

    try {
      await runtime.start(snapshot);
    } catch (error) {
      setGrandBattleRealtimeState({
        status: "error",
        error: error instanceof Error ? error : new Error("GrandBattle realtime start failed")
      });
    }
  }

  function stopGrandBattleRealtime(reason: string, options: { readonly nextState?: "idle" } = {}) {
    grandBattleRuntimeRef.current?.dispose(reason);
    grandBattleRuntimeRef.current = null;
    removeGrandBattleRealtimeListenerRef.current?.();
    removeGrandBattleRealtimeListenerRef.current = null;

    if (options.nextState === "idle") {
      setGrandBattleRealtimeState({ status: "idle" });
      return;
    }

    if (grandBattleRealtimeState.status !== "idle" && grandBattleRealtimeState.status !== "disconnected") {
      setGrandBattleRealtimeState({ status: "disconnected", reason });
    }
  }

  function handleGuildChange(nextGuildId: string) {
    if (!appCapabilities.localSettings.editable) {
      return;
    }

    setSelectedGuildId(nextGuildId);
    saveViewSettings({ selectedGuildId: nextGuildId });
  }

  async function loadOwnedGuildCandidatesForWorld(profileWorld: number | null) {
    const nextGvgWorldId = createWorldIdFromWorldNumber(profileWorld);
    const requestSeq = ownedGuildCandidateRequestSeqRef.current + 1;
    ownedGuildCandidateRequestSeqRef.current = requestSeq;

    if (nextGvgWorldId === null) {
      setOwnedGuildCandidates([]);
      setOwnedGuildCandidateLoadState({ status: "idle" });
      return;
    }

    setOwnedGuildCandidateLoadState({ status: "loading" });

    try {
      const snapshot = await runtimeService.loadSnapshot(nextGvgWorldId);
      const candidates = createGuildBattleGuildCandidates(snapshot);

      if (ownedGuildCandidateRequestSeqRef.current === requestSeq) {
        setOwnedGuildCandidates(candidates);
        setOwnedGuildCandidateLoadState({ status: "success", data: candidates });
      }
    } catch (error) {
      if (ownedGuildCandidateRequestSeqRef.current === requestSeq) {
        setOwnedGuildCandidates([]);
        setOwnedGuildCandidateLoadState({
          status: "error",
          error: error instanceof Error ? error : new Error("owned guild candidates load failed")
        });
      }
    }
  }

  function handleOwnedGuildWorldChange(nextWorldId: string) {
    setSelectedOwnedGuildWorldId(nextWorldId);
    setSelectedOwnedGuildId("");
    setSelectedOwnedGuildName(null);
    setOwnedGuildCandidates([]);
    setOwnedGuildCandidateLoadState({ status: "idle" });
  }

  function handleOwnedGuildWorldBlur() {
    const validationError = validateOwnedGuildWorldInput(selectedOwnedGuildWorldId);

    if (validationError !== null) {
      setOwnedGuildWorldError(validationError);
      setOwnedGuildCandidates([]);
      setOwnedGuildCandidateLoadState({ status: "idle" });
      return;
    }

    const nextWorldNumber = createWorldNumberFromWorldInput(selectedOwnedGuildWorldId);
    setOwnedGuildWorldError(null);
    void loadOwnedGuildCandidatesForWorld(nextWorldNumber);
  }

  function handleOwnedGuildChange(nextGuildId: GvgGuildId | "") {
    const nextGuildName = ownedGuildCandidates.find((candidate) => candidate.guildId === nextGuildId)?.guildName ?? null;
    setSelectedOwnedGuildId(nextGuildId);
    setSelectedOwnedGuildName(nextGuildName);
  }

  function saveViewSettings(settings: {
    readonly shared?: BattleMonitorSharedState;
    readonly selectedGuildId?: string;
  }) {
    if (!appCapabilities.localSettings.persistable) {
      return;
    }

    saveBattleMonitorViewSettings({
      shared: settings.shared ?? shared,
      guildBattle: {
        selectedGuildId: settings.selectedGuildId ?? selectedGuildId
      }
    });
  }

  function handleModeChange(nextMode: BattleMonitorMode) {
    if (!modePermissions.canEditBattleState) {
      return;
    }

    if (activeMode === nextMode) {
      return;
    }

    if (activeMode === "guildBattle" && nextMode === "grandBattle") {
      stopRealtime("mode changed to grand battle", { nextState: "idle" });
    }

    if (activeMode === "grandBattle" && nextMode === "guildBattle") {
      stopGrandBattleRealtime("mode changed to guild battle", { nextState: "idle" });
    }

    setActiveMode(nextMode);

    if (nextMode === "guildBattle") {
      if (isAutoUpdateEnabled && loadState.status === "success" && loadState.data.worldId === worldId) {
        void startRealtime(loadState.data);
      }
      return;
    }

    if (nextMode === "grandBattle") {
      const nextDraftSource = {
        ...grandBattleDraftSource,
        worldInput: shared.worldInput,
        worldNumber: shared.worldNumber
      };
      setIsSettingsDialogOpen(false);
      setGrandBattleDraftSource(nextDraftSource);

      if (nextDraftSource.worldNumber !== null) {
        void loadGrandBattleParticipantsForSource({
          ...nextDraftSource,
          worldNumber: nextDraftSource.worldNumber
        });
      }

      if (
        isAutoUpdateEnabled &&
        nextDraftSource.worldNumber !== null &&
        grandBattleSnapshotLoadState.status === "success" &&
        isSameGrandBattleSource(grandBattleSnapshotLoadState.data.source, {
          ...nextDraftSource,
          worldNumber: nextDraftSource.worldNumber
        })
      ) {
        void startGrandBattleRealtime(grandBattleSnapshotLoadState.data);
      }
    }
  }

  const canApplyGrandBattleSource =
    grandBattleCandidateSource !== null &&
    grandBattleParticipantLoadState.status === "success" &&
    !isSameGrandBattleSource(grandBattleCandidateSource, grandBattleAppliedSource);
  const ownedGuildDraftProfile = {
    world: createWorldNumberFromWorldInput(selectedOwnedGuildWorldId),
    guildId: selectedOwnedGuildId || null,
    guildName: selectedOwnedGuildName
  };
  const ownedGuildDraftExternal: SettingsDraftExternal | undefined =
    appCapabilities.ownedGuildProfile.visible && ownedGuildProfilePersistence !== undefined
      ? {
          hasValidationError: ownedGuildWorldError !== null,
          isDirty: !isSameOwnedGuildProfile(ownedGuildDraftProfile, ownedGuildProfilePersistence.profile),
          onCancel: () => {
            const profile = ownedGuildProfilePersistence.profile;
            setSelectedOwnedGuildWorldId(profile?.world === null || profile === null ? "" : String(profile.world));
            setOwnedGuildWorldError(null);
            setSelectedOwnedGuildId((profile?.guildId ?? "") as GvgGuildId | "");
            setSelectedOwnedGuildName(profile?.guildName ?? null);
            void loadOwnedGuildCandidatesForWorld(profile?.world ?? null);
          },
          onSave: () => {
            if (ownedGuildProfilePersistence.onSave !== undefined) {
              const validationError = validateOwnedGuildWorldInput(selectedOwnedGuildWorldId);

              if (validationError !== null) {
                setOwnedGuildWorldError(validationError);
                return Promise.resolve(false);
              }

              return ownedGuildProfilePersistence.onSave(ownedGuildDraftProfile);
            }

            const validationError = validateOwnedGuildWorldInput(selectedOwnedGuildWorldId);

            if (validationError !== null) {
              setOwnedGuildWorldError(validationError);
              return Promise.resolve(false);
            }

            ownedGuildProfilePersistence.onChange(ownedGuildDraftProfile);
            return Promise.resolve(true);
          }
        }
      : undefined;
  const combinedSettingsDraftExternal = combineSettingsDraftExternals(settingsDraftExternal, ownedGuildDraftExternal);

  return (
    <main className="app-shell" data-mode={activeMode === "guildBattle" ? "guild-battle" : "grand-battle"}>
      <section className="placeholder monitor-panel" aria-labelledby="app-title">
        <div className="monitor-header">
          <h1 className="placeholder__title" id="app-title">
            {activeMode === "guildBattle" ? "Guild Battle Monitor" : "Grand Battle Monitor"}
          </h1>
          <div className="monitor-header__actions">
            {headerActions}
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
        </div>
        {afterHeader}

        <div className="mode-tabs" aria-label="Battle Monitor mode">
          <button
            className={`mode-tabs__button${activeMode === "guildBattle" ? " mode-tabs__button--active" : ""}`}
            disabled={!modePermissions.canEditBattleState}
            type="button"
            aria-pressed={activeMode === "guildBattle"}
            onClick={() => handleModeChange("guildBattle")}
          >
            Guild Battle
          </button>
          <button
            className={`mode-tabs__button${activeMode === "grandBattle" ? " mode-tabs__button--active" : ""}`}
            disabled={!modePermissions.canEditBattleState}
            type="button"
            aria-pressed={activeMode === "grandBattle"}
            onClick={() => handleModeChange("grandBattle")}
          >
            Grand Battle
          </button>
        </div>

        {isSettingsDialogOpen ? (
          <SettingsDialog
            alertThresholdError={alertThresholdError}
            canEditAlertSettings={modePermissions.canEditAlertSettings}
            canEditBattleState={modePermissions.canEditBattleState}
            canEditViewSettings={appCapabilities.localSettings.editable}
            castleSortMode={castleSortMode}
            editableAlertThresholds={editableAlertThresholds}
            isAutoUpdateEnabled={isAutoUpdateEnabled}
            isRealtimeActive={activeMode === "guildBattle" ? isRealtimeActive : isGrandBattleRealtimeActive}
            isTestModeEnabled={isTestModeEnabled}
            settingsDraftExternal={combinedSettingsDraftExternal}
            notificationSettings={appCapabilities.notifications.visible ? notificationSettings : undefined}
            ownedGuildSettings={
              appCapabilities.ownedGuildProfile.visible && ownedGuildProfilePersistence !== undefined ? (
                <OwnedGuildSettings
                  guildCandidates={ownedGuildCandidates}
                  error={ownedGuildWorldError ?? ownedGuildProfilePersistence.error ?? null}
                  isLoading={
                    ownedGuildProfilePersistence.isLoading ||
                    ownedGuildCandidateLoadState.status === "loading"
                  }
                  selectedGuildId={selectedOwnedGuildId}
                  selectedGuildName={selectedOwnedGuildName}
                  selectedWorldId={selectedOwnedGuildWorldId}
                  shareSettings={appCapabilities.shareUrls.visible ? shareSettings : undefined}
                  showSignInMessage={!ownedGuildProfilePersistence.isSignedIn}
                  onGuildChange={handleOwnedGuildChange}
                  onWorldBlur={handleOwnedGuildWorldBlur}
                  onWorldChange={handleOwnedGuildWorldChange}
                />
              ) : undefined
            }
            showAlertSettings={modePermissions.showAlertSettings}
            showGuildBattleOnlySettings={activeMode === "guildBattle"}
            onAlertThresholdChange={handleAlertThresholdChange}
            onClose={() => setIsSettingsDialogOpen(false)}
            onTestModeChange={setIsTestModeEnabled}
            onViewSettingsSave={handleViewSettingsSave}
          />
        ) : null}

        {activeMode === "guildBattle" ? (
          <>
        {sharedGuild === undefined || sharedGuild === null ? (
          <form
            className="startup-panel"
            aria-label="起動"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRefresh();
            }}
          >
            <label className="field">
              <span className="field__label">world</span>
              <input
                className="field__input field__input--world"
                type="text"
                value={world}
                onChange={(event) => handleWorldChange(event.target.value)}
                disabled={isLoading}
                inputMode="numeric"
              />
            </label>
            <button className="load-form__button" type="submit" disabled={isLoading || world.trim().length === 0}>
              更新
            </button>
          </form>
        ) : null}

        <KoVictimSummaryPanel state={koMonitorState} />
        <SnapshotStatus
          alertThresholds={alertThresholds}
          canEdit={appCapabilities.localSettings.editable}
          castleSortMode={castleSortMode}
          guildCandidates={guildCandidates}
          guildSelectValue={guildSelectValue}
          isAutoUpdateEnabled={isAutoUpdateEnabled}
          isTestModeEnabled={modePermissions.canEditBattleState && IS_DEV && isTestModeEnabled}
          loadState={loadState}
          realtimeState={realtimeState}
          selectedGuildId={guildSelectValue}
          showDevDetails={IS_DEV}
          onGuildChange={handleGuildChange}
          onOpenSettings={() => setIsSettingsDialogOpen(true)}
          onTestModeDefenseIncrease={(castleId, amount) => testModeClientRef.current?.increaseDefense(castleId, amount)}
          onTestModeAttackIncrease={(castleId, amount) => testModeClientRef.current?.increaseAttack(castleId, amount)}
          onTestModeRevive={(castleId) => testModeClientRef.current?.reviveCastle(castleId)}
        />
          </>
        ) : (
          <GrandBattleSetupPanel
            canApplySource={canApplyGrandBattleSource}
            draftSource={grandBattleDraftSource}
            participantCandidates={grandBattleParticipantCandidates}
            participantLoadState={grandBattleParticipantLoadState}
            selectedGuildId={selectedGrandBattleGuildId}
            snapshotLoadState={grandBattleSnapshotLoadState}
            koMonitorState={koMonitorState}
            alertThresholds={alertThresholds}
            isAutoUpdateEnabled={isAutoUpdateEnabled}
            realtimeState={grandBattleRealtimeState}
            onApplySource={handleGrandBattleApplySource}
            onBlockChange={handleGrandBattleBlockChange}
            onClassChange={handleGrandBattleClassChange}
            onGuildChange={setSelectedGrandBattleGuildId}
            onOpenSettings={() => setIsSettingsDialogOpen(true)}
            onServerChange={handleGrandBattleServerChange}
            onWorldCommit={handleGrandBattleWorldCommit}
            onWorldInputChange={handleGrandBattleWorldInputChange}
          />
        )}
      </section>
    </main>
  );
}

function useKoMonitorLoadState({
  enabled,
  loadKoObserverRunMeta,
  loadKoGuildKoTotals,
  now,
  refreshKey,
  subscribeKoGuildKoTotals
}: {
  readonly enabled: boolean;
  readonly loadKoObserverRunMeta?: () => Promise<KoObserverRunMeta | null>;
  readonly loadKoGuildKoTotals?: () => Promise<readonly KoGuildKoTotal[]>;
  readonly now: () => Date;
  readonly refreshKey: number;
  readonly subscribeKoGuildKoTotals?: KoGuildKoTotalsSubscriber;
}): KoMonitorLoadState {
  const [state, setState] = useState<KoMonitorLoadState>({ status: "idle" });
  const [boundaryRefreshKey, setBoundaryRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const currentTime = now();
    const boundary = getNextKoObserverReadBoundary(currentTime);

    if (boundary === null) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setBoundaryRefreshKey((currentKey) => currentKey + 1),
      Math.min(Math.max(0, boundary.getTime() - currentTime.getTime()), MAX_TIMEOUT_MS)
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [boundaryRefreshKey, enabled, now]);

  useEffect(() => {
    if (
      !enabled ||
      loadKoObserverRunMeta === undefined ||
      loadKoGuildKoTotals === undefined ||
      subscribeKoGuildKoTotals === undefined
    ) {
      setState({ status: "idle" });
      return;
    }

    const loadMeta = loadKoObserverRunMeta;
    const loadTotals = loadKoGuildKoTotals;
    const subscribeTotals = subscribeKoGuildKoTotals;
    let isDisposed = false;
    let unsubscribe: (() => void) | null = null;
    setState({ status: "loading" });

    async function load() {
      const currentTime = now();
      const meta = await loadMeta();
      const isObserverStarted = isKoObserverStartedForToday(meta?.lastStartedAt ?? null, currentTime);

      if (shouldUseKoObserverRealtime(currentTime)) {
        unsubscribe = subscribeTotals(
          (rows) => {
            if (!isDisposed) {
              setState({ status: "success", isObserverStarted, rows });
            }
          },
          (error) => {
            if (!isDisposed) {
              setState((currentState) => ({
                status: "error",
                error,
                rows:
                  currentState.status === "success" || currentState.status === "error"
                    ? currentState.rows
                    : []
              }));
            }
          }
        );
        return;
      }

      const rows = await loadTotals();

      if (!isDisposed) {
        setState({ status: "success", isObserverStarted, rows });
      }
    }

    void load().catch((error) => {
      if (!isDisposed) {
        setState({
          status: "error",
          error: error instanceof Error ? error : new Error("KO集計データを取得できませんでした。"),
          rows: []
        });
      }
    });

    return () => {
      isDisposed = true;
      unsubscribe?.();
    };
  }, [
    boundaryRefreshKey,
    enabled,
    loadKoGuildKoTotals,
    loadKoObserverRunMeta,
    now,
    refreshKey,
    subscribeKoGuildKoTotals
  ]);

  return state;
}

function createInitialGrandBattleSource(shared: BattleMonitorSharedState): GrandBattleSource {
  return {
    serverId: GRAND_BATTLE_DEFAULT_SERVER_ID,
    worldInput: shared.worldInput,
    worldNumber: shared.worldNumber,
    classId: GRAND_BATTLE_DEFAULT_CLASS_ID,
    blockId: GRAND_BATTLE_DEFAULT_BLOCK_ID
  };
}

function isSameGrandBattleSource(
  left: GrandBattleResolvedSource | null,
  right: GrandBattleResolvedSource | null
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.serverId === right.serverId &&
    left.worldNumber === right.worldNumber &&
    left.classId === right.classId &&
    left.blockId === right.blockId
  );
}

function useCurrentTime(): Date {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timerId = setInterval(() => setCurrentTime(new Date()), CURRENT_TIME_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  return currentTime;
}

function GrandBattleSetupPanel({
  alertThresholds,
  canApplySource,
  draftSource,
  isAutoUpdateEnabled,
  koMonitorState,
  participantCandidates,
  participantLoadState,
  realtimeState,
  selectedGuildId,
  snapshotLoadState,
  onApplySource,
  onBlockChange,
  onClassChange,
  onGuildChange,
  onOpenSettings,
  onServerChange,
  onWorldCommit,
  onWorldInputChange
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly canApplySource: boolean;
  readonly draftSource: GrandBattleSource;
  readonly isAutoUpdateEnabled: boolean;
  readonly koMonitorState: KoMonitorLoadState;
  readonly participantCandidates: readonly GrandBattleParticipantGuildCandidate[];
  readonly participantLoadState: AsyncLoadState<readonly GrandBattleParticipantGuildCandidate[]>;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly selectedGuildId: GvgGuildId | "";
  readonly snapshotLoadState: AsyncLoadState<GrandBattleSnapshot>;
  readonly onApplySource: () => void;
  readonly onBlockChange: (blockId: GrandBattleBlockId) => void;
  readonly onClassChange: (classId: GrandBattleClassId) => void;
  readonly onGuildChange: (guildId: GvgGuildId | "") => void;
  readonly onOpenSettings: () => void;
  readonly onServerChange: (serverId: GrandBattleServerId) => void;
  readonly onWorldCommit: () => void;
  readonly onWorldInputChange: (worldInput: string) => void;
}) {
  return (
    <section className="grand-battle-setup" aria-labelledby="grand-battle-setup-title">
      <h2 className="grand-battle-setup__title" id="grand-battle-setup-title">
        監視条件
      </h2>
      <div className="grand-battle-setup__form" aria-label="GrandBattle監視条件">
        <label className="field">
          <span className="field__label">サーバー</span>
          <select
            className="field__input field__input--wide"
            value={draftSource.serverId}
            onChange={(event) => onServerChange(event.target.value as GrandBattleServerId)}
          >
            {GRAND_BATTLE_SERVER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">ワールド</span>
          <input
            className="field__input field__input--world"
            inputMode="numeric"
            type="text"
            value={draftSource.worldInput}
            onBlur={onWorldCommit}
            onChange={(event) => onWorldInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Tab") {
                onWorldCommit();
              }
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">クラス</span>
          <select
            className="field__input field__input--wide"
            value={draftSource.classId}
            onChange={(event) => onClassChange(Number(event.target.value) as GrandBattleClassId)}
          >
            {GRAND_BATTLE_CLASS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">ブロック</span>
          <select
            className="field__input field__input--wide"
            value={draftSource.blockId}
            onChange={(event) => onBlockChange(Number(event.target.value) as GrandBattleBlockId)}
          >
            {GRAND_BATTLE_BLOCK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grand-battle-participants" aria-live="polite">
        <h3 className="grand-battle-participants__title">参加ギルド</h3>
        <GrandBattleParticipantList candidates={participantCandidates} loadState={participantLoadState} />
      </div>

      <button
        className="load-form__button grand-battle-setup__apply"
        type="button"
        disabled={!canApplySource}
        onClick={onApplySource}
      >
        更新
      </button>

      <KoVictimSummaryPanel state={koMonitorState} />

      <GrandBattleSnapshotStatus
        alertThresholds={alertThresholds}
        isAutoUpdateEnabled={isAutoUpdateEnabled}
        participantCandidates={participantCandidates}
        realtimeState={realtimeState}
        selectedGuildId={selectedGuildId}
        snapshotLoadState={snapshotLoadState}
        onGuildChange={onGuildChange}
        onOpenSettings={onOpenSettings}
      />
    </section>
  );
}

function GrandBattleParticipantList({
  candidates,
  loadState
}: {
  readonly candidates: readonly GrandBattleParticipantGuildCandidate[];
  readonly loadState: AsyncLoadState<readonly GrandBattleParticipantGuildCandidate[]>;
}) {
  if (loadState.status === "idle") {
    return <p className="status-message grand-battle-participants__message">参加ギルド候補がありません。</p>;
  }

  if (loadState.status === "loading" && candidates.length === 0) {
    return <p className="status-message grand-battle-participants__message">参加ギルドを取得中です。</p>;
  }

  if (loadState.status === "error" && candidates.length === 0) {
    return (
      <p className="status-message status-message--error grand-battle-participants__message" role="alert">
        {loadState.error.message}
      </p>
    );
  }

  if (candidates.length === 0) {
    return <p className="status-message grand-battle-participants__message">参加ギルド候補がありません。</p>;
  }

  return (
    <>
      <div className="grand-battle-participants__grid">
        {candidates.map((guild) => (
          <div className="grand-battle-participants__guild" key={guild.guildId}>
            {guild.guildName}
          </div>
        ))}
      </div>
      {loadState.status === "loading" ? (
        <p className="status-message grand-battle-participants__message">参加ギルドを更新中です。</p>
      ) : null}
      {loadState.status === "error" ? (
        <p className="status-message status-message--error grand-battle-participants__message" role="alert">
          {loadState.error.message}
        </p>
      ) : null}
    </>
  );
}

function GrandBattleSnapshotStatus({
  alertThresholds,
  isAutoUpdateEnabled,
  participantCandidates,
  realtimeState,
  selectedGuildId,
  snapshotLoadState,
  onGuildChange,
  onOpenSettings
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly isAutoUpdateEnabled: boolean;
  readonly participantCandidates: readonly GrandBattleParticipantGuildCandidate[];
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly selectedGuildId: GvgGuildId | "";
  readonly snapshotLoadState: AsyncLoadState<GrandBattleSnapshot>;
  readonly onGuildChange: (guildId: GvgGuildId | "") => void;
  readonly onOpenSettings: () => void;
}) {
  if (snapshotLoadState.status === "idle") {
    return null;
  }

  if (snapshotLoadState.status === "loading") {
    return (
      <p className="status-message" aria-live="polite">
        取得中です。
      </p>
    );
  }

  if (snapshotLoadState.status === "error") {
    return (
      <p className="status-message status-message--error" role="alert">
        {snapshotLoadState.error.message}
      </p>
    );
  }

  return (
    <GrandBattleSnapshotSummary
      alertThresholds={alertThresholds}
      isAutoUpdateEnabled={isAutoUpdateEnabled}
      participantCandidates={participantCandidates}
      realtimeState={realtimeState}
      selectedGuildId={selectedGuildId}
      snapshot={snapshotLoadState.data}
      onGuildChange={onGuildChange}
      onOpenSettings={onOpenSettings}
    />
  );
}

function GrandBattleSnapshotSummary({
  alertThresholds,
  isAutoUpdateEnabled,
  participantCandidates,
  realtimeState,
  selectedGuildId,
  snapshot,
  onGuildChange,
  onOpenSettings
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly isAutoUpdateEnabled: boolean;
  readonly participantCandidates: readonly GrandBattleParticipantGuildCandidate[];
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly selectedGuildId: GvgGuildId | "";
  readonly snapshot: GrandBattleSnapshot;
  readonly onGuildChange: (guildId: GvgGuildId | "") => void;
  readonly onOpenSettings: () => void;
}) {
  const currentTime = useCurrentTime();
  const guildCandidates = useMemo(
    () => createGrandBattleGuildCandidates(participantCandidates, snapshot),
    [participantCandidates, snapshot]
  );
  const selectedGuildCandidate = guildCandidates.find((candidate) => candidate.guildId === selectedGuildId);
  const guildSelectValue = selectedGuildCandidate?.guildId ?? "";
  const viewModels = useMemo(
    () => createGrandBattleCastleListViewModels(snapshot, guildSelectValue, alertThresholds, currentTime),
    [alertThresholds, currentTime, guildSelectValue, snapshot]
  );

  return (
    <section className="snapshot-summary" aria-labelledby="grand-battle-snapshot-title">
      <div className="snapshot-summary__header">
        <h2 className="snapshot-summary__title" id="grand-battle-snapshot-title">
          拠点監視
        </h2>
        <ConnectionIndicator
          isAutoUpdateEnabled={isAutoUpdateEnabled}
          state={realtimeState}
          onClick={onOpenSettings}
        />
        <span className="snapshot-summary__captured-at">更新: {snapshot.capturedAt}</span>
      </div>
      <BattleMonitorGuildSelect
        candidates={guildCandidates}
        disabled={false}
        value={guildSelectValue}
        onChange={onGuildChange}
      />
      <BattleMonitorCastleList
        capturedAt={snapshot.capturedAt}
        isTestModeEnabled={false}
        showDevDetails={false}
        showOwnerGuild={guildSelectValue.length === 0}
        viewModels={viewModels}
        onTestModeDefenseIncrease={noopGrandBattleCastleAction}
        onTestModeAttackIncrease={noopGrandBattleCastleAction}
        onTestModeRevive={noopGrandBattleReviveAction}
      />
    </section>
  );
}

function noopGrandBattleCastleAction(_castleId: GvgCastleId, _amount: number) {
}

function noopGrandBattleReviveAction(_castleId: GvgCastleId) {
}

function createWorldIdFromWorldNumber(worldNumber: number | null): GvgWorldId | null {
  return worldNumber === null ? null : (String(WORLD_ID_BASE + worldNumber) as GvgWorldId);
}

function createWorldNumberFromWorldInput(world: string): number | null {
  const trimmedWorld = world.trim();

  if (trimmedWorld.length === 0 || !/^\d+$/.test(trimmedWorld)) {
    return null;
  }

  const worldNumber = Number(trimmedWorld);

  if (!Number.isSafeInteger(worldNumber) || worldNumber <= 0) {
    return null;
  }

  return worldNumber;
}

function validateOwnedGuildWorldInput(world: string): string | null {
  const trimmedWorld = world.trim();

  if (trimmedWorld.length === 0) {
    return null;
  }

  return createWorldNumberFromWorldInput(world) === null ? "ワールドは数字で入力してください。" : null;
}

export function confirmDiscardDraft(): boolean {
  return window.confirm("未保存の変更があります。変更を破棄して閉じますか？");
}

function blurInputOnEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  event.currentTarget.blur();
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
  canEditAlertSettings,
  canEditBattleState,
  canEditViewSettings,
  castleSortMode,
  editableAlertThresholds,
  isAutoUpdateEnabled,
  isRealtimeActive,
  isTestModeEnabled,
  settingsDraftExternal,
  notificationSettings,
  ownedGuildSettings,
  showAlertSettings,
  showGuildBattleOnlySettings,
  onAlertThresholdChange,
  onClose,
  onTestModeChange,
  onViewSettingsSave
}: {
  readonly alertThresholdError: string | null;
  readonly canEditAlertSettings: boolean;
  readonly canEditBattleState: boolean;
  readonly canEditViewSettings: boolean;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly editableAlertThresholds: EditableGuildBattleAlertThresholds;
  readonly isAutoUpdateEnabled: boolean;
  readonly isRealtimeActive: boolean;
  readonly isTestModeEnabled: boolean;
  readonly settingsDraftExternal?: SettingsDraftExternal;
  readonly notificationSettings?: ReactNode;
  readonly ownedGuildSettings?: ReactNode;
  readonly showAlertSettings: boolean;
  readonly showGuildBattleOnlySettings: boolean;
  readonly onAlertThresholdChange: (thresholds: EditableGuildBattleAlertThresholds) => boolean;
  readonly onClose: () => void;
  readonly onTestModeChange: (checked: boolean) => void;
  readonly onViewSettingsSave: (settings: {
    readonly autoUpdate?: boolean;
    readonly sortMode?: GuildBattleCastleListSortMode;
  }) => Promise<void>;
}) {
  const [draftAlertThresholds, setDraftAlertThresholds] = useState(editableAlertThresholds);
  const [draftAlertThresholdError, setDraftAlertThresholdError] = useState(alertThresholdError);
  const [draftSortMode, setDraftSortMode] = useState(castleSortMode);
  const [draftAutoUpdate, setDraftAutoUpdate] = useState(isAutoUpdateEnabled);
  const [draftTestMode, setDraftTestMode] = useState(isTestModeEnabled);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isAlertDirty = !isSameEditableAlertThresholds(draftAlertThresholds, editableAlertThresholds);
  const isSortDirty = draftSortMode !== castleSortMode;
  const isAutoUpdateDirty = draftAutoUpdate !== isAutoUpdateEnabled;
  const isTestModeDirty = draftTestMode !== isTestModeEnabled;
  const isDirty =
    isAlertDirty || isSortDirty || isAutoUpdateDirty || isTestModeDirty || (settingsDraftExternal?.isDirty ?? false);
  const hasValidationError = draftAlertThresholdError !== null || (settingsDraftExternal?.hasValidationError ?? false);

  function updateDraftAlertThresholds(nextThresholds: EditableGuildBattleAlertThresholds): boolean {
    const validation = validateGuildBattleAlertThresholds(nextThresholds);
    setSaveError(null);

    if (!validation.valid) {
      setDraftAlertThresholdError(validation.error);
      return false;
    }

    setDraftAlertThresholdError(null);
    setDraftAlertThresholds(validation.thresholds);
    return true;
  }

  function resetDraftAlertThresholds() {
    setDraftAlertThresholds(getDefaultEditableGuildBattleAlertThresholds());
    setDraftAlertThresholdError(null);
    setSaveError(null);
  }

  async function handleSave() {
    setSaveError(null);

    if (!isDirty || hasValidationError) {
      return;
    }

    if (showAlertSettings && isAlertDirty && !onAlertThresholdChange(draftAlertThresholds)) {
      return;
    }

    if (canEditViewSettings && (isSortDirty || isAutoUpdateDirty)) {
      await onViewSettingsSave({
        autoUpdate: isAutoUpdateDirty ? draftAutoUpdate : undefined,
        sortMode: showGuildBattleOnlySettings && isSortDirty ? draftSortMode : undefined
      });
    }

    if (IS_DEV && showGuildBattleOnlySettings && canEditBattleState && isTestModeDirty) {
      onTestModeChange(draftTestMode);
    }

    if (settingsDraftExternal?.isDirty && !(await settingsDraftExternal.onSave())) {
      setSaveError("設定の保存に失敗しました");
      return;
    }

    onClose();
  }

  function requestClose() {
    if (!isDirty) {
      onClose();
      return;
    }

    if (!confirmDiscardDraft()) {
      return;
    }

    settingsDraftExternal?.onCancel();
    onClose();
  }

  return (
    <div className="settings-dialog-backdrop" role="presentation" onMouseDown={requestClose}>
      <section
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="settings-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog__header">
          <h2 id="settings-dialog-title">設定</h2>
          <button className="settings-dialog__close" type="button" aria-label="設定を閉じる" onClick={requestClose}>
            ×
          </button>
        </div>
        <div className="settings-dialog__body">
          {showAlertSettings ? (
            <AlertThresholdSettings
              canEdit={canEditAlertSettings}
              error={draftAlertThresholdError}
              thresholds={draftAlertThresholds}
              onChange={updateDraftAlertThresholds}
              onReset={resetDraftAlertThresholds}
            />
          ) : null}
          {showGuildBattleOnlySettings ? (
          <section className="settings-section">
            <h3>並び順</h3>
            <label className="sort-toggle">
              <input
                type="checkbox"
                checked={draftSortMode === "alertLevel"}
                disabled={!canEditViewSettings}
                onChange={(event) => {
                  setSaveError(null);
                  setDraftSortMode(event.target.checked ? "alertLevel" : "castleId");
                }}
              />
              <span>危険度順で表示</span>
            </label>
          </section>
          ) : null}
          <section className="settings-section">
            <h3>自動更新</h3>
            <div className="auto-update-setting">
              <button
                className={`auto-update-toggle ${draftAutoUpdate ? "auto-update-toggle--on" : "auto-update-toggle--off"}`}
                disabled={!canEditViewSettings}
                type="button"
                onClick={() => {
                  setSaveError(null);
                  setDraftAutoUpdate((current) => !current);
                }}
              >
                {draftAutoUpdate ? "ON" : "OFF"}
              </button>
            </div>
          </section>
          {ownedGuildSettings !== undefined ? (
            <details className="settings-section owned-guild-settings">
              <summary>所属ギルド設定</summary>
              {ownedGuildSettings}
            </details>
          ) : null}
          {notificationSettings !== undefined ? (
            <details className="settings-section notification-settings">
              <summary>通知設定</summary>
              {notificationSettings}
            </details>
          ) : null}
          {IS_DEV && showGuildBattleOnlySettings && canEditBattleState ? (
            <section className="settings-section">
              <TestModeSettings
                checked={draftTestMode}
                disabled={!canEditBattleState || isRealtimeActive}
                onChange={(checked) => {
                  setSaveError(null);
                  setDraftTestMode(checked);
                }}
              />
            </section>
          ) : null}
          <section className="settings-dialog__actions">
            {saveError !== null ? <p className="firebase-message firebase-message--error">{saveError}</p> : null}
            <button
              className="load-form__button"
              disabled={!isDirty || hasValidationError}
              type="button"
              onClick={() => void handleSave()}
            >
              保存
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}

function isSameEditableAlertThresholds(
  left: EditableGuildBattleAlertThresholds,
  right: EditableGuildBattleAlertThresholds
): boolean {
  return (
    left.warningDefenseCount === right.warningDefenseCount &&
    left.dangerDefenseCount === right.dangerDefenseCount &&
    left.criticalDefenseCount === right.criticalDefenseCount
  );
}

function isSameOwnedGuildProfile(left: OwnedGuildProfile, right: OwnedGuildProfile | null): boolean {
  return (
    left.world === (right?.world ?? null) &&
    left.guildId === (right?.guildId ?? null) &&
    left.guildName === (right?.guildName ?? null)
  );
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
      const firstResult = first.isDirty ? await first.onSave() : true;
      const secondResult = second.isDirty ? await second.onSave() : true;
      return firstResult && secondResult;
    }
  };
}

function OwnedGuildSettings({
  error,
  guildCandidates,
  isLoading,
  selectedGuildId,
  selectedGuildName,
  selectedWorldId,
  shareSettings,
  showSignInMessage,
  onGuildChange,
  onWorldBlur,
  onWorldChange
}: {
  readonly error: string | null;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly isLoading: boolean;
  readonly selectedGuildId: GvgGuildId | "";
  readonly selectedGuildName: string | null;
  readonly selectedWorldId: string;
  readonly shareSettings?: ReactNode;
  readonly showSignInMessage: boolean;
  readonly onGuildChange: (guildId: GvgGuildId | "") => void;
  readonly onWorldBlur: () => void;
  readonly onWorldChange: (worldId: string) => void;
}) {
  return (
    <div className="owned-guild-settings__fields">
      <label className="field">
        <span className="field__label">ワールド</span>
        <input
          className="field__input"
          disabled={isLoading}
          inputMode="numeric"
          value={selectedWorldId}
          onBlur={onWorldBlur}
          onChange={(event) => onWorldChange(event.target.value)}
          onKeyDown={blurInputOnEnter}
        />
      </label>
      <label className="field">
        <span className="field__label">所属ギルド</span>
        <select
          className="field__input field__input--wide"
          disabled={isLoading}
          value={selectedGuildId}
          onChange={(event) => onGuildChange(event.target.value as GvgGuildId | "")}
        >
          <option value="">所属ギルドを選択してください</option>
          {selectedGuildId !== "" && !guildCandidates.some((candidate) => candidate.guildId === selectedGuildId) ? (
            <option value={selectedGuildId}>{selectedGuildName ?? selectedGuildId}</option>
          ) : null}
          {guildCandidates.map((candidate) => (
            <option key={candidate.guildId} value={candidate.guildId}>
              {candidate.guildName}
            </option>
          ))}
        </select>
      </label>
      {shareSettings !== undefined ? <div className="owned-guild-settings__share">{shareSettings}</div> : null}
      {error !== null ? <p className="firebase-message firebase-message--error">{error}</p> : null}
      {showSignInMessage ? <p className="firebase-message">ログインすると保存されます</p> : null}
    </div>
  );
}

function AlertThresholdSettings({
  canEdit,
  error,
  thresholds,
  onChange,
  onReset
}: {
  readonly canEdit: boolean;
  readonly error: string | null;
  readonly thresholds: EditableGuildBattleAlertThresholds;
  readonly onChange: (thresholds: EditableGuildBattleAlertThresholds) => boolean;
  readonly onReset: () => void;
}) {
  return (
    <section className="settings-section alert-settings">
      <h3>アラート設定</h3>
      <p className="alert-settings__help">防衛数が設定値未満になると色が変わります。</p>
      <div className="alert-settings__fields">
        <ThresholdInput
          disabled={!canEdit}
          label="注意"
          value={thresholds.warningDefenseCount}
          onCommit={(warningDefenseCount) => onChange({ ...thresholds, warningDefenseCount })}
        />
        <ThresholdInput
          disabled={!canEdit}
          label="危険"
          value={thresholds.dangerDefenseCount}
          onCommit={(dangerDefenseCount) => onChange({ ...thresholds, dangerDefenseCount })}
        />
        <ThresholdInput
          disabled={!canEdit}
          label="最優先"
          value={thresholds.criticalDefenseCount}
          onCommit={(criticalDefenseCount) => onChange({ ...thresholds, criticalDefenseCount })}
        />
        <button
          className="load-form__button load-form__button--secondary"
          disabled={!canEdit}
          type="button"
          onClick={onReset}
        >
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
  disabled,
  label,
  value,
  onCommit
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly value: number;
  readonly onCommit: (value: number) => boolean;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitDraftValue() {
    const trimmedValue = draftValue.trim();
    const nextValue = Number(trimmedValue);

    if (
      trimmedValue.length === 0 ||
      !Number.isSafeInteger(nextValue) ||
      nextValue < 0 ||
      !onCommit(nextValue)
    ) {
      setDraftValue(String(value));
      return;
    }

    setDraftValue(String(nextValue));
  }

  return (
    <label className="field threshold-field">
      <span className="field__label">{label}</span>
      <span className="threshold-field__control">
        <input
          className="field__input field__input--narrow"
          disabled={disabled}
          min="0"
          type="number"
          value={draftValue}
          onBlur={commitDraftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={blurInputOnEnter}
        />
      </span>
    </label>
  );
}

function SnapshotStatus({
  alertThresholds,
  canEdit,
  castleSortMode,
  guildCandidates,
  guildSelectValue,
  isAutoUpdateEnabled,
  isTestModeEnabled,
  loadState,
  realtimeState,
  selectedGuildId,
  showDevDetails,
  onGuildChange,
  onOpenSettings,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly canEdit: boolean;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly guildSelectValue: string;
  readonly isAutoUpdateEnabled: boolean;
  readonly isTestModeEnabled: boolean;
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly onGuildChange: (guildId: string) => void;
  readonly onOpenSettings: () => void;
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  if (loadState.status === "idle") {
    return null;
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
      canEdit={canEdit}
      castleSortMode={castleSortMode}
      guildCandidates={guildCandidates}
      guildSelectValue={guildSelectValue}
      isAutoUpdateEnabled={isAutoUpdateEnabled}
      isTestModeEnabled={isTestModeEnabled}
      realtimeState={realtimeState}
      selectedGuildId={selectedGuildId}
      showDevDetails={showDevDetails}
      snapshot={loadState.data}
      onGuildChange={onGuildChange}
      onOpenSettings={onOpenSettings}
      onTestModeDefenseIncrease={onTestModeDefenseIncrease}
      onTestModeAttackIncrease={onTestModeAttackIncrease}
      onTestModeRevive={onTestModeRevive}
    />
  );
}

function SnapshotSummary({
  alertThresholds,
  canEdit,
  castleSortMode,
  guildCandidates,
  guildSelectValue,
  isAutoUpdateEnabled,
  isTestModeEnabled,
  realtimeState,
  selectedGuildId,
  showDevDetails,
  snapshot,
  onGuildChange,
  onOpenSettings,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly alertThresholds: GuildBattleAlertThresholds;
  readonly canEdit: boolean;
  readonly castleSortMode: GuildBattleCastleListSortMode;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly guildSelectValue: string;
  readonly isAutoUpdateEnabled: boolean;
  readonly isTestModeEnabled: boolean;
  readonly realtimeState: GvgRealtimeConnectionState;
  readonly selectedGuildId: string;
  readonly showDevDetails: boolean;
  readonly snapshot: GvgSnapshot;
  readonly onGuildChange: (guildId: string) => void;
  readonly onOpenSettings: () => void;
  readonly onTestModeDefenseIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: GvgCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: GvgCastleId) => void;
}) {
  const currentTime = useCurrentTime();
  const castleDisplay = useMemo(() => {
    return createGuildBattleCastleDisplayViewModel(snapshot, {
      ownGuildId: selectedGuildId.length === 0 ? "" : (selectedGuildId as GvgGuildId),
      alertThresholds,
      currentTime
    });
  }, [alertThresholds, currentTime, selectedGuildId, snapshot]);
  const sortedCastles = useMemo(
    () => sortGuildBattleCastleViewModels(castleDisplay.castles, castleSortMode),
    [castleDisplay.castles, castleSortMode]
  );
  const shouldShowDevDetails = IS_DEV && showDevDetails;
  const shouldShowTestControls = IS_DEV && isTestModeEnabled;

  return (
    <section className="snapshot-summary" aria-labelledby="snapshot-title">
      <div className="snapshot-summary__header">
        <h2 className="snapshot-summary__title" id="snapshot-title">
          拠点監視
        </h2>
        <ConnectionIndicator
          isAutoUpdateEnabled={isAutoUpdateEnabled}
          state={realtimeState}
          onClick={onOpenSettings}
        />
      </div>
      <BattleMonitorGuildSelect
        candidates={guildCandidates}
        disabled={!canEdit}
        value={guildSelectValue}
        onChange={onGuildChange}
      />
      {shouldShowDevDetails ? <DevSnapshotDetails snapshot={snapshot} /> : null}
      <BattleMonitorCastleList
        capturedAt={snapshot.capturedAt}
        isTestModeEnabled={shouldShowTestControls}
        showOwnerGuild={castleDisplay.mode === "allCastles"}
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

function ConnectionIndicator({
  isAutoUpdateEnabled,
  state,
  onClick
}: {
  readonly isAutoUpdateEnabled: boolean;
  readonly state: GvgRealtimeConnectionState;
  readonly onClick: () => void;
}) {
  const indicatorState = getConnectionIndicatorState(isAutoUpdateEnabled, state);

  return (
    <button
      className={`connection-indicator connection-indicator--${indicatorState.tone}`}
      type="button"
      title={indicatorState.label}
      aria-label={`通信状態: ${indicatorState.label}`}
      onClick={onClick}
    >
      <span aria-hidden="true" className="connection-indicator__dot" />
    </button>
  );
}

function getConnectionIndicatorState(
  isAutoUpdateEnabled: boolean,
  state: GvgRealtimeConnectionState
): {
  readonly tone: "connected" | "reconnecting" | "disconnected" | "disabled";
  readonly label: string;
} {
  if (!isAutoUpdateEnabled) {
    return { tone: "disabled", label: "自動更新OFF" };
  }

  if (state.status === "connected") {
    return { tone: "connected", label: "接続中" };
  }

  if (state.status === "connecting" || state.status === "reconnecting") {
    return { tone: "reconnecting", label: "再接続中" };
  }

  return { tone: "disconnected", label: "切断中" };
}
