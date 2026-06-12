// @vitest-environment jsdom
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KoGuildKoTotal, KoGuildKoTotalsSubscriber, KoMonitorLoadState, KoObserverRunMeta } from "./types";
import {
  KO_MONITOR_GUILD_KO_TOTALS_SCOPE,
  useKoMonitorLoadState,
  type UseKoMonitorLoadStateOptions
} from "./useKoMonitorLoadState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const koGuildKoTotals = [
  {
    guildId: "111111111050",
    guildName: "Guild A",
    totalVictimKoCount: 12,
    updatedAt: new Date("2026-05-27T11:46:00.000Z")
  },
  {
    guildId: "222222222050",
    guildName: "Guild B",
    totalVictimKoCount: 0,
    updatedAt: new Date("2026-05-27T11:46:00.000Z")
  }
] satisfies readonly KoGuildKoTotal[];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => {
      root?.unmount();
    });
  }

  container?.remove();
  container = null;
  root = null;
});

describe("useKoMonitorLoadState", () => {
  it("does not resubscribe when the same subscription key rerenders", async () => {
    const unsubscribeKoGuildKoTotals = vi.fn();
    const subscribeKoGuildKoTotals = createRealtimeSubscriber(unsubscribeKoGuildKoTotals);
    const replacementSubscribeKoGuildKoTotals = createRealtimeSubscriber();
    const rendered = renderHookProbe(createKoMonitorOptions({ subscribeKoGuildKoTotals }));

    await flushPromises();
    expect(subscribeKoGuildKoTotals).toHaveBeenCalledTimes(1);

    rendered.rerender(
      createKoMonitorOptions({
        loadKoGuildKoTotals: vi.fn(() => Promise.resolve([])),
        loadKoObserverRunMeta: vi.fn(() =>
          Promise.resolve({ lastStartedAt: new Date(2026, 4, 27, 20, 40, 0) })
        ),
        subscribeKoGuildKoTotals: replacementSubscribeKoGuildKoTotals
      })
    );
    await flushPromises();

    expect(subscribeKoGuildKoTotals).toHaveBeenCalledTimes(1);
    expect(replacementSubscribeKoGuildKoTotals).not.toHaveBeenCalled();
    expect(unsubscribeKoGuildKoTotals).not.toHaveBeenCalled();
  });

  it("keeps previous rows on realtime errors and skips identical state updates", async () => {
    let emitRows: ((rows: readonly KoGuildKoTotal[]) => void) | null = null;
    let emitError: ((error: Error) => void) | null = null;
    const subscribeKoGuildKoTotals = vi.fn<KoGuildKoTotalsSubscriber>((onRows, onError) => {
      emitRows = onRows;
      emitError = onError;
      onRows(koGuildKoTotals);
      return () => {};
    });
    const rendered = renderHookProbe(createKoMonitorOptions({ subscribeKoGuildKoTotals }));

    await flushPromises();
    expect(getLastState(rendered.states)).toEqual({
      status: "success",
      isObserverStarted: true,
      rows: koGuildKoTotals
    });

    const stateCountAfterSuccess = rendered.states.length;
    act(() => {
      emitRows?.(koGuildKoTotals);
    });
    expect(rendered.states).toHaveLength(stateCountAfterSuccess);

    act(() => {
      emitError?.(new Error("read failed"));
    });
    expect(getLastState(rendered.states)).toMatchObject({
      status: "error",
      rows: koGuildKoTotals
    });

    const stateCountAfterError = rendered.states.length;
    act(() => {
      emitError?.(new Error("read failed"));
    });
    expect(rendered.states).toHaveLength(stateCountAfterError);
  });

  it("resubscribes only when refreshKey changes", async () => {
    const unsubscribeKoGuildKoTotals = vi.fn();
    const subscribeKoGuildKoTotals = createRealtimeSubscriber(unsubscribeKoGuildKoTotals);
    const rendered = renderHookProbe(createKoMonitorOptions({ refreshKey: 0, subscribeKoGuildKoTotals }));

    await flushPromises();
    expect(subscribeKoGuildKoTotals).toHaveBeenCalledTimes(1);

    rendered.rerender(createKoMonitorOptions({ refreshKey: 1, subscribeKoGuildKoTotals }));
    await flushPromises();

    expect(unsubscribeKoGuildKoTotals).toHaveBeenCalledTimes(1);
    expect(subscribeKoGuildKoTotals).toHaveBeenCalledTimes(2);
  });

  it("does not subscribe while disabled", async () => {
    const loadKoGuildKoTotals = vi.fn(() => Promise.resolve(koGuildKoTotals));
    const loadKoObserverRunMeta = vi.fn(() =>
      Promise.resolve({ lastStartedAt: new Date(2026, 4, 27, 20, 40, 0) })
    );
    const subscribeKoGuildKoTotals = createRealtimeSubscriber();
    const rendered = renderHookProbe(
      createKoMonitorOptions({
        enabled: false,
        loadKoGuildKoTotals,
        loadKoObserverRunMeta,
        subscribeKoGuildKoTotals
      })
    );

    await flushPromises();

    expect(loadKoObserverRunMeta).not.toHaveBeenCalled();
    expect(loadKoGuildKoTotals).not.toHaveBeenCalled();
    expect(subscribeKoGuildKoTotals).not.toHaveBeenCalled();
    expect(getLastState(rendered.states)).toEqual({ status: "idle" });
  });
});

function KoMonitorHookProbe({
  onState,
  options
}: {
  readonly onState: (state: KoMonitorLoadState) => void;
  readonly options: UseKoMonitorLoadStateOptions;
}) {
  const state = useKoMonitorLoadState(options);

  useEffect(() => {
    onState(state);
  }, [onState, state]);

  return <div data-status={state.status} />;
}

function renderHookProbe(initialOptions: UseKoMonitorLoadStateOptions) {
  const states: KoMonitorLoadState[] = [];
  const onState = (state: KoMonitorLoadState) => states.push(state);

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  function rerender(options: UseKoMonitorLoadStateOptions) {
    act(() => {
      root?.render(<KoMonitorHookProbe onState={onState} options={options} />);
    });
  }

  rerender(initialOptions);

  return {
    rerender,
    states
  };
}

function createKoMonitorOptions(
  overrides: Partial<UseKoMonitorLoadStateOptions> = {}
): UseKoMonitorLoadStateOptions {
  return {
    enabled: true,
    loadKoGuildKoTotals: vi.fn(() => Promise.resolve(koGuildKoTotals)),
    loadKoObserverRunMeta: vi.fn<() => Promise<KoObserverRunMeta | null>>(() =>
      Promise.resolve({ lastStartedAt: new Date(2026, 4, 27, 20, 40, 0) })
    ),
    now: () => new Date(2026, 4, 27, 20, 45, 0),
    refreshKey: 0,
    scope: KO_MONITOR_GUILD_KO_TOTALS_SCOPE,
    subscribeKoGuildKoTotals: createRealtimeSubscriber(),
    ...overrides
  };
}

function createRealtimeSubscriber(unsubscribeKoGuildKoTotals: () => void = vi.fn()): KoGuildKoTotalsSubscriber {
  return vi.fn((onRows) => {
    onRows(koGuildKoTotals);
    return unsubscribeKoGuildKoTotals;
  });
}

function getLastState(states: readonly KoMonitorLoadState[]): KoMonitorLoadState {
  return states[states.length - 1] ?? { status: "idle" };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
