import { useCallback, useRef, useState } from "react";
import type {
  GvgRealtimeClient,
  GvgRealtimeConnectionState,
  GvgRealtimeSubscription
} from "../gvg/realtimeClientTypes";
import { GvgRealtimeSnapshotRuntime } from "../gvg/realtimeSnapshotRuntime";
import type { GvgCastleId, GvgSnapshot } from "../gvg/types";
import type { TestModeGvgRealtimeClient } from "./testModeRealtimeClient";

interface UseGuildBattleRealtimeInput {
  readonly createRealtimeClient: () => GvgRealtimeClient;
  readonly createSubscription: (snapshot: GvgSnapshot) => GvgRealtimeSubscription;
  readonly isTestModeEnabled: boolean;
  readonly onSnapshotUpdated: (snapshot: GvgSnapshot) => void;
}

interface RealtimeStopOptions {
  readonly nextState?: "idle";
}

export function useGuildBattleRealtime({
  createRealtimeClient,
  createSubscription,
  isTestModeEnabled,
  onSnapshotUpdated
}: UseGuildBattleRealtimeInput) {
  const [state, setState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const activeKeyRef = useRef<string | null>(null);
  const runtimeRef = useRef<GvgRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);
  const testModeClientRef = useRef<TestModeGvgRealtimeClient | null>(null);
  const stateRef = useRef<GvgRealtimeConnectionState>(state);

  const updateState = useCallback((nextState: GvgRealtimeConnectionState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const stop = useCallback((reason: string, options: RealtimeStopOptions = {}) => {
    const hadRuntime = runtimeRef.current !== null;

    runtimeRef.current?.dispose(reason);
    runtimeRef.current = null;
    activeKeyRef.current = null;
    testModeClientRef.current = null;
    removeRealtimeListenerRef.current?.();
    removeRealtimeListenerRef.current = null;

    if (options.nextState === "idle") {
      if (hadRuntime || stateRef.current.status !== "idle") {
        updateState({ status: "idle" });
      }
      return;
    }

    if (hadRuntime && stateRef.current.status !== "idle" && stateRef.current.status !== "disconnected") {
      updateState({ status: "disconnected", reason });
    }
  }, [updateState]);

  const start = useCallback(async (snapshot: GvgSnapshot) => {
    const nextKey = snapshot.worldId;

    if (activeKeyRef.current === nextKey && runtimeRef.current !== null) {
      return;
    }

    stop("realtime restart", { nextState: "idle" });

    const { client, testModeClient } = await createRealtimeClientForCurrentMode({
      createRealtimeClient,
      isTestModeEnabled,
      snapshot
    });
    testModeClientRef.current = testModeClient;

    const removeRealtimeListener = client.addEventListener((event) => {
      if (event.type === "stateChanged") {
        updateState(event.state);
      }

      if (event.type === "error") {
        updateState({ status: "error", error: event.error });
      }
    });
    const runtime = new GvgRealtimeSnapshotRuntime({
      client,
      createSubscription,
      onSnapshotUpdated,
      onError: (error) => {
        updateState({ status: "error", error });
      }
    });

    removeRealtimeListenerRef.current = removeRealtimeListener;
    runtimeRef.current = runtime;
    activeKeyRef.current = nextKey;

    try {
      await runtime.start(snapshot);
    } catch (error) {
      activeKeyRef.current = null;
      updateState({
        status: "error",
        error: error instanceof Error ? error : new Error("realtime start failed")
      });
    }
  }, [createRealtimeClient, createSubscription, isTestModeEnabled, onSnapshotUpdated, stop, updateState]);

  const increaseDefense = useCallback((castleId: GvgCastleId, amount: number) => {
    testModeClientRef.current?.increaseDefense(castleId, amount);
  }, []);
  const increaseAttack = useCallback((castleId: GvgCastleId, amount: number) => {
    testModeClientRef.current?.increaseAttack(castleId, amount);
  }, []);
  const reviveCastle = useCallback((castleId: GvgCastleId) => {
    testModeClientRef.current?.reviveCastle(castleId);
  }, []);

  return {
    state,
    start,
    stop,
    testMode: {
      increaseAttack,
      increaseDefense,
      reviveCastle
    }
  };
}

async function createRealtimeClientForCurrentMode({
  createRealtimeClient,
  isTestModeEnabled,
  snapshot
}: {
  readonly createRealtimeClient: () => GvgRealtimeClient;
  readonly isTestModeEnabled: boolean;
  readonly snapshot: GvgSnapshot;
}): Promise<{
  readonly client: GvgRealtimeClient;
  readonly testModeClient: TestModeGvgRealtimeClient | null;
}> {
  if (import.meta.env.DEV && isTestModeEnabled) {
    const { TestModeGvgRealtimeClient } = await import("./testModeRealtimeClient");
    const testModeClient = new TestModeGvgRealtimeClient();
    testModeClient.setSnapshot(snapshot);

    return { client: testModeClient, testModeClient };
  }

  return { client: createRealtimeClient(), testModeClient: null };
}
