// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import { MockGvgRealtimeClient } from "../gvg/mockRealtimeClient";
import type { GvgRealtimeClient } from "../gvg/realtimeClientTypes";
import { buildGvgStreamId } from "../gvg/streamId";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY } from "./alertThresholdStorage";
import { GuildBattlePlaceholder } from "./GuildBattlePlaceholder";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ownGuildId = "438130839001" as GvgGuildId;

const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1037
});

const snapshot = {
  worldId: "1037" as GvgWorldId,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [ownGuildId]: "Owner Guild",
    ["123456789037" as GvgGuildId]: "Attack Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "idle",
      status: "underAttack",
      ownerGuildId: ownGuildId,
      attackerGuildId: "123456789037" as GvgGuildId,
      defenseCount: 120,
      attackCount: 1,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "idle",
      status: "normal",
      ownerGuildId: "999999999037" as GvgGuildId,
      attackerGuildId: null,
      defenseCount: 8,
      attackCount: 0,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    }
  ]
} satisfies GvgSnapshot;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  window.localStorage.clear();
  vi.useRealTimers();
  root = null;
  container = null;
});

describe("GuildBattlePlaceholder", () => {
  it("starts with empty world input and no own guild ID input", () => {
    renderComponent();

    expect(getWorldInput().value).toBe("");
    expect(document.body.textContent).toContain("GuildBattleMonitor");
    expect(document.body.textContent).not.toContain("GvG common foundation");
    expect(document.body.textContent).not.toContain("自ギルドID");
  });

  it("converts world to worldId and auto loads after input", async () => {
    vi.useFakeTimers();
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });

    expect(loadSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(loadSnapshot).toHaveBeenCalledWith("1037");
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル", "ウィスケルケー"]);
  });

  it("refresh button reloads the current world", async () => {
    vi.useFakeTimers();
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();
    await clickRefreshButton();

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(loadSnapshot).toHaveBeenLastCalledWith("1037");
  });

  it("uses guild select as the main guild filter", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999037 (1)", "Owner Guild (1)"]);
    expect(document.querySelector(".castle-list--with-owner")).not.toBeNull();
    expect(document.body.textContent).toContain("所有");

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル"]);
    expect(document.querySelector(".castle-list--with-owner")).toBeNull();
    expect(document.querySelector(".castle-list__header")?.textContent).not.toContain("所有");
  });

  it("does not show snapshot result cards in normal monitor area", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    expect(document.querySelector(".snapshot-summary > .summary-grid")?.textContent).not.toContain("worldId");
    expect(document.querySelector(".dev-snapshot-details")?.textContent).toContain("worldId");
  });

  it("uses a checkbox for danger sorting", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル", "ウィスケルケー"]);

    await act(async () => {
      getDangerSortCheckbox().click();
    });

    expect(getRenderedCastleLabels()).toEqual(["ウィスケルケー", "ブラッセル"]);
  });

  it("does not display guild IDs in normal list columns", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    const listText = document.querySelector(".castle-list")?.textContent ?? "";
    expect(listText).toContain("Owner Guild");
    expect(listText).toContain("Attack Guild");
    expect(listText).not.toContain(ownGuildId);
    expect(listText).not.toContain("123456789037");
  });

  it("shows timestamp only as DEV details", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    expect(document.querySelector(".castle-list__updated")?.textContent).toBe(snapshot.capturedAt);
  });

  it("does not make under attack castles critical when defense is enough", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    const firstRow = document.querySelector(".castle-list__row");
    expect(firstRow?.className).toContain("castle-list__row--safe");
    expect(firstRow?.textContent).toContain("侵攻中");
  });

  it("keeps threshold settings and validation", () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    expect(getThresholdInputs().map((input) => input.value)).toEqual(["30", "15", "10"]);

    act(() => {
      updateInput(getThresholdInputs()[1], "30");
    });

    expect(document.body.textContent).toContain("注意 > 危険 > 最優先 の順になるよう設定してください。");
    expect(getThresholdInputs()[1].value).toBe("15");
  });

  it("saves threshold changes", () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getThresholdInputs()[0], "40");
    });

    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":40'
    );
  });

  it("keeps realtime monitoring with mock client", async () => {
    vi.useFakeTimers();
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();
    await clickRealtimeStartButton();

    expect(realtimeClient.subscriptions).toHaveLength(1);

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ defenseCount: 12, attackCount: 0 }));
    });

    expect(document.body.textContent).toContain("12");
    expect(document.querySelector(".castle-list__row--danger")).not.toBeNull();
  });

  it("uses DEV test mode buttons to update alert UI through realtime pipeline", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();
    await toggleTestMode();
    await clickRealtimeStartButton();
    await clickTestModeButton("侵 +10");

    expect(document.body.textContent).toContain("10");
    expect(document.querySelector(".castle-list__row--safe")).not.toBeNull();
  });

  it("keeps mobile monitor-list structure available", async () => {
    vi.useFakeTimers();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushAutoLoad();

    const row = document.querySelector(".castle-list__row");
    expect(row?.querySelector(".castle-list__castle")).not.toBeNull();
    expect(row?.querySelector("[data-label='防']")).not.toBeNull();
    expect(row?.querySelector("[data-label='侵']")).not.toBeNull();
  });
});

