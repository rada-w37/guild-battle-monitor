import { useEffect, useRef, useState } from "react";
import {
  getNextKoObserverReadBoundary,
  isKoObserverStartedForToday,
  shouldUseKoObserverRealtime
} from "./koObserverTime";
import type { KoGuildKoTotal, KoGuildKoTotalsSubscriber, KoMonitorLoadState, KoObserverRunMeta } from "./types";

const MAX_TIMEOUT_MS = 2_147_483_647;
export const KO_MONITOR_GUILD_KO_TOTALS_SCOPE = "guild-ko-totals";

interface KoMonitorSubscriptionKeyInput {
  readonly boundaryRefreshKey: number;
  readonly refreshKey: number;
  readonly scope: string;
}

export interface UseKoMonitorLoadStateOptions {
  readonly enabled: boolean;
  readonly loadKoObserverRunMeta?: () => Promise<KoObserverRunMeta | null>;
  readonly loadKoGuildKoTotals?: () => Promise<readonly KoGuildKoTotal[]>;
  readonly now: () => Date;
  readonly refreshKey: number;
  readonly scope: string;
  readonly subscribeKoGuildKoTotals?: KoGuildKoTotalsSubscriber;
}

export function createKoMonitorSubscriptionKey({
  boundaryRefreshKey,
  refreshKey,
  scope
}: KoMonitorSubscriptionKeyInput): string {
  return `${scope}:realtime:${refreshKey}:${boundaryRefreshKey}`;
}

function createKoMonitorRequestKey({
  boundaryRefreshKey,
  enabled,
  hasRepository,
  refreshKey,
  scope
}: KoMonitorSubscriptionKeyInput & {
  readonly enabled: boolean;
  readonly hasRepository: boolean;
}): string {
  if (!enabled) {
    return "disabled";
  }

  if (!hasRepository) {
    return "missing-repository";
  }

  return `${scope}:request:${refreshKey}:${boundaryRefreshKey}`;
}

function isSameKoGuildKoTotals(
  currentRows: readonly KoGuildKoTotal[],
  nextRows: readonly KoGuildKoTotal[]
): boolean {
  if (currentRows.length !== nextRows.length) {
    return false;
  }

  return currentRows.every((currentRow, index) => {
    const nextRow = nextRows[index];

    return (
      currentRow.guildId === nextRow.guildId &&
      currentRow.guildName === nextRow.guildName &&
      currentRow.totalVictimKoCount === nextRow.totalVictimKoCount &&
      (currentRow.updatedAt?.getTime() ?? null) === (nextRow.updatedAt?.getTime() ?? null)
    );
  });
}

function getKoMonitorRows(state: KoMonitorLoadState): readonly KoGuildKoTotal[] {
  return state.status === "success" || state.status === "error" ? state.rows : [];
}

function isSameKoMonitorLoadState(currentState: KoMonitorLoadState, nextState: KoMonitorLoadState): boolean {
  if (currentState.status !== nextState.status) {
    return false;
  }

  if (currentState.status === "success" && nextState.status === "success") {
    return (
      currentState.isObserverStarted === nextState.isObserverStarted &&
      isSameKoGuildKoTotals(currentState.rows, nextState.rows)
    );
  }

  if (currentState.status === "error" && nextState.status === "error") {
    return (
      currentState.error.name === nextState.error.name &&
      currentState.error.message === nextState.error.message &&
      isSameKoGuildKoTotals(currentState.rows, nextState.rows)
    );
  }

  return true;
}

function getNextKoMonitorLoadState(
  currentState: KoMonitorLoadState,
  nextState: KoMonitorLoadState
): KoMonitorLoadState {
  return isSameKoMonitorLoadState(currentState, nextState) ? currentState : nextState;
}

