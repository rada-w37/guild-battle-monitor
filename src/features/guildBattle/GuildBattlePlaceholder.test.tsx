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

    expect(document.body.textContent).toContain("未取得です。");
    expect(getWorldIdInput().value).toBe("1001");
    expect(getOwnGuildIdInput().value).toBe("");
  });

  it("updates worldId input", () => {
    renderComponent();

    act(() => {
      updateInput(getWorldIdInput(), "2001");
    });

    expect(getWorldIdInput().value).toBe("2001");
  });

  it("loads a snapshot and shows all castles when own guild ID is empty", async () => {
    const deferred = createDeferred<GvgSnapshot>();
    const loadSnapshot = vi.fn(() => deferred.promise);
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(loadSnapshot).toHaveBeenCalledWith("1001");
    expect(document.body.textContent).toContain("取得中です。");
    expect(getSubmitButton().disabled).toBe(true);

    await act(async () => {
      deferred.resolve(snapshot);
      await deferred.promise;
    });

    expect(document.body.textContent).toContain("取得結果");
    expect(document.body.textContent).toContain("自ギルドが未指定のため、全拠点を表示しています。");
    expect(document.body.textContent).toContain("表示モード全拠点");
    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999001 (1)", "Owner Guild (1)"]);
    expect(getRenderedCastleIds()).toEqual(["1", "2"]);
  });

  it("selects a guild candidate by guildId", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });

    expect(getOwnGuildIdInput().value).toBe(ownGuildId);
    expect(document.body.textContent).toContain("指定ギルドの防衛拠点のみ表示しています。");
    expect(getRenderedCastleIds()).toEqual(["1"]);
  });

  it("shows only owned castles when own guild ID matches", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });

    expect(document.body.textContent).toContain("Owner Guild");
    expect(document.body.textContent).toContain("指定ギルドの防衛拠点のみ表示しています。");
    expect(document.body.textContent).toContain("表示モード指定ギルドのみ");
    expect(document.body.textContent).toContain("最優先 / 侵攻中");
    expect(document.body.textContent).toContain("Attack Guild");
    expect(getRenderedCastleIds()).toEqual(["1"]);
  });

  it("falls back to all castles when own guild ID has no owned castles", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), "111111111001");
    });

    expect(document.body.textContent).toContain(
      "指定されたギルドの防衛拠点が見つからないため、全拠点を表示しています。"
    );
    expect(getRenderedCastleIds()).toEqual(["1", "2"]);
  });

  it("shows summary counts and Japanese alert labels", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(document.body.textContent).toContain("表示対象2");
    expect(document.body.textContent).toContain("安全1");
    expect(document.body.textContent).toContain("最優先1");
    expect(document.body.textContent).toContain("最優先 / 侵攻中");
  });

  it("keeps castle ID order by default and can sort by alert level", async () => {
    const sortSnapshot = {
      ...snapshot,
      castles: [
        { ...snapshot.castles[0], castleId: "1" as GvgCastleId, attackCount: 0, defenseCount: 40 },
        { ...snapshot.castles[1], castleId: "2" as GvgCastleId, attackCount: 1, defenseCount: 40 }
      ]
    } satisfies GvgSnapshot;
    const loadSnapshot = vi.fn(() => Promise.resolve(sortSnapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(getRenderedCastleIds()).toEqual(["1", "2"]);

    await act(async () => {
      updateSelect(getSortSelect(), "alertLevel");
    });

    expect(getRenderedCastleIds()).toEqual(["2", "1"]);
  });

  it("renders a compact error message", async () => {
    const loadSnapshot = vi.fn(() => Promise.reject(new Error("HTTP 500")));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(document.body.textContent).toContain("HTTP 500");
  });

  it("starts realtime monitoring and rerenders owned castles after payload update", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(loadSnapshot, () => realtimeClient);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickButtonByText("監視開始");

    expect(document.body.textContent).toContain("接続状態: 接続中");
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ defenseCount: 12, attackCount: 0 }));
    });

    expect(document.body.textContent).toContain("危険");
    expect(document.body.textContent).toContain("12");
  });

  it("shows alert threshold helper text and boundaries", () => {
    renderComponent();

    expect(document.body.textContent).toContain("防衛数が設定値を下回ると警告されます。");
    expect(document.body.textContent).toContain("例: 注意が30の場合、防衛29以下で注意です。");
    expect(document.body.textContent).toContain("注意: 30未満");
    expect(document.body.textContent).toContain("危険: 15未満");
    expect(document.body.textContent).toContain("最優先: 10未満");
    expect(document.body.textContent).toContain("侵攻中は防衛数に関係なく最優先表示されます。");
    expect(document.body.textContent).toContain("初期値: 注意30 / 危険15 / 最優先10");
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
    const loadSnapshot = vi.fn(() => Promise.resolve(thresholdSnapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();
    expect(document.body.textContent).toContain("注意");

    await act(async () => {
      updateInput(getThresholdInputs()[0], "20");
    });

    expect(document.body.textContent).toContain("安全");
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
    await clickButtonByText("デフォルトに戻す");

    expect(getThresholdInputs().map((input) => input.value)).toEqual(["30", "15", "10"]);
    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":30'
    );
  });

  it("uses changed thresholds after realtime updates", async () => {
    const thresholdSnapshot = {
      ...snapshot,
      castles: [{ ...snapshot.castles[0], attackCount: 0, defenseCount: 40 }]
    } satisfies GvgSnapshot;
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(thresholdSnapshot)), () => realtimeClient);

    await clickSubmitButton();
    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });
    await act(async () => {
      updateInput(getThresholdInputs()[0], "20");
    });
    await clickButtonByText("監視開始");
    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ defenseCount: 25, attackCount: 0 }));
    });

    expect(document.body.textContent).toContain("安全");
  });

  it("updates guild candidates after realtime snapshot updates", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(loadSnapshot, () => realtimeClient);

    await clickSubmitButton();

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });
    await clickButtonByText("監視開始");

    await act(async () => {
      realtimeClient.emitPayload(createCastleStatusBytes({ guildId: 123456789, defenseCount: 25 }));
    });

    expect(getGuildSelectOptions()).toContain("Attack Guild (1)");
    expect(getRenderedCastleIds()).toEqual(["1", "2"]);
  });

  it("stops realtime monitoring safely", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(loadSnapshot, () => realtimeClient);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });
    await clickButtonByText("監視停止");
    await clickButtonByText("監視開始");
    await clickButtonByText("監視開始");
    await clickButtonByText("監視停止");

    expect(document.body.textContent).toContain("接続状態: 切断");
    expect(realtimeClient.subscriptions).toHaveLength(1);
    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);
  });

  it("shows disconnected after socket close and reconnects manually", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const firstClient = new MockGvgRealtimeClient();
    const secondClient = new MockGvgRealtimeClient();
    const realtimeClients = [firstClient, secondClient];
    renderComponent(loadSnapshot, () => {
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
    await clickButtonByText("監視開始");

    act(() => {
      firstClient.disconnect("socket closed");
    });

    expect(document.body.textContent).toContain("接続状態: 切断");

    await clickButtonByText("再接続");

    expect(firstClient.sentUnsubscriptions).toHaveLength(1);
    expect(secondClient.subscriptions).toHaveLength(1);
    expect(document.body.textContent).toContain("接続状態: 接続中");
  });

  it("shows error and can reconnect manually", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const firstClient = new MockGvgRealtimeClient();
    const secondClient = new MockGvgRealtimeClient();
    const clients = [firstClient, secondClient];
    renderComponent(loadSnapshot, () => {
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
    await clickButtonByText("監視開始");

    act(() => {
      firstClient.emitError(new Error("socket failed"));
    });

    expect(document.body.textContent).toContain("接続状態: エラー");
    expect(document.body.textContent).toContain("接続エラーが発生しました");

    await clickButtonByText("再接続");

    expect(secondClient.subscriptions).toHaveLength(1);
    expect(document.body.textContent).toContain("接続状態: 接続中");
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

function getRenderedCastleIds() {
  return Array.from(document.querySelectorAll<HTMLDivElement>(".castle-list__row")).map(
    (row) => row.querySelector("span")?.textContent ?? ""
  );
}

async function clickButtonByText(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label
  );

  if (!button) {
    throw new Error(`button was not found: ${label}`);
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
