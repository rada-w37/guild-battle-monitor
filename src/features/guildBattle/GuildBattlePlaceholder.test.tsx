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
const attackGuildId = "123456789037" as GvgGuildId;
const otherGuildId = "999999999037" as GvgGuildId;

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
    [attackGuildId]: "Attack Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "idle",
      status: "underAttack",
      ownerGuildId: ownGuildId,
      attackerGuildId: attackGuildId,
      defenseCount: 120,
      attackCount: 1,
      fallenAt: null,
      lastWinPartyKnockOutCount: 7,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "fallen",
      status: "fallen",
      ownerGuildId: otherGuildId,
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
  it("starts with empty world input and no old header or own guild ID input", () => {
    renderComponent();

    expect(getWorldInput().value).toBe("");
    expect(document.body.textContent).toContain("GuildBattleMonitor");
    expect(document.body.textContent).not.toContain("GvG common foundation");
    expect(document.body.textContent).not.toContain("自ギルドID");
  });

  it("does not load while typing world", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushPromises();

    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it("loads with the update button and converts world to worldId", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await clickButton("更新");

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith("1037");
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル", "ウィスケルケー"]);
  });

  it("uses guild select just before the monitor list", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999037 (1)", "Owner Guild (1)"]);
    expect(document.querySelector(".castle-list--with-owner")).not.toBeNull();

    const guildSelect = document.querySelector(".guild-select-field");
    const castleList = document.querySelector(".castle-list");
    expect(guildSelect?.compareDocumentPosition(castleList as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル"]);
    expect(document.querySelector(".castle-list--with-owner")).toBeNull();
    expect(document.querySelector(".castle-list__header")?.textContent).not.toContain("所有");
  });

  it("does not show the old result summary panel in the normal monitor area", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(document.querySelector(".snapshot-summary > .summary-grid")).toBeNull();
    expect(document.querySelector(".dev-snapshot-details")?.textContent).toContain("worldId");
  });

  it("uses a danger sort checkbox", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル", "ウィスケルケー"]);

    await act(async () => {
      getDangerSortCheckbox().click();
    });

    expect(getRenderedCastleLabels()).toEqual(["ウィスケルケー", "ブラッセル"]);
  });

  it("keeps IDs, alert text, and battle state text out of the normal list", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    const listText = getCastleListText();
    expect(listText).toContain("Owner Guild");
    expect(listText).toContain("Attack Guild");
    expect(listText).not.toContain(ownGuildId);
    expect(listText).not.toContain(attackGuildId);
    expect(listText).not.toContain("安全");
    expect(listText).not.toContain("注意");
    expect(listText).not.toContain("危険");
    expect(listText).not.toContain("最優先");
    expect(listText).not.toContain("通常");
    expect(listText).not.toContain("侵攻中");
    expect(listText).not.toContain("占拠");
  });

  it("uses attack wording and shows KO counts", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    const list = document.querySelector(".castle-list");
    expect(list?.textContent).toContain("攻");
    expect(list?.textContent).not.toContain("侵");
    expect(list?.textContent).toContain("攻 1 KO");
    expect(list?.textContent).toContain("防 7 KO");
  });

  it("keeps mobile one-line count structure with no wrapping-prone labels", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    const row = document.querySelector(".castle-list__row");
    expect(row?.querySelector(".castle-list__castle")).not.toBeNull();
    expect(row?.querySelector("[data-label='防']")).not.toBeNull();
    expect(row?.querySelector("[data-label='攻']")).not.toBeNull();
    expect(row?.querySelector("[data-label='侵']")).toBeNull();
  });

  it("keeps threshold settings and validation", () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    expect(getThresholdInputs().map((input) => input.value)).toEqual(["30", "15", "10"]);

    act(() => {
      updateInput(getThresholdInputs()[1], "30");
    });

    expect(document.body.textContent).toContain("注意 > 危険 > 最優先");
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

  it("uses one auto update toggle button and respects OFF during refresh", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    expect(getAutoUpdateButton().textContent).toBe("自動更新 ON");
    await clickButton("自動更新 ON");
    expect(getAutoUpdateButton().textContent).toBe("自動更新 OFF");

    await loadWorld37();
    expect(realtimeClient.subscriptions).toHaveLength(0);

    await clickButton("自動更新 OFF");
    expect(getAutoUpdateButton().textContent).toBe("自動更新 ON");
    expect(realtimeClient.subscriptions).toHaveLength(1);
  });

  it("updates the list through the mock realtime pipeline when auto update is on", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await loadWorld37();
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ defenseCount: 12, attackCount: 0 }));
    });

    expect(document.body.textContent).toContain("12");
    expect(document.querySelector(".castle-list__row--danger")).not.toBeNull();
  });

  it("uses DEV test mode buttons to update alert UI through the realtime pipeline", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickButton("自動更新 ON");
    await loadWorld37();
    await toggleTestMode();
    await flushPromises();
    await clickButton("自動更新 OFF");
    await waitForText("自動更新中");
    await clickTestModeButton("攻 +10");

    expect(document.body.textContent).toContain("攻 11 KO");
    expect(document.querySelector(".castle-list__row--safe")).not.toBeNull();
  });
});

function renderComponent(
  loadSnapshot: typeof loadLocalGvgSnapshot = vi.fn(() => Promise.resolve(snapshot)),
  createRealtimeClient: () => GvgRealtimeClient = () => new MockGvgRealtimeClient()
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

async function loadWorld37() {
  act(() => {
    updateInput(getWorldInput(), "37");
  });
  await clickButton("更新");
}

async function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label
  );

  if (!button) {
    throw new Error(`button was not found: ${label}`);
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.body.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`text was not found: ${text}`);
}

function getWorldInput() {
  const input = document.querySelector<HTMLInputElement>(".field__input--world");

  if (!input) {
    throw new Error("world input was not found");
  }

  return input;
}

function getGuildSelect() {
  const select = document.querySelector<HTMLSelectElement>(".guild-select-field select");

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

function getAutoUpdateButton() {
  const button = document.querySelector<HTMLButtonElement>(".auto-update-toggle");

  if (!button) {
    throw new Error("auto update toggle button was not found");
  }

  return button;
}

function getRenderedCastleLabels() {
  return Array.from(document.querySelectorAll<HTMLDivElement>(".castle-list__row")).map(
    (row) => row.querySelector(".castle-list__castle")?.textContent?.trim() ?? ""
  );
}

function getCastleListText() {
  return document.querySelector(".castle-list")?.textContent ?? "";
}

async function toggleTestMode() {
  const checkbox = document.querySelector<HTMLInputElement>(".test-mode-settings input[type='checkbox']");

  if (!checkbox) {
    throw new Error("test mode checkbox was not found");
  }

  await act(async () => {
    checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
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
    await Promise.resolve();
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
    lastWinPartyKnockOutCount: number;
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
    ...writeUint16(overrides.lastWinPartyKnockOutCount ?? 0)
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
