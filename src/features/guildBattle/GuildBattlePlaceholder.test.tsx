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

const ownGuildId = "438130839037" as GvgGuildId;
const attackGuildId = "123456789037" as GvgGuildId;
const otherGuildId = "999999999037" as GvgGuildId;

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
      attackCount: 39,
      fallenAt: null,
      lastWinPartyKnockOutCount: 50,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "idle",
      status: "normal",
      ownerGuildId: otherGuildId,
      attackerGuildId: null,
      defenseCount: 8,
      attackCount: 0,
      fallenAt: null,
      lastWinPartyKnockOutCount: 7,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "3" as GvgCastleId,
      worldId: "1037" as GvgWorldId,
      state: "idle",
      status: "underAttack",
      ownerGuildId: otherGuildId,
      attackerGuildId: attackGuildId,
      defenseCount: 12,
      attackCount: 2,
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
  it("starts with empty world input and no placeholder", () => {
    renderComponent();

    expect(getWorldInput().value).toBe("");
    expect(getWorldInput().getAttribute("placeholder")).toBeNull();
    expect(document.body.textContent).toContain("GuildBattleMonitor");
  });

  it("opens settings from the icon button", async () => {
    renderComponent();

    await clickSettingsButton();

    const dialog = getSettingsDialog();
    expect(dialog.textContent).toContain("設定");
    expect(dialog.textContent).toContain("並び順");
    expect(dialog.textContent).toContain("自動更新");
    expect(dialog.textContent).toContain("防衛数が設定値未満になると色が変わります。");
    expect(dialog.textContent).not.toContain("注意30未満");
    expect(dialog.textContent).not.toContain("自動更新中");
  });

  it("toggles auto update inside the settings dialog", async () => {
    renderComponent();

    await clickSettingsButton();
    expect(getAutoUpdateButton().textContent).toBe("ON");
    await clickButton("ON");
    expect(getAutoUpdateButton().textContent).toBe("OFF");
    await clickButton("OFF");
    expect(getAutoUpdateButton().textContent).toBe("ON");
  });

  it("does not load while typing world and loads with the update button", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushPromises();
    expect(loadSnapshot).not.toHaveBeenCalled();

    await clickButton("更新");
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith("1037");
  });

  it("loads with Enter submit from the world input", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await submitStartupForm();

    expect(loadSnapshot).toHaveBeenCalledWith("1037");
  });

  it("places the defense guild select just before the monitor list", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(document.querySelector(".guild-select-field .field__label")?.textContent).toBe("防衛ギルド");
    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999037 (2)", "Owner Guild (1)"]);

    const guildSelect = document.querySelector(".guild-select-field");
    const castleList = document.querySelector(".castle-list");
    expect(guildSelect?.compareDocumentPosition(castleList as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("removes monitor explanation messages", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(document.body.textContent).not.toContain("全拠点を表示しています。");
    expect(document.body.textContent).not.toContain("指定ギルドの防衛拠点のみ表示しています。");
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

  it("renders defense, attack, and KO columns without invasion wording", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    const firstRow = getCastleRows()[0];
    expect(firstRow.querySelector("[data-label='防']")?.textContent).toBe("120");
    expect(firstRow.querySelector("[data-label='攻']")?.textContent).toBe("39");
    expect(firstRow.querySelector("[data-label='侵']")).toBeNull();
    expect(firstRow.querySelector(".castle-list__ko")?.textContent).toBe("50");
    expect(firstRow.querySelector(".castle-list__ko")?.getAttribute("data-label")).toBe("KO");
  });

  it("always shows KO and uses tone classes", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(getCastleRows()[0].querySelector(".castle-list__ko")?.textContent).toBe("50");
    expect(getCastleRows()[0].querySelector(".ko-value--defense")).not.toBeNull();
    expect(getCastleRows()[1].querySelector(".castle-list__ko")?.textContent).toBe("7");
    expect(getCastleRows()[2].querySelector(".castle-list__ko")?.textContent).toBe("0");
    expect(getCastleRows()[2].querySelector(".ko-value--none")).not.toBeNull();
  });

  it("shows a connection indicator with tooltip and opens settings on click", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    const indicator = getConnectionIndicator();
    expect(indicator.getAttribute("title")).toBe("接続中");
    const header = document.querySelector(".snapshot-summary__header");
    expect(header?.children[0]?.textContent).toBe("拠点監視");
    expect(header?.children[1]).toBe(indicator);

    await act(async () => {
      indicator.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getSettingsDialog()).not.toBeNull();
  });

  it("treats undeclared low-defense castles as safe", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(getCastleRows()[1].className).toContain("castle-list__row--safe");
  });

  it("filters by current owner guild after ownership changes", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await loadWorld37();
    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル"]);

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ castleId: 3, guildId: 438130839, defenseCount: 30 }));
    });

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル", "モダーヴ"]);
  });

  it("keeps threshold settings and validation in the dialog", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSettingsButton();
    expect(getThresholdInputs().map((input) => input.value)).toEqual(["30", "15", "10"]);

    act(() => {
      updateInput(getThresholdInputs()[1], "30");
    });

    expect(getSettingsDialog().textContent).toContain("注意 > 危険 > 最優先");
    expect(getThresholdInputs()[1].value).toBe("15");
  });

  it("saves threshold changes", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSettingsButton();
    act(() => {
      updateInput(getThresholdInputs()[0], "40");
    });

    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":40'
    );
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