function renderComponent(
  loadSnapshot?: typeof loadLocalGvgSnapshot,
  createRealtimeClient?: () => GvgRealtimeClient
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <GuildBattlePlaceholder loadSnapshot={loadSnapshot} createRealtimeClient={createRealtimeClient} />
    );
  });
}

async function flushAutoLoad() {
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

async function clickRefreshButton() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === "更新"
  );

  if (!button) {
    throw new Error("refresh button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getWorldInput() {
  const input = document.querySelector<HTMLInputElement>("input[type='text']");

  if (!input) {
    throw new Error("world input was not found");
  }

  return input;
}

function getGuildSelect() {
  const select = document.querySelector<HTMLSelectElement>("select");

  if (!select) {
    throw new Error("guild select was not found");
  }

  return select;
}

function getGuildSelectOptions() {
  return Array.from(getGuildSelect().options).map((option) => option.textContent ?? "");
}

function getDangerSortCheckbox() {
  const checkbox = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='checkbox']")).find(
    (input) => input.nextElementSibling?.textContent === "危険度順で表示"
  );

  if (!checkbox) {
    throw new Error("danger sort checkbox was not found");
  }

  return checkbox;
}

function getThresholdInputs() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='number']"));

  if (inputs.length !== 3) {
    throw new Error("expected three threshold inputs");
  }

  return inputs;
}

function getRenderedCastleLabels() {
  return Array.from(document.querySelectorAll<HTMLDivElement>(".castle-list__row")).map(
    (row) => row.querySelector(".castle-list__castle")?.textContent?.trim() ?? ""
  );
}

async function toggleTestMode() {
  const checkbox = document.querySelector<HTMLInputElement>(".test-mode-settings input[type='checkbox']");

  if (!checkbox) {
    throw new Error("test mode checkbox was not found");
  }

  await act(async () => {
    checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickTestModeButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".test-mode-actions button")).find(
    (candidate) => candidate.textContent === label
  );

  if (!button) {
    throw new Error(`test mode button was not found: ${label}`);
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickRealtimeStartButton() {
  const button = document.querySelectorAll<HTMLButtonElement>(".realtime-controls__actions button")[0];

  if (!button) {
    throw new Error("realtime start button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function updateInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateSelect(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function createCastleStatusBytes(
  overrides: Partial<{
    guildId: number;
    attackerGuildId: number;
    defenseCount: number;
    attackCount: number;
    rawState: number;
  }> = {}
): number[] {
  return [
    ...writeUint32(castleStreamId),
    ...writeUint32(overrides.guildId ?? 438130839),
    ...writeUint32(overrides.attackerGuildId ?? 0),
    ...writeUint32(0),
    ...writeUint16(overrides.defenseCount ?? 30),
    ...writeUint16(overrides.attackCount ?? 0),
    overrides.rawState ?? 0,
    0,
    ...writeUint16(0)
  ];
}

function writeUint32(value: number): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);

  return [...bytes];
}

function writeUint16(value: number): number[] {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);

  return [...bytes];
}