export function useKoMonitorLoadState({
  enabled,
  loadKoObserverRunMeta,
  loadKoGuildKoTotals,
  now,
  refreshKey,
  scope,
  subscribeKoGuildKoTotals
}: UseKoMonitorLoadStateOptions): KoMonitorLoadState {
  const [state, setState] = useState<KoMonitorLoadState>({ status: "idle" });
  const [boundaryRefreshKey, setBoundaryRefreshKey] = useState(0);
  const loadKoObserverRunMetaRef = useRef(loadKoObserverRunMeta);
  const loadKoGuildKoTotalsRef = useRef(loadKoGuildKoTotals);
  const nowRef = useRef(now);
  const subscribeKoGuildKoTotalsRef = useRef(subscribeKoGuildKoTotals);
  const activeSubscriptionKeyRef = useRef<string | null>(null);
  const hasRepository =
    loadKoObserverRunMeta !== undefined &&
    loadKoGuildKoTotals !== undefined &&
    subscribeKoGuildKoTotals !== undefined;
  const requestKey = createKoMonitorRequestKey({
    boundaryRefreshKey,
    enabled,
    hasRepository,
    refreshKey,
    scope
  });

  loadKoObserverRunMetaRef.current = loadKoObserverRunMeta;
  loadKoGuildKoTotalsRef.current = loadKoGuildKoTotals;
  nowRef.current = now;
  subscribeKoGuildKoTotalsRef.current = subscribeKoGuildKoTotals;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const currentTime = nowRef.current();
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
  }, [boundaryRefreshKey, enabled]);

  useEffect(() => {
    if (!enabled || !hasRepository) {
      activeSubscriptionKeyRef.current = null;
      setState((currentState) => getNextKoMonitorLoadState(currentState, { status: "idle" }));
      return;
    }

    const loadMeta = loadKoObserverRunMetaRef.current;
    const loadTotals = loadKoGuildKoTotalsRef.current;
    const subscribeTotals = subscribeKoGuildKoTotalsRef.current;

    if (loadMeta === undefined || loadTotals === undefined || subscribeTotals === undefined) {
      activeSubscriptionKeyRef.current = null;
      setState((currentState) => getNextKoMonitorLoadState(currentState, { status: "idle" }));
      return;
    }

    const loadMetaFn: () => Promise<KoObserverRunMeta | null> = loadMeta;
    const loadTotalsFn: () => Promise<readonly KoGuildKoTotal[]> = loadTotals;
    const subscribeTotalsFn: KoGuildKoTotalsSubscriber = subscribeTotals;
    let isDisposed = false;
    let unsubscribe: (() => void) | null = null;
    setState((currentState) => (currentState.status === "idle" ? { status: "loading" } : currentState));

    async function load() {
      const currentTime = nowRef.current();
      const meta = await loadMetaFn();
      const isObserverStarted = isKoObserverStartedForToday(meta?.lastStartedAt ?? null, currentTime);

      if (shouldUseKoObserverRealtime(currentTime)) {
        const subscriptionKey = createKoMonitorSubscriptionKey({
          boundaryRefreshKey,
          refreshKey,
          scope
        });
        activeSubscriptionKeyRef.current = subscriptionKey;
        unsubscribe = subscribeTotalsFn(
          (rows) => {
            if (!isDisposed && activeSubscriptionKeyRef.current === subscriptionKey) {
              setState((currentState) =>
                getNextKoMonitorLoadState(currentState, { status: "success", isObserverStarted, rows })
              );
            }
          },
          (error) => {
            if (!isDisposed && activeSubscriptionKeyRef.current === subscriptionKey) {
              setState((currentState) =>
                getNextKoMonitorLoadState(currentState, {
                  status: "error",
                  error,
                  rows: getKoMonitorRows(currentState)
                })
              );
            }
          }
        );
        return;
      }

      activeSubscriptionKeyRef.current = null;
      const rows = await loadTotalsFn();

      if (!isDisposed) {
        setState((currentState) =>
          getNextKoMonitorLoadState(currentState, { status: "success", isObserverStarted, rows })
        );
      }
    }

    void load().catch((error) => {
      if (!isDisposed) {
        activeSubscriptionKeyRef.current = null;
        setState((currentState) =>
          getNextKoMonitorLoadState(currentState, {
            status: "error",
            error: error instanceof Error ? error : new Error("KO monitor data could not be loaded."),
            rows: getKoMonitorRows(currentState)
          })
        );
      }
    });

    return () => {
      isDisposed = true;
      activeSubscriptionKeyRef.current = null;
      unsubscribe?.();
    };
  }, [boundaryRefreshKey, enabled, hasRepository, refreshKey, requestKey, scope]);

  return state;
}
