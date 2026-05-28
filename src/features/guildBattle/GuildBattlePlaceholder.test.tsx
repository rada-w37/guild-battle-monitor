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
  worldId: 1001
});

const snapshot = {
  worldId: "1001" as GvgWorldId,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [ownGuildId]: "Owner Guild",
    ["123456789001" as GvgGuildId]: "Attack Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId: "1001" as GvgWorldId,
      state: "idle",
      status: "underAttack",
      ownerGuildId: ownGuildId,
      attackerGuildId: "123456789001" as GvgGuildId,
      defenseCount: 120,
      attackCount: 1,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      worldId: "1001" as GvgWorldId,
      state: "idle",
      status: "normal",
      ownerGuildId: "999999999001" as GvgGuildId,
      attackerGuildId: null,
      defenseCount: 40,
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
  root = null;
  container = null;
});

describe("GuildBattlePlaceholder", () => {
  it("shows the initial unloaded state", () => {
    renderComponent();

    expect(getWorldIdInput().value).toBe("1001");
    expect(getOwnGuildIdInput().value).toBe("");
    expect(getSubmitButton().disabled).toBe(false);
  });

  it("updates worldId input", () => {
    renderComponent();

    act(() => {
      updateInput(getWorldIdInput(), "2001");
    });

    expect(getWorldIdInput().value).toBe("2001");
  });

  it("loads a snapshot and shows compact castle labels", async () => {
    const deferred = createDeferred<GvgSnapshot>();
    const loadSnapshot = vi.fn(() => deferred.promise);
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(loadSnapshot).toHaveBeenCalledWith("1001");
    expect(getSubmitButton().disabled).toBe(true);

    await act(async () => {
      deferred.resolve(snapshot);
      await deferred.promise;
    });

    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999001 (1)", "Owner Guild (1)"]);
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル#1 / 神殿", "ウィスケルケー#2 / 城"]);
    expect(document.querySelector(".castle-list__row--critical")).not.toBeNull();
  });

  it("selects a guild candidate by guildId", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSubmitButton();

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });

    expect(getOwnGuildIdInput().value).toBe(ownGuildId);
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル#1 / 神殿"]);
  });

  it("falls back to all castles when own guild ID has no owned castles", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), "111111111001");
    });

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル#1 / 神殿", "ウィスケルケー#2 / 城"]);
  });

  it("shows alert badges, battle state, and compact row classes", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSubmitButton();

    expect(document.querySelector(".alert-critical")?.textContent).toContain("最優先");
    expect(document.querySelector(".battle-status--battle")?.textContent).toBe("侵攻中");
    expect(document.querySelector(".castle-list__row--critical")).not.toBeNull();
    expect(document.querySelector(".castle-list__row--safe")).not.toBeNull();
  });

  it("keeps castle ID order by default and can sort by alert level", async () => {
    const sortSnapshot = {
      ...snapshot,
      castles: [
        { ...snapshot.castles[0], castleId: "1" as GvgCastleId, attackCount: 0, defenseCount: 40 },
        { ...snapshot.castles[1], castleId: "2" as GvgCastleId, attackCount: 1, defenseCount: 40 }
      ]
    } satisfies GvgSnapshot;
    renderComponent(vi.fn(() => Promise.resolve(sortSnapshot)));

    await clickSubmitButton();

    expect(getRenderedCastleLabels()).toEqual(["ブラッセル#1 / 神殿", "ウィスケルケー#2 / 城"]);

    await act(async () => {
      updateSelect(getSortSelect(), "alertLevel");
    });

    expect(getRenderedCastleLabels()).toEqual(["ウィスケルケー#2 / 城", "ブラッセル#1 / 神殿"]);
  });

  it("renders a compact error message", async () => {
    renderComponent(vi.fn(() => Promise.reject(new Error("HTTP 500"))));

    await clickSubmitButton();

    expect(document.body.textContent).toContain("HTTP 500");
  });

  it("starts realtime monitoring and rerenders owned castles after payload update", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await clickSubmitButton();
    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickRealtimeStartButton();

    expect(realtimeClient.subscriptions).toHaveLength(1);

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ defenseCount: 12, attackCount: 0 }));
    });

    expect(document.body.textContent).toContain("12");
    expect(document.querySelector(".castle-list__row--danger")).not.toBeNull();
  });

  it("uses DEV test mode buttons to update alert UI through realtime pipeline", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSubmitButton();
    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await toggleTestMode();
    await clickRealtimeStartButton();
    await clickTestModeButton("侵攻 +10");

    expect(document.body.textContent).toContain("10");
    expect(document.querySelector(".castle-list__row--critical")).not.toBeNull();
  });

  it("shows alert threshold helper text and boundaries", () => {
    renderComponent();

    expect(document.body.textContent).toContain("防衛数が設定値を下回ると警告されます。");
    expect(document.body.textContent).toContain("注意: 30未満");
    expect(document.body.textContent).toContain("危険: 15未満");
    expect(document.body.textContent).toContain("最優先: 10未満");
    expect(document.body.textContent).toContain("侵攻中は防衛数に関係なく最優先表示されます。");
  });

  it("loads alert thresholds from localStorage", () => {
    window.localStorage.setItem(
      GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY,
      JSON.stringify({
        warningDefenseCount: 50,
        dangerDefenseCount: 20,
        criticalDefenseCount: 5
      })
    );

    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    expect(getThresholdInputs().map((input) => input.value)).toEqual(["50", "20", "5"]);
    expect(document.body.textContent).toContain("注意: 50未満");
  });

  it("saves threshold changes and recalculates alerts", async () => {
    const thresholdSnapshot = {
      ...snapshot,
      castles: [{ ...snapshot.castles[1], castleId: "1" as GvgCastleId, defenseCount: 25 }]
    } satisfies GvgSnapshot;
    renderComponent(vi.fn(() => Promise.resolve(thresholdSnapshot)));

    await clickSubmitButton();
    expect(document.querySelector(".castle-list__row--warning")).not.toBeNull();

    await act(async () => {
      updateInput(getThresholdInputs()[0], "20");
    });

    expect(document.querySelector(".castle-list__row--safe")).not.toBeNull();
    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":20'
    );
  });

  it("shows friendly validation errors and keeps the previous threshold", () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    act(() => {
      updateInput(getThresholdInputs()[1], "30");
    });

    expect(document.body.textContent).toContain("注意 > 危険 > 最優先 の順になるよう設定してください。");
    expect(getThresholdInputs()[1].value).toBe("15");
  });

  it("resets alert thresholds to defaults", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await act(async () => {
      updateInput(getThresholdInputs()[0], "40");
    });
    await clickAlertResetButton();

    expect(getThresholdInputs().map((input) => input.value)).toEqual(["30", "15", "10"]);
    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":30'
    );
  });

  it("updates guild candidates after realtime snapshot updates", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await clickSubmitButton();
    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });
    await clickRealtimeStartButton();

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ guildId: 123456789, defenseCount: 25 }));
    });

    expect(getGuildSelectOptions()).toContain("Attack Guild (1)");
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル#1 / 神殿", "ウィスケルケー#2 / 城"]);
  });

  it("stops realtime monitoring safely", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await clickSubmitButton();
    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickRealtimeStopButton();
    await clickRealtimeStartButton();
    await clickRealtimeStartButton();
    await clickRealtimeStopButton();

    expect(realtimeClient.subscriptions).toHaveLength(1);
    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);
  });

  it("shows disconnected after socket close and reconnects manually", async () => {
    const firstClient = new MockGvgRealtimeClient();
    const secondClient = new MockGvgRealtimeClient();
    const realtimeClients = [firstClient, secondClient];
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => {
      const client = realtimeClients.shift();

      if (!client) {
        throw new Error("missing realtime client");
      }

      return client;
    });

    await clickSubmitButton();
    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickRealtimeStartButton();

    act(() => {
      firstClient.disconnect("socket closed");
    });

    await clickRealtimeReconnectButton();

    expect(firstClient.sentUnsubscriptions).toHaveLength(1);
    expect(secondClient.subscriptions).toHaveLength(1);
  });

  it("shows error and can reconnect manually", async () => {
    const firstClient = new MockGvgRealtimeClient();
    const secondClient = new MockGvgRealtimeClient();
    const clients = [firstClient, secondClient];
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => {
      const client = clients.shift();

      if (!client) {
        throw new Error("missing realtime client");
      }

      return client;
    });

    await clickSubmitButton();
    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickRealtimeStartButton();

    act(() => {
      firstClient.emitError(new Error("socket failed"));
    });

    await clickRealtimeReconnectButton();

    expect(secondClient.subscriptions).toHaveLength(1);
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

async function clickSubmitButton() {
  await act(async () => {
    getSubmitButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getWorldIdInput() {
  return getTextInputs()[0];
}

function getOwnGuildIdInput() {
  return getTextInputs()[1];
}

function getTextInputs() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='text']"));

  if (inputs.length < 2) {
    throw new Error("expected worldId and own guild ID inputs");
  }

  return inputs;
}

function getSubmitButton() {
  const button = document.querySelector<HTMLButtonElement>("button[type='submit']");

  if (!button) {
    throw new Error("submit button was not found");
  }

  return button;
}

function getSortSelect() {
  const select = document.querySelectorAll<HTMLSelectElement>("select")[1];

  if (!select) {
    throw new Error("sort select was not found");
  }

  return select;
}

function getGuildSelect() {
  const select = document.querySelectorAll<HTMLSelectElement>("select")[0];

  if (!select) {
    throw new Error("guild select was not found");
  }

  return select;
}

function getGuildSelectOptions() {
  return Array.from(getGuildSelect().options).map((option) => option.textContent ?? "");
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
    (row) => (row.querySelector("span")?.textContent ?? "").replace(/\s+/g, " ").trim()
  );
}

async function clickAlertResetButton() {
  const button = document.querySelector<HTMLButtonElement>(".alert-settings button");

  if (!button) {
    throw new Error("alert reset button was not found");
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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
  await clickRealtimeActionButton(0);
}

async function clickRealtimeReconnectButton() {
  await clickRealtimeActionButton(1);
}

async function clickRealtimeStopButton() {
  await clickRealtimeActionButton(2);
}

async function clickRealtimeActionButton(index: number) {
  const button = document.querySelectorAll<HTMLButtonElement>(".realtime-controls__actions button")[index];

  if (!button) {
    throw new Error(`realtime action button was not found: ${index}`);
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

function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
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