async function clickSettingsButton() {
  const button = document.querySelector<HTMLButtonElement>("[aria-label='設定を開く']");

  if (!button) {
    throw new Error("settings button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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
    await Promise.resolve();
  });
}

function getWorldInput() {
  const input = document.querySelector<HTMLInputElement>(".field__input--world");

  if (!input) {
    throw new Error("world input was not found");
  }

  return input;
}

async function submitStartupForm() {
  const form = document.querySelector<HTMLFormElement>(".startup-panel");

  if (!form) {
    throw new Error("startup form was not found");
  }

  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getConnectionIndicator() {
  const indicator = document.querySelector<HTMLButtonElement>(".connection-indicator");

  if (!indicator) {
    throw new Error("connection indicator was not found");
  }

  return indicator;
}

function getSettingsDialog() {
  const dialog = document.querySelector<HTMLElement>("[role='dialog']");

  if (!dialog) {
    throw new Error("settings dialog was not found");
  }

  return dialog;
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

function getThresholdInputs() {
  const inputs = Array.from(getSettingsDialog().querySelectorAll<HTMLInputElement>("input[type='number']"));

  if (inputs.length !== 3) {
    throw new Error("expected three threshold inputs");
  }

  return inputs;
}

function getAutoUpdateButton() {
  const button = getSettingsDialog().querySelector<HTMLButtonElement>(".auto-update-toggle");

  if (!button) {
    throw new Error("auto update toggle button was not found");
  }

  return button;
}

function getRenderedCastleLabels() {
  return getCastleRows().map((row) => row.querySelector(".castle-list__castle")?.textContent?.trim() ?? "");
}

function getCastleRows() {
  return Array.from(document.querySelectorAll<HTMLDivElement>(".castle-list__row"));
}

function getCastleListText() {
  return document.querySelector(".castle-list")?.textContent ?? "";
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

function createCastleStatusBytes({
  castleId,
  guildId,
  attackerGuildId = 0,
  defenseCount,
  attackCount = 0,
  rawState = 0,
  lastWinPartyKnockOutCount = 0
}: {
  readonly castleId: number;
  readonly guildId: number;
  readonly attackerGuildId?: number;
  readonly defenseCount: number;
  readonly attackCount?: number;
  readonly rawState?: number;
  readonly lastWinPartyKnockOutCount?: number;
}): number[] {
  return [
    ...writeUint32(
      buildGvgStreamId({
        castleId,
        block: 0,
        worldGroupId: 0,
        gvgClass: 0,
        worldId: 1037
      })
    ),
    ...writeUint32(guildId),
    ...writeUint32(attackerGuildId),
    ...writeUint32(0),
    ...writeUint16(defenseCount),
    ...writeUint16(attackCount),
    rawState,
    0,
    ...writeUint16(lastWinPartyKnockOutCount)
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
