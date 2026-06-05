import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAppModePermissions, useAppRoute, type AppMode } from "../../app/appMode";
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

type BattleMonitorMode = "guildBattle" | "grandBattle";

type BattleMonitorSharedState = BattleMonitorSharedViewSettings;

interface GuildBattlePlaceholderProps {
  readonly afterHeader?: ReactNode;
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
  readonly loadGrandBattleParticipants?: typeof loadGrandBattleParticipantGuilds;
  readonly loadGrandBattleLatestSnapshot?: typeof loadGrandBattleSnapshot;
  readonly createRealtimeClient?: () => GvgRealtimeClient;
  readonly headerActions?: ReactNode;
  readonly modeOverride?: AppMode;
  readonly notificationSettings?: ReactNode;
  readonly ownedGuildProfilePersistence?: OwnedGuildProfilePersistence;
  readonly sharedGuild?: SharedGuildContext | null;
  readonly shareSettings?: ReactNode;
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
  createRealtimeClient = () => new BrowserGvgRealtimeClient(),
  headerActions,
  modeOverride,
  notificationSettings,
  ownedGuildProfilePersistence,
  sharedGuild,
  shareSettings
}: GuildBattlePlaceholderProps) {
  const appRoute = useAppRoute();
  const appMode = modeOverride ?? sharedGuild?.mode ?? appRoute?.mode ?? "owner";
  const modePermissions = getAppModePermissions(appMode);
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
  const [selectedOwnedGuildId, setSelectedOwnedGuildId] = useState<GvgGuildId | "">("");
  const [selectedOwnedGuildName, setSelectedOwnedGuildName] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });
  const [realtimeState, setRealtimeState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isTestModeEnabled, setIsTestModeEnabled] = useState(false);
  const [editableAlertThresholds, setEditableAlertThresholds] = useState<EditableGuildBattleAlertThresholds>(() =>
    loadGuildBattleAlertThresholds()
  );
  const [alertThresholdError, setAlertThresholdError] = useState<string | null>(null);
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);
  const testModeClientRef = useRef<TestModeGvgRealtimeClient | null>(null);
  const grandBattleRuntimeRef = useRef<GrandBattleRealtimeSnapshotRuntime | null>(null);
  const removeGrandBattleRealtimeListenerRef = useRef<(() => void) | null>(null);
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
    setSelectedOwnedGuildId((profile?.guildId ?? "") as GvgGuildId | "");
    setSelectedOwnedGuildName(profile?.guildName ?? null);
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

    await loadSnapshotForWorldId(worldId);
  }

  async function handleAutoUpdateToggle() {
    if (!modePermissions.canEditViewSettings) {
      return;
    }

    const nextEnabled = !isAutoUpdateEnabled;
    const nextShared = {
      ...shared,
      autoUpdate: nextEnabled
    };
    setShared(nextShared);
    saveViewSettings({ shared: nextShared });

    if (!nextEnabled) {
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
    saveGuildBattleAlertThresholds(validation.thresholds);
    return true;
  }

  function handleAlertThresholdReset() {
    if (!modePermissions.canEditAlertSettings) {
      return;
    }

    const defaultThresholds = getDefaultEditableGuildBattleAlertThresholds();
    setAlertThresholdError(null);
    setEditableAlertThresholds(defaultThresholds);
    saveGuildBattleAlertThresholds(defaultThresholds);
  }

  function handleWorldChange(nextWorld: string) {
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
    setGrandBattleDraftSource((currentSource) => ({
      ...currentSource,
      worldInput: nextWorld,
      worldNumber: createWorldNumberFromWorldInput(nextWorld)
    }));
  }

  function handleGrandBattleWorldCommit() {
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
    if (!modePermissions.canEditViewSettings) {
      return;
    }

    setSelectedGuildId(nextGuildId);
    saveViewSettings({ selectedGuildId: nextGuildId });
  }

  function handleOwnedGuildWorldChange(nextWorldId: string) {
    const nextWorldNumber = createWorldNumberFromWorldInput(nextWorldId);
    setSelectedOwnedGuildWorldId(nextWorldId);
    setSelectedOwnedGuildId("");
    setSelectedOwnedGuildName(null);
    ownedGuildProfilePersistence?.onChange({
      world: nextWorldNumber,
      guildId: null,
      guildName: null
    });

    const nextShared = {
      ...shared,
      worldInput: nextWorldId,
      worldNumber: nextWorldNumber
    };
    setShared(nextShared);
    saveViewSettings({ shared: nextShared });

    const nextGvgWorldId = createWorldIdFromWorldNumber(nextWorldNumber);
    if (nextGvgWorldId !== null) {
      void loadSnapshotForWorldId(nextGvgWorldId, { startRealtimeOnSuccess: false });
    }
  }

  function handleOwnedGuildChange(nextGuildId: GvgGuildId | "") {
    const nextGuildName = guildCandidates.find((candidate) => candidate.guildId === nextGuildId)?.guildName ?? null;
    setSelectedOwnedGuildId(nextGuildId);
    setSelectedOwnedGuildName(nextGuildName);
    ownedGuildProfilePersistence?.onChange({
      world: createWorldNumberFromWorldInput(selectedOwnedGuildWorldId),
      guildId: nextGuildId || null,
      guildName: nextGuildName
    });
  }

  function handleSortModeChange(nextSortMode: GuildBattleCastleListSortMode) {
    if (!modePermissions.canEditViewSettings) {
      return;
    }

    const nextShared = {
      ...shared,
      sortMode: nextSortMode
    };
    setShared(nextShared);
    saveViewSettings({ shared: nextShared });
  }

  function saveViewSettings(settings: {
    readonly shared?: BattleMonitorSharedState;
    readonly selectedGuildId?: string;
  }) {
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
            canEditViewSettings={modePermissions.canEditViewSettings}
            castleSortMode={castleSortMode}
            editableAlertThresholds={editableAlertThresholds}
            isAutoUpdateEnabled={isAutoUpdateEnabled}
            isRealtimeActive={activeMode === "guildBattle" ? isRealtimeActive : isGrandBattleRealtimeActive}
            isTestModeEnabled={isTestModeEnabled}
            notificationSettings={modePermissions.showNotificationSettings ? notificationSettings : undefined}
            ownedGuildSettings={
              modePermissions.showOwnedGuildSettings ? (
                <OwnedGuildSettings
                  guildCandidates={guildCandidates}
                  error={ownedGuildProfilePersistence?.error ?? null}
                  isLoading={ownedGuildProfilePersistence?.isLoading ?? false}
                  selectedGuildId={selectedOwnedGuildId}
                  selectedGuildName={selectedOwnedGuildName}
                  selectedWorldId={selectedOwnedGuildWorldId}
                  showSignInMessage={
                    ownedGuildProfilePersistence !== undefined && !ownedGuildProfilePersistence.isSignedIn
                  }
                  onGuildChange={handleOwnedGuildChange}
                  onWorldChange={handleOwnedGuildWorldChange}
                />
              ) : undefined
            }
            shareSettings={modePermissions.showShareSettings ? shareSettings : undefined}
            showAlertSettings={modePermissions.showAlertSettings}
            showGuildBattleOnlySettings={activeMode === "guildBattle"}
            onAlertThresholdChange={handleAlertThresholdChange}
            onAlertThresholdReset={handleAlertThresholdReset}
            onAutoUpdateToggle={handleAutoUpdateToggle}
            onClose={() => setIsSettingsDialogOpen(false)}
            onSortModeChange={handleSortModeChange}
            onTestModeChange={setIsTestModeEnabled}
          />
        ) : null}

        {activeMode === "guildBattle" ? (
          <>
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
              disabled={isLoading || (sharedGuild !== undefined && sharedGuild !== null)}
              inputMode="numeric"
            />
          </label>
          <button className="load-form__button" type="submit" disabled={isLoading || world.trim().length === 0}>
            更新
          </button>
        </form>

        <SnapshotStatus
          alertThresholds={alertThresholds}
          canEdit={modePermissions.canEditViewSettings}
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
  notificationSettings,
  ownedGuildSettings,
  shareSettings,
  showAlertSettings,
  showGuildBattleOnlySettings,
  onAlertThresholdChange,
  onAlertThresholdReset,
  onAutoUpdateToggle,
  onClose,
  onSortModeChange,
  onTestModeChange
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
  readonly notificationSettings?: ReactNode;
  readonly ownedGuildSettings?: ReactNode;
  readonly shareSettings?: ReactNode;
  readonly showAlertSettings: boolean;
  readonly showGuildBattleOnlySettings: boolean;
  readonly onAlertThresholdChange: (thresholds: EditableGuildBattleAlertThresholds) => boolean;
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
          {showAlertSettings ? (
            <AlertThresholdSettings
              canEdit={canEditAlertSettings}
              error={alertThresholdError}
              thresholds={editableAlertThresholds}
              onChange={onAlertThresholdChange}
              onReset={onAlertThresholdReset}
            />
          ) : null}
          {showGuildBattleOnlySettings ? (
          <section className="settings-section">
            <h3>並び順</h3>
            <label className="sort-toggle">
              <input
                type="checkbox"
                checked={castleSortMode === "alertLevel"}
                disabled={!canEditViewSettings}
                onChange={(event) => onSortModeChange(event.target.checked ? "alertLevel" : "castleId")}
              />
              <span>危険度順で表示</span>
            </label>
          </section>
          ) : null}
          <section className="settings-section">
            <h3>自動更新</h3>
            <div className="auto-update-setting">
              <button
                className={`auto-update-toggle ${isAutoUpdateEnabled ? "auto-update-toggle--on" : "auto-update-toggle--off"}`}
                disabled={!canEditViewSettings}
                type="button"
                onClick={onAutoUpdateToggle}
              >
                {isAutoUpdateEnabled ? "ON" : "OFF"}
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
          {shareSettings !== undefined ? (
            <details className="settings-section share-settings">
              <summary>共有URL設定</summary>
              {shareSettings}
            </details>
          ) : null}
          {IS_DEV && showGuildBattleOnlySettings && canEditBattleState ? (
            <section className="settings-section">
              <TestModeSettings
                checked={isTestModeEnabled}
                disabled={!canEditBattleState || isRealtimeActive}
                onChange={onTestModeChange}
              />
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function OwnedGuildSettings({
  error,
  guildCandidates,
  isLoading,
  selectedGuildId,
  selectedGuildName,
  selectedWorldId,
  showSignInMessage,
  onGuildChange,
  onWorldChange
}: {
  readonly error: string | null;
  readonly guildCandidates: readonly GuildBattleGuildCandidateViewModel[];
  readonly isLoading: boolean;
  readonly selectedGuildId: GvgGuildId | "";
  readonly selectedGuildName: string | null;
  readonly selectedWorldId: string;
  readonly showSignInMessage: boolean;
  readonly onGuildChange: (guildId: GvgGuildId | "") => void;
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
          onChange={(event) => onWorldChange(event.target.value)}
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
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraftValue();
            }

            if (event.key === "Tab") {
              commitDraftValue();
            }
          }}
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
