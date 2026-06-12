import { useCallback, useRef, useState } from "react";
import { GrandBattleRealtimeSnapshotRuntime } from "./realtimeSnapshotRuntime";
import type { GrandBattleSnapshot } from "./types";
import type { GvgRealtimeClient, GvgRealtimeConnectionState } from "../gvg/realtimeClientTypes";

interface UseGrandBattleRealtimeInput {
  readonly createRealtimeClient: () => GvgRealtimeClient;
  readonly onSnapshotUpdated: (snapshot: GrandBattleSnapshot) => void;
}

interface RealtimeStopOptions {
  readonly nextState?: "idle";
}

export function useGrandBattleRealtime({
  createRealtimeClient,
  onSnapshotUpdated
}: UseGrandBattleRealtimeInput) {
  const [state, setState] = useState<GvgRealtimeConnectionState>({ status: "idle" });
  const activeKeyRef = useRef<string | null>(null);
  const runtimeRef = useRef<GrandBattleRealtimeSnapshotRuntime | null>(null);
  const removeRealtimeListenerRef = useRef<(() => void) | null>(null);
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

  const start = useCallback(async (snapshot: GrandBattleSnapshot) => {
    const nextKey = createGrandBattleRealtimeKey(snapshot);

    if (activeKeyRef.current === nextKey && runtimeRef.current !== null) {
      return;
    }

    stop("grand battle realtime restart", { nextState: "idle" });

    const client = createRealtimeClient();
    const removeRealtimeListener = client.addEventListener((event) => {
      if (event.type === "stateChanged") {
        updateState(event.state);
      }

      if (event.type === "error") {
        updateState({ status: "error", error: event.error });
      }
    });
    const runtime = new GrandBattleRealtimeSnapshotRuntime({
      client,
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
        error: error instanceof Error ? error : new Error("GrandBattle realtime start failed")
      });
    }
  }, [createRealtimeClient, onSnapshotUpdated, stop, updateState]);

  return {
    state,
    start,
    stop
  };
}

function createGrandBattleRealtimeKey(snapshot: GrandBattleSnapshot): string {
  return [
    snapshot.worldGroupId,
    snapshot.source.serverId,
    snapshot.source.worldNumber,
    snapshot.source.classId,
    snapshot.source.blockId
  ].join(":");
}
