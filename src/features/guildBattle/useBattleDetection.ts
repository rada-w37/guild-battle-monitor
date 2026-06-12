import { useEffect, useRef, useState } from "react";
import type { AppMode } from "../../app/appMode";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgSnapshot, GvgWorldId } from "../gvg/types";

const PAGES_BATTLE_DETECTION_WORLD_ID = "1001" as GvgWorldId;

export const BATTLE_DETECTION_LOADING_MESSAGE = "戦場情報を確認中...";
export const BATTLE_DETECTION_LOAD_ERROR_MESSAGE =
  "戦場情報を取得できませんでした。時間をおいて再読み込みしてください。";
export const FIREBASE_OWNER_PROFILE_REQUIRED_MESSAGE = "所属ギルド設定を確認してください";
export const FIREBASE_MONITOR_RESOLUTION_ERROR_MESSAGE = "監視条件を解決できませんでした";

export type BattleMonitorMode = "guildBattle" | "grandBattle";

export type BattleDetectionStatus =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "resolved" };

export interface BattleDetectionResult {
  readonly mode: BattleMonitorMode;
  readonly snapshot: GvgSnapshot;
  readonly worldId: GvgWorldId;
}

interface BattleDetectionState {
  readonly result: BattleDetectionResult | null;
  readonly status: BattleDetectionStatus;
}

interface UseBattleDetectionInput {
  readonly appMode: AppMode;
  readonly configuredWorldId: GvgWorldId | null;
  readonly isFirebaseVersion: boolean;
  readonly isOwnerProfileLoading: boolean;
  readonly loadSnapshot: typeof loadLocalGvgSnapshot;
}

export function useBattleDetection({
  appMode,
  configuredWorldId,
  isFirebaseVersion,
  isOwnerProfileLoading,
  loadSnapshot
}: UseBattleDetectionInput): BattleDetectionState {
  const loadSnapshotRef = useRef(loadSnapshot);
  const [state, setState] = useState<BattleDetectionState>({
    result: null,
    status: { status: "loading" }
  });

  loadSnapshotRef.current = loadSnapshot;

  useEffect(() => {
    let isDisposed = false;

    if (isFirebaseVersion && isOwnerProfileLoading) {
      setState((currentState) => getNextBattleDetectionState(currentState, { status: { status: "loading" } }));
      return;
    }

    if (isFirebaseVersion && configuredWorldId === null) {
      setState((currentState) =>
        getNextBattleDetectionState(currentState, {
          status: {
            status: "error",
            message:
              appMode === "owner"
                ? FIREBASE_OWNER_PROFILE_REQUIRED_MESSAGE
                : FIREBASE_MONITOR_RESOLUTION_ERROR_MESSAGE
          }
        })
      );
      return;
    }

    const detectionWorldId = configuredWorldId ?? PAGES_BATTLE_DETECTION_WORLD_ID;
    setState((currentState) => getNextBattleDetectionState(currentState, { status: { status: "loading" } }));

    void loadSnapshotRef.current(detectionWorldId)
      .then((snapshot) => {
        if (isDisposed) {
          return;
        }

        const detectedMode = detectBattleMonitorMode(snapshot);

        if (detectedMode === null) {
          setState((currentState) =>
            getNextBattleDetectionState(currentState, {
              status: { status: "error", message: BATTLE_DETECTION_LOAD_ERROR_MESSAGE }
            })
          );
          return;
        }

        setState({
          result: {
            mode: detectedMode,
            snapshot,
            worldId: detectionWorldId
          },
          status: { status: "resolved" }
        });
      })
      .catch(() => {
        if (isDisposed) {
          return;
        }

        setState((currentState) =>
          getNextBattleDetectionState(currentState, {
            status: {
              status: "error",
              message: isFirebaseVersion
                ? FIREBASE_MONITOR_RESOLUTION_ERROR_MESSAGE
                : BATTLE_DETECTION_LOAD_ERROR_MESSAGE
            }
          })
        );
      });

    return () => {
      isDisposed = true;
    };
  }, [appMode, configuredWorldId, isFirebaseVersion, isOwnerProfileLoading]);

  return state;
}

function getNextBattleDetectionState(
  currentState: BattleDetectionState,
  nextState: { readonly result?: BattleDetectionResult | null; readonly status: BattleDetectionStatus }
): BattleDetectionState {
  const nextResult = nextState.result === undefined ? currentState.result : nextState.result;
  const normalizedNextState = {
    result: nextResult,
    status: nextState.status
  };

  return isSameBattleDetectionStatus(currentState.status, normalizedNextState.status) &&
    currentState.result === normalizedNextState.result
    ? currentState
    : normalizedNextState;
}

function isSameBattleDetectionStatus(currentState: BattleDetectionStatus, nextState: BattleDetectionStatus): boolean {
  if (currentState.status !== nextState.status) {
    return false;
  }

  if (currentState.status === "error" && nextState.status === "error") {
    return currentState.message === nextState.message;
  }

  return true;
}

function detectBattleMonitorMode(snapshot: GvgSnapshot): BattleMonitorMode | null {
  if (snapshot.castles.length === 0) {
    return null;
  }

  if (snapshot.castles.some((castle) => castle.state === "unknown")) {
    return null;
  }

  if (
    snapshot.castles.some(
      (castle) =>
        castle.state === "inBattle" ||
        castle.state === "fallen" ||
        castle.state === "counterattack" ||
        castle.state === "counterattackSuccessful"
    )
  ) {
    return "guildBattle";
  }

  return snapshot.castles.every((castle) => castle.state === "idle") ? "grandBattle" : null;
}
