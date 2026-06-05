// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModeProvider } from "../../app/appMode";
import type {
  loadGrandBattleParticipantGuilds,
  loadGrandBattleSnapshot
} from "../grandBattle/grandBattleParticipantService";
import type { GrandBattleParticipantGuildCandidate, GrandBattleSnapshot } from "../grandBattle/types";
import type { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import { MockGvgRealtimeClient } from "../gvg/mockRealtimeClient";
import type { GvgRealtimeClient } from "../gvg/realtimeClientTypes";
import { buildGvgStreamId } from "../gvg/streamId";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY } from "./alertThresholdStorage";
import { GuildBattlePlaceholder, type OwnedGuildProfilePersistence } from "./GuildBattlePlaceholder";
import { GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY } from "./viewSettingsStorage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ownGuildId = "438130839037" as GvgGuildId;
const attackGuildId = "123456789037" as GvgGuildId;
const otherGuildId = "999999999037" as GvgGuildId;
const grandBattleParticipants = [
  { guildId: "111111111050" as GvgGuildId, guildName: "ギルドA" },
  { guildId: "222222222050" as GvgGuildId, guildName: "ギルドB" },
  { guildId: "333333333050" as GvgGuildId, guildName: "ギルドC" },
  { guildId: "444444444050" as GvgGuildId, guildName: "ギルドD" }
] satisfies readonly GrandBattleParticipantGuildCandidate[];

const grandBattleSnapshot = {
  source: {
    serverId: "japan",
    worldInput: "50",
    worldNumber: 50,
    classId: 3,
    blockId: 0
  },
  worldGroupId: 12,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [grandBattleParticipants[0].guildId]: "ギルドA",
    [grandBattleParticipants[1].guildId]: "ギルドB",
    [grandBattleParticipants[2].guildId]: "ギルドC",
    [grandBattleParticipants[3].guildId]: "ギルドD"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      state: "idle",
      ownerGuildId: grandBattleParticipants[0].guildId,
      attackerGuildId: grandBattleParticipants[1].guildId,
      defenseCount: 120,
      attackCount: 5,
      fallenAt: null,
      lastWinPartyKnockOutCount: 30,
      updatedAt: "2026-05-27T11:15:36.000Z"
    },
    {
      castleId: "2" as GvgCastleId,
      state: "idle",
      ownerGuildId: grandBattleParticipants[1].guildId,
      attackerGuildId: null,
      defenseCount: 80,
      attackCount: 0,
      fallenAt: null,
      lastWinPartyKnockOutCount: 0,
      updatedAt: "2026-05-27T11:15:36.000Z"
    }
  ]
} satisfies GrandBattleSnapshot;

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
    expect(document.body.textContent).toContain("Guild Battle Monitor");
  });

  it("shows mode tabs and starts in GuildBattle mode", () => {
    renderComponent();

    expect(getAppShell().dataset.mode).toBe("guild-battle");
    expect(getModeButton("Guild Battle").getAttribute("aria-pressed")).toBe("true");
    expect(getModeButton("Grand Battle").getAttribute("aria-pressed")).toBe("false");
    expect(getWorldInput()).not.toBeNull();
    expect(document.body.textContent).not.toContain("GrandBattleMonitor（準備中）");
    expect(getSettingsButton().disabled).toBe(false);
  });

  it("shows the GrandBattle setup UI and disables settings in GrandBattle mode", async () => {
    renderComponent();

    await clickButton("Grand Battle");

    expect(getAppShell().dataset.mode).toBe("grand-battle");
    expect(getModeButton("Guild Battle").getAttribute("aria-pressed")).toBe("false");
    expect(getModeButton("Grand Battle").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Grand Battle Monitor");
    expect(document.body.textContent).not.toContain("GrandBattleMonitor（準備中）");
    expect(document.body.textContent).toContain("監視条件");
    expect(document.body.textContent).toContain("参加ギルド");
    expect(getGrandBattleSelect("サーバー").value).toBe("japan");
    expect(getGrandBattleWorldInput().value).toBe("");
    expect(getGrandBattleSelect("クラス").value).toBe("3");
    expect(getGrandBattleSelect("ブロック").value).toBe("0");
    expect(getGrandBattleUpdateButton().disabled).toBe(true);
    expect(document.querySelector(".startup-panel")).toBeNull();
    expect(getSettingsButton().disabled).toBe(false);

    await clickSettingsButton();
    expect(getSettingsDialog()).not.toBeNull();
    expect(document.querySelector(".auto-update-toggle")).not.toBeNull();
    expect(document.querySelector(".sort-toggle")).toBeNull();
    expect(document.querySelector(".test-mode-settings")).toBeNull();
  });

  it("loads GrandBattle participant guilds from restored world when opening GrandBattle mode", async () => {
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "50",
        selectedGuildId: "",
        sortByAlert: false,
        autoUpdate: true
      })
    );
    renderComponent(undefined, undefined, loadGrandBattleParticipants);

    await clickButton("Grand Battle");

    expect(getGrandBattleWorldInput().value).toBe("50");
    expect(loadGrandBattleParticipants).toHaveBeenCalledWith({
      serverId: "japan",
      worldInput: "50",
      worldNumber: 50,
      classId: 3,
      blockId: 0
    });
    expect(getGrandBattleParticipantNames()).toEqual(
      grandBattleParticipants.map((participant) => participant.guildName)
    );
    expect(getGrandBattleUpdateButton().disabled).toBe(false);
  });

  it("shows all GrandBattle class options", async () => {
    renderComponent();

    await clickButton("Grand Battle");

    expect(getSelectOptions(getGrandBattleSelect("クラス"))).toEqual([
      "グランドマスター",
      "エキスパート",
      "エリート"
    ]);
    expect(Array.from(getGrandBattleSelect("クラス").options).map((option) => option.value)).toEqual([
      "3",
      "2",
      "1"
    ]);
  });

  it("returns to GuildBattle mode with the existing UI and settings enabled", async () => {
    renderComponent();

    await clickButton("Grand Battle");
    await clickButton("Guild Battle");

    expect(getAppShell().dataset.mode).toBe("guild-battle");
    expect(getModeButton("Guild Battle").getAttribute("aria-pressed")).toBe("true");
    expect(getWorldInput()).not.toBeNull();
    expect(getSettingsButton().disabled).toBe(false);

    await clickSettingsButton();
    expect(getSettingsDialog()).not.toBeNull();
  });

  it("loads GrandBattle participant guilds when world is committed and applies the candidate source", async () => {
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    renderComponent(undefined, undefined, loadGrandBattleParticipants);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await flushPromises();
    expect(loadGrandBattleParticipants).not.toHaveBeenCalled();

    await commitGrandBattleWorldWithKey("Enter");

    expect(loadGrandBattleParticipants).toHaveBeenCalledWith({
      serverId: "japan",
      worldInput: "50",
      worldNumber: 50,
      classId: 3,
      blockId: 0
    });
    expect(getGrandBattleParticipantNames()).toEqual(["ギルドA", "ギルドB", "ギルドC", "ギルドD"]);
    expect(getStoredViewSettings().world).toBe("50");
    expect(getGrandBattleUpdateButton().disabled).toBe(false);

    await clickGrandBattleUpdateButton();

    expect(getGrandBattleUpdateButton().disabled).toBe(true);
  });

  it("loads GrandBattle participant guilds on select changes after world is committed", async () => {
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    renderComponent(undefined, undefined, loadGrandBattleParticipants);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");

    await act(async () => {
      updateSelect(getGrandBattleSelect("クラス"), "2");
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      updateSelect(getGrandBattleSelect("ブロック"), "1");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadGrandBattleParticipants).toHaveBeenLastCalledWith({
      serverId: "japan",
      worldInput: "50",
      worldNumber: 50,
      classId: 2,
      blockId: 1
    });
  });

  it("keeps previous GrandBattle participant guilds visible while loading new candidates", async () => {
    const nextParticipants = grandBattleParticipants.map((participant, index) => ({
      ...participant,
      guildName: `次候補${index + 1}`
    }));
    const deferredParticipants = createDeferred<readonly GrandBattleParticipantGuildCandidate[]>();
    const loadGrandBattleParticipants = vi
      .fn<typeof loadGrandBattleParticipantGuilds>()
      .mockResolvedValueOnce(grandBattleParticipants)
      .mockReturnValueOnce(deferredParticipants.promise);
    renderComponent(undefined, undefined, loadGrandBattleParticipants);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    expect(getGrandBattleParticipantNames()).toEqual(["ギルドA", "ギルドB", "ギルドC", "ギルドD"]);

    await act(async () => {
      updateSelect(getGrandBattleSelect("ブロック"), "1");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getGrandBattleParticipantNames()).toEqual(["ギルドA", "ギルドB", "ギルドC", "ギルドD"]);
    expect(getGrandBattleUpdateButton().disabled).toBe(true);

    await act(async () => {
      deferredParticipants.resolve(nextParticipants);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getGrandBattleParticipantNames()).toEqual(["次候補1", "次候補2", "次候補3", "次候補4"]);
    expect(getGrandBattleUpdateButton().disabled).toBe(false);
  });

  it("shows GrandBattle loading, error, and fewer than four participant guilds without starting monitoring", async () => {
    const loadGrandBattleParticipants = vi
      .fn<typeof loadGrandBattleParticipantGuilds>()
      .mockRejectedValueOnce(new Error("参加ギルド候補の取得に失敗しました。"))
      .mockResolvedValueOnce(grandBattleParticipants.slice(0, 2));
    renderComponent(undefined, undefined, loadGrandBattleParticipants);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");

    expect(document.body.textContent).toContain("参加ギルド候補の取得に失敗しました。");
    expect(getGrandBattleUpdateButton().disabled).toBe(true);
    expect(document.querySelector(".castle-list")).toBeNull();

    await commitGrandBattleWorldWithKey("Enter");

    expect(getGrandBattleParticipantNames()).toEqual(["ギルドA", "ギルドB"]);
    expect(getGrandBattleUpdateButton().disabled).toBe(false);
    expect(document.querySelector(".castle-list")).toBeNull();
  });

  it("loads and renders the GrandBattle snapshot after applying the source", async () => {
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    const loadGrandBattleLatestSnapshot = vi.fn(() => Promise.resolve(grandBattleSnapshot));
    renderComponent(undefined, undefined, loadGrandBattleParticipants, loadGrandBattleLatestSnapshot);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();

    expect(loadGrandBattleLatestSnapshot).toHaveBeenCalledWith({
      serverId: "japan",
      worldInput: "50",
      worldNumber: 50,
      classId: 3,
      blockId: 0
    });
    expect(document.body.textContent).toContain("拠点監視");
    expect(document.body.textContent).toContain("更新: 2026-05-27T11:15:36.000Z");
    expect(getGuildSelectOptions()).toEqual([
      "全拠点表示",
      "ギルドA (1)",
      "ギルドB (1)",
      "ギルドC (0)",
      "ギルドD (0)"
    ]);
    expect(document.querySelector(".castle-list--with-owner")).not.toBeNull();
    expect(getRenderedCastleLabels()).toEqual(["アイン", "イエソド"]);
    expect(getCastleRows()[0].querySelector("[data-label='防']")?.textContent).toBe("120");
    expect(getCastleRows()[0].querySelector("[data-label='攻']")?.textContent).toBe("5");
    expect(getCastleRows()[0].querySelector(".castle-list__ko")?.textContent).toBe("30");
    expect(document.body.textContent).toContain("ギルドA");
    expect(document.body.textContent).toContain("ギルドB");

    await act(async () => {
      updateSelect(getGuildSelect(), grandBattleParticipants[0].guildId);
    });

    expect(document.querySelector(".castle-list--with-owner")).toBeNull();
    expect(getRenderedCastleLabels()).toEqual(["アイン"]);
  });

  it("updates the GrandBattle snapshot list from realtime payloads", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    const loadGrandBattleLatestSnapshot = vi.fn(() => Promise.resolve(grandBattleSnapshot));
    renderComponent(
      undefined,
      () => realtimeClient,
      loadGrandBattleParticipants,
      loadGrandBattleLatestSnapshot
    );

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();

    expect(realtimeClient.subscriptions).toHaveLength(1);

    await act(async () => {
      realtimeClient.emitPayload(
        createGrandBattleCastleStatusBytes({
          castleId: 1,
          guildId: 333333333,
          attackerGuildId: 222222222,
          defenseCount: 66,
          attackCount: 7,
          lastWinPartyKnockOutCount: 10
        })
      );
      await Promise.resolve();
    });

    expect(getCastleRows()[0].querySelector("[data-label='防']")?.textContent).toBe("66");
    expect(getCastleRows()[0].querySelector("[data-label='攻']")?.textContent).toBe("7");
    expect(getCastleRows()[0].querySelector(".castle-list__ko")?.textContent).toBe("10");
    expect(getCastleListText()).toContain("ギルドC");

    await act(async () => {
      realtimeClient.emitPayload(
        createGrandBattleCastleStatusBytes({
          castleId: 1,
          guildId: 333333333,
          attackerGuildId: 222222222,
          defenseCount: 9,
          attackCount: 7,
          lastWinPartyKnockOutCount: 10
        })
      );
      await Promise.resolve();
    });

    expect(getCastleRows()[0].classList.contains("castle-list__row--critical")).toBe(true);
  });

  it("does not start GrandBattle realtime when auto update is off", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "50",
        selectedGuildId: "",
        sortByAlert: false,
        autoUpdate: false
      })
    );
    renderComponent(undefined, () => realtimeClient);

    await clickButton("Grand Battle");
    await clickGrandBattleUpdateButton();

    expect(realtimeClient.subscriptions).toHaveLength(0);
    expect(getConnectionIndicator().classList.contains("connection-indicator--disabled")).toBe(true);
  });

  it("toggles GrandBattle auto update from the common settings dialog", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "50",
        selectedGuildId: "",
        sortByAlert: false,
        autoUpdate: false
      })
    );
    renderComponent(undefined, () => realtimeClient);

    await clickButton("Grand Battle");
    await clickGrandBattleUpdateButton();
    expect(realtimeClient.subscriptions).toHaveLength(0);

    await clickSettingsButton();
    await clickButton("OFF");

    expect(getStoredViewSettings().autoUpdate).toBe(true);
    expect(realtimeClient.subscriptions).toHaveLength(1);
  });

  it("stops GrandBattle realtime when auto update is turned off", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(undefined, () => realtimeClient);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await clickSettingsButton();
    await clickButton("ON");

    expect(getStoredViewSettings().autoUpdate).toBe(false);
    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);
    expect(getConnectionIndicator().classList.contains("connection-indicator--disabled")).toBe(true);
  });

  it("shows GrandBattle snapshot errors without clearing participant candidates", async () => {
    const loadGrandBattleParticipants = vi.fn(() => Promise.resolve(grandBattleParticipants));
    const loadGrandBattleLatestSnapshot = vi
      .fn<typeof loadGrandBattleSnapshot>()
      .mockRejectedValue(new Error("GrandBattle snapshotの取得に失敗しました。"));
    renderComponent(undefined, undefined, loadGrandBattleParticipants, loadGrandBattleLatestSnapshot);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();

    expect(document.body.textContent).toContain("GrandBattle snapshotの取得に失敗しました。");
    expect(getGrandBattleParticipantNames()).toEqual(["ギルドA", "ギルドB", "ギルドC", "ギルドD"]);
    expect(document.querySelector(".castle-list")).toBeNull();
  });

  it("keeps the current GrandBattle list visible while refreshing a later snapshot", async () => {
    const nextSnapshot = {
      ...grandBattleSnapshot,
      source: {
        ...grandBattleSnapshot.source,
        blockId: 1 as const
      },
      capturedAt: "2026-05-27T11:20:36.000Z",
      castles: [
        {
          ...grandBattleSnapshot.castles[0],
          defenseCount: 55
        }
      ]
    } satisfies GrandBattleSnapshot;
    const deferredSnapshot = createDeferred<GrandBattleSnapshot>();
    const loadGrandBattleLatestSnapshot = vi
      .fn<typeof loadGrandBattleSnapshot>()
      .mockResolvedValueOnce(grandBattleSnapshot)
      .mockReturnValueOnce(deferredSnapshot.promise);
    renderComponent(undefined, undefined, undefined, loadGrandBattleLatestSnapshot);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();
    expect(getRenderedCastleLabels()).toEqual(["アイン", "イエソド"]);

    await act(async () => {
      updateSelect(getGrandBattleSelect("ブロック"), "1");
      await Promise.resolve();
      await Promise.resolve();
    });
    await clickGrandBattleUpdateButton();

    expect(getRenderedCastleLabels()).toEqual(["アイン", "イエソド"]);
    expect(getCastleRows()[0].querySelector("[data-label='防']")?.textContent).toBe("120");

    await act(async () => {
      deferredSnapshot.resolve(nextSnapshot);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getRenderedCastleLabels()).toEqual(["アイン"]);
    expect(getCastleRows()[0].querySelector("[data-label='防']")?.textContent).toBe("55");
  });

  it("stops GuildBattle realtime when switching to GrandBattle", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    await loadWorld37();
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await clickButton("Grand Battle");

    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);
    expect(realtimeClient.state).toEqual({ status: "disconnected", reason: "mode changed to grand battle" });
  });

  it("disposes GrandBattle realtime when switching to GuildBattle", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(undefined, () => realtimeClient);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await clickButton("Guild Battle");

    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);
    expect(realtimeClient.state).toEqual({ status: "disconnected", reason: "mode changed to guild battle" });
  });

  it("restarts GrandBattle realtime on mode return when auto update is on and a snapshot exists", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    renderComponent(undefined, () => realtimeClient);

    await clickButton("Grand Battle");
    act(() => {
      updateInput(getGrandBattleWorldInput(), "50");
    });
    await commitGrandBattleWorldWithKey("Enter");
    await clickGrandBattleUpdateButton();
    expect(realtimeClient.subscriptions).toHaveLength(1);

    await clickButton("Guild Battle");
    expect(realtimeClient.sentUnsubscriptions).toHaveLength(1);

    await clickButton("Grand Battle");

    expect(realtimeClient.subscriptions).toHaveLength(2);
    expect(realtimeClient.state).toEqual({ status: "connected" });
  });

  it("restores world, sort, auto update, and selected guild from localStorage", async () => {
    const realtimeClient = new MockGvgRealtimeClient();
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "37",
        selectedGuildId: ownGuildId,
        sortByAlert: true,
        autoUpdate: false
      })
    );
    renderComponent(vi.fn(() => Promise.resolve(snapshot)), () => realtimeClient);

    expect(getWorldInput().value).toBe("37");
    await clickButton("更新");

    expect(getGuildSelect().value).toBe(ownGuildId);
    expect(getRenderedCastleLabels()).toEqual(["ブラッセル"]);
    expect(realtimeClient.subscriptions).toHaveLength(0);

    await clickSettingsButton();
    expect(getDangerSortCheckbox().checked).toBe(true);
    expect(getAutoUpdateButton().textContent).toBe("OFF");
  });

  it("falls back to all castles when restored selected guild is not available", async () => {
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "37",
        selectedGuildId: "missing-guild",
        sortByAlert: false,
        autoUpdate: false
      })
    );
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickButton("更新");

    expect(getGuildSelect().value).toBe("");
    expect(document.querySelector(".castle-list--with-owner")).not.toBeNull();
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

  it("renders optional notification settings collapsed between auto update and test mode", async () => {
    renderComponent(undefined, undefined, undefined, undefined, <div data-testid="notification-slot">Discord通知</div>);

    await clickSettingsButton();

    const notificationSettings = getSettingsDialog().querySelector<HTMLDetailsElement>(".notification-settings");
    const ownedGuildSettings = notificationSettings?.previousElementSibling;
    expect(notificationSettings?.open).toBe(false);
    expect(notificationSettings?.querySelector("[data-testid='notification-slot']")).not.toBeNull();
    expect(ownedGuildSettings?.classList.contains("owned-guild-settings")).toBe(true);
    expect(ownedGuildSettings?.previousElementSibling?.querySelector(".auto-update-toggle")).not.toBeNull();
    expect(notificationSettings?.nextElementSibling?.querySelector(".test-mode-settings")).not.toBeNull();
  });

  it("renders owned guild settings for owner mode collapsed by default", async () => {
    renderComponent();

    await clickSettingsButton();

    expect(getOwnedGuildSettings().open).toBe(false);
  });

  it.each(["/123/a_abc", "/123/g_abc"])("hides owned guild settings for shared route %s", async (pathname) => {
    renderComponent(undefined, undefined, undefined, undefined, undefined, pathname);

    await clickSettingsButton();

    expect(getSettingsDialog().querySelector(".owned-guild-settings")).toBeNull();
  });

  it("holds owned guild selection and resets it when world changes", async () => {
    renderComponent();
    await loadWorld37();
    await clickSettingsButton();

    const ownedGuildSettings = getOwnedGuildSettings();
    const worldInput = ownedGuildSettings.querySelector<HTMLInputElement>("input");
    const guildSelect = ownedGuildSettings.querySelector<HTMLSelectElement>("select");

    if (!worldInput || !guildSelect) {
      throw new Error("owned guild settings fields were not found");
    }

    await act(async () => {
      updateInput(worldInput, "37");
      await flushPromises();
    });

    act(() => {
      updateSelect(guildSelect, ownGuildId);
    });
    expect(guildSelect.value).toBe(ownGuildId);

    await act(async () => {
      updateInput(worldInput, "38");
      await flushPromises();
    });
    expect(guildSelect.value).toBe("");
  });

  it("keeps admin controls editable and uses the URL guild", async () => {
    window.localStorage.setItem(
      GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        world: "37",
        selectedGuildId: otherGuildId,
        sortByAlert: false,
        autoUpdate: true
      })
    );
    renderComponent(undefined, undefined, undefined, undefined, <div>notification</div>, `/${ownGuildId}/a_admin`);
    await loadWorld37();
    await clickSettingsButton();

    expect(getModeButton("Grand Battle").disabled).toBe(false);
    expect(getDangerSortCheckbox().disabled).toBe(false);
    expect(getAutoUpdateButton().disabled).toBe(false);
    expect(getSettingsDialog().querySelector(".alert-settings")).not.toBeNull();
    expect(getSettingsDialog().querySelector(".notification-settings")).not.toBeNull();
    expect(getSettingsDialog().querySelector(".owned-guild-settings")).toBeNull();
    expect(getSettingsDialog().querySelector(".share-settings")).toBeNull();
    expect(getGuildSelect().value).toBe(ownGuildId);
    expect(getGuildSelect().disabled).toBe(true);
  });

  it("keeps guest battle state read-only while allowing personal settings", async () => {
    renderComponent(undefined, undefined, undefined, undefined, <div>notification</div>, `/${ownGuildId}/g_guest`);
    await loadWorld37();
    await clickSettingsButton();

    expect(getModeButton("Guild Battle").disabled).toBe(true);
    expect(getModeButton("Grand Battle").disabled).toBe(true);
    expect(getGuildSelect().disabled).toBe(true);
    expect(getSettingsDialog().querySelector(".alert-settings")).not.toBeNull();
    expect(getThresholdInputs().every((input) => !input.disabled)).toBe(true);
    expect(getDangerSortCheckbox().disabled).toBe(false);
    expect(getAutoUpdateButton().disabled).toBe(false);
    expect(getSettingsDialog().querySelector(".notification-settings")).toBeNull();
    expect(getSettingsDialog().querySelector(".owned-guild-settings")).toBeNull();
    expect(getSettingsDialog().querySelector(".share-settings")).toBeNull();
    expect(getSettingsDialog().querySelector(".test-mode-settings")).toBeNull();

    await clickDangerSortCheckbox();
    expect(getStoredViewSettings().sortByAlert).toBe(true);

    const initialAutoUpdate = getAutoUpdateButton().textContent === "ON";
    await clickAutoUpdateButton();
    expect(getStoredViewSettings().autoUpdate).toBe(!initialAutoUpdate);

    act(() => {
      updateInput(getThresholdInputs()[0], "40");
    });
    await commitThresholdInputWithKey(0, "Enter");
    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":40'
    );
  });

  it("shows a missing guild message when the shared URL guild is not in the loaded snapshot", async () => {
    renderComponent(undefined, undefined, undefined, undefined, undefined, "/missing-guild/g_guest");

    await loadWorld37();

    expect(document.body.textContent).toContain("ギルドが見つかりません");
    expect(document.querySelector(".castle-list")).toBeNull();
  });

  it("reports the selected owned guild id and name for persistence", async () => {
    const onChange = vi.fn();
    const persistence = {
      isLoading: false,
      isSignedIn: true,
      profile: null,
      onChange
    } satisfies OwnedGuildProfilePersistence;
    renderComponent(undefined, undefined, undefined, undefined, undefined, "/app", persistence);
    await loadWorld37();
    await clickSettingsButton();

    const ownedGuildSettings = getOwnedGuildSettings();
    const worldInput = ownedGuildSettings.querySelector<HTMLInputElement>("input");
    const guildSelect = ownedGuildSettings.querySelector<HTMLSelectElement>("select");

    if (!worldInput || !guildSelect) {
      throw new Error("owned guild settings fields were not found");
    }

    await act(async () => {
      updateInput(worldInput, "37");
      await flushPromises();
    });
    onChange.mockClear();
    act(() => {
      updateSelect(guildSelect, ownGuildId);
    });

    expect(onChange).toHaveBeenCalledWith({
      worldId: 37,
      guildId: ownGuildId,
      guildName: "Owner Guild"
    });
  });

  it("loads guild candidates from the owned guild world setting and saves the selected guild", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    const onChange = vi.fn();
    const persistence = {
      isLoading: false,
      isSignedIn: true,
      profile: null,
      onChange
    } satisfies OwnedGuildProfilePersistence;
    renderComponent(loadSnapshot, undefined, undefined, undefined, undefined, "/app", persistence);
    await clickSettingsButton();

    const ownedGuildSettings = getOwnedGuildSettings();
    const worldInput = ownedGuildSettings.querySelector<HTMLInputElement>("input");
    const guildSelect = ownedGuildSettings.querySelector<HTMLSelectElement>("select");

    if (!worldInput || !guildSelect) {
      throw new Error("owned guild settings fields were not found");
    }

    await act(async () => {
      updateInput(worldInput, "37");
      await flushPromises();
    });

    expect(loadSnapshot).toHaveBeenCalledWith("1037");
    expect(Array.from(guildSelect.options).map((option) => option.textContent ?? "")).toContain("Owner Guild");
    expect(onChange).toHaveBeenLastCalledWith({
      worldId: 37,
      guildId: null,
      guildName: null
    });

    onChange.mockClear();
    await act(async () => {
      updateSelect(guildSelect, ownGuildId);
      await flushPromises();
    });

    expect(onChange).toHaveBeenCalledWith({
      worldId: 37,
      guildId: ownGuildId,
      guildName: "Owner Guild"
    });
  });

  it("toggles auto update inside the settings dialog", async () => {
    renderComponent();

    await clickSettingsButton();
    expect(getAutoUpdateButton().textContent).toBe("ON");
    await clickButton("ON");
    expect(getAutoUpdateButton().textContent).toBe("OFF");
    expect(getStoredViewSettings().autoUpdate).toBe(false);
    await clickButton("OFF");
    expect(getAutoUpdateButton().textContent).toBe("ON");
    expect(getStoredViewSettings().autoUpdate).toBe(true);
  });

  it("does not load while typing world and loads with the update button", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    act(() => {
      updateInput(getWorldInput(), "37");
    });
    await flushPromises();
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(getStoredViewSettings().world).toBe("37");

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

  it("places the display guild select just before the monitor list", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await loadWorld37();

    expect(document.querySelector(".guild-select-field .field__label")?.textContent).toBe("表示対象ギルド");
    expect(getGuildSelectOptions()).toEqual(["全拠点表示", "Guild 999999999037 (2)", "Owner Guild (1)"]);

    const guildSelect = document.querySelector(".guild-select-field");
    const castleList = document.querySelector(".castle-list");
    expect(guildSelect?.compareDocumentPosition(castleList as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      updateSelect(getGuildSelect(), ownGuildId);
    });

    expect(getStoredViewSettings().selectedGuildId).toBe(ownGuildId);
    expect(document.querySelector(".castle-list--with-owner")).toBeNull();
  });

  it("saves danger sort changes", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSettingsButton();
    await act(async () => {
      getDangerSortCheckbox().click();
    });

    expect(getStoredViewSettings().sortByAlert).toBe(true);
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

    document.querySelectorAll(".castle-list__dev-details").forEach((element) => element.remove());
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

    expect(getSettingsDialog().textContent ?? "").not.toContain("注意 > 危険 > 最優先");
    expect(getThresholdInputs()[1].value).toBe("30");

    await blurThresholdInput(1);

    expect(getThresholdInputs()[1].value).toBe("15");
  });

  it("saves threshold changes", async () => {
    renderComponent(vi.fn(() => Promise.resolve(snapshot)));

    await clickSettingsButton();
    act(() => {
      updateInput(getThresholdInputs()[0], "40");
    });
    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY) ?? "").not.toContain(
      '"warningDefenseCount":40'
    );
    await commitThresholdInputWithKey(0, "Enter");

    expect(window.localStorage.getItem(GUILD_BATTLE_ALERT_THRESHOLDS_STORAGE_KEY)).toContain(
      '"warningDefenseCount":40'
    );
    expect(window.localStorage.getItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY) ?? "").not.toContain(
      "warningDefenseCount"
    );
  });
});

function renderComponent(
  loadSnapshot: typeof loadLocalGvgSnapshot = vi.fn(() => Promise.resolve(snapshot)),
  createRealtimeClient: () => GvgRealtimeClient = () => new MockGvgRealtimeClient(),
  loadGrandBattleParticipants: typeof loadGrandBattleParticipantGuilds = vi.fn(() =>
    Promise.resolve(grandBattleParticipants)
  ),
  loadGrandBattleLatestSnapshot: typeof loadGrandBattleSnapshot = vi.fn(() =>
    Promise.resolve(grandBattleSnapshot)
  ),
  notificationSettings?: ReactNode,
  pathname: string = "/app",
  ownedGuildProfilePersistence?: OwnedGuildProfilePersistence
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <AppModeProvider pathname={pathname}>
        <GuildBattlePlaceholder
          loadSnapshot={loadSnapshot}
          loadGrandBattleParticipants={loadGrandBattleParticipants}
          loadGrandBattleLatestSnapshot={loadGrandBattleLatestSnapshot}
          createRealtimeClient={createRealtimeClient}
          notificationSettings={notificationSettings}
          ownedGuildProfilePersistence={ownedGuildProfilePersistence}
        />
      </AppModeProvider>
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

function getSettingsButton() {
  const button = document.querySelector<HTMLButtonElement>(".settings-button");

  if (!button) {
    throw new Error("settings button was not found");
  }

  return button;
}

function getModeButton(label: "Guild Battle" | "Grand Battle") {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-tabs__button")).find(
    (candidate) => candidate.textContent === label
  );

  if (!button) {
    throw new Error(`mode button was not found: ${label}`);
  }

  return button;
}

function getAppShell() {
  const appShell = document.querySelector<HTMLElement>(".app-shell");

  if (!appShell) {
    throw new Error("app shell was not found");
  }

  return appShell;
}

function getGrandBattleSelect(label: "サーバー" | "クラス" | "ブロック") {
  const field = Array.from(document.querySelectorAll<HTMLLabelElement>(".grand-battle-setup .field")).find(
    (candidate) => candidate.querySelector(".field__label")?.textContent === label
  );
  const select = field?.querySelector<HTMLSelectElement>("select");

  if (!select) {
    throw new Error(`GrandBattle select was not found: ${label}`);
  }

  return select;
}

function getGrandBattleWorldInput() {
  const field = Array.from(document.querySelectorAll<HTMLLabelElement>(".grand-battle-setup .field")).find(
    (candidate) => candidate.querySelector(".field__label")?.textContent === "ワールド"
  );
  const input = field?.querySelector<HTMLInputElement>("input");

  if (!input) {
    throw new Error("GrandBattle world input was not found");
  }

  return input;
}

function getGrandBattleUpdateButton() {
  const button = document.querySelector<HTMLButtonElement>(".grand-battle-setup__apply");

  if (!button) {
    throw new Error("GrandBattle update button was not found");
  }

  return button;
}

function getGrandBattleParticipantNames() {
  return Array.from(document.querySelectorAll<HTMLElement>(".grand-battle-participants__guild")).map(
    (candidate) => candidate.textContent ?? ""
  );
}

function getSelectOptions(select: HTMLSelectElement) {
  return Array.from(select.options).map((option) => option.textContent ?? "");
}

async function commitGrandBattleWorldWithKey(key: "Enter" | "Tab") {
  await act(async () => {
    getGrandBattleWorldInput().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickGrandBattleUpdateButton() {
  await act(async () => {
    getGrandBattleUpdateButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
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

async function clickAutoUpdateButton() {
  await act(async () => {
    getAutoUpdateButton().click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickDangerSortCheckbox() {
  await act(async () => {
    getDangerSortCheckbox().click();
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

function getOwnedGuildSettings() {
  const settings = getSettingsDialog().querySelector<HTMLDetailsElement>(".owned-guild-settings");

  if (!settings) {
    throw new Error("owned guild settings were not found");
  }

  return settings;
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

async function blurThresholdInput(index: number) {
  await act(async () => {
    getThresholdInputs()[index].dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await Promise.resolve();
  });
}

async function commitThresholdInputWithKey(index: number, key: "Enter" | "Tab") {
  await act(async () => {
    getThresholdInputs()[index].dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await Promise.resolve();
  });
}

function getAutoUpdateButton() {
  const button = getSettingsDialog().querySelector<HTMLButtonElement>(".auto-update-toggle");

  if (!button) {
    throw new Error("auto update toggle button was not found");
  }

  return button;
}

function getDangerSortCheckbox() {
  const checkbox = getSettingsDialog().querySelector<HTMLInputElement>(".sort-toggle input[type='checkbox']");

  if (!checkbox) {
    throw new Error("danger sort checkbox was not found");
  }

  return checkbox;
}

function getRenderedCastleLabels() {
  return getCastleRows().map((row) => row.querySelector(".castle-list__castle strong")?.textContent?.trim() ?? "");
}

function getCastleRows() {
  return Array.from(document.querySelectorAll<HTMLDivElement>(".castle-list__row"));
}

function getCastleListText() {
  return document.querySelector(".castle-list")?.textContent ?? "";
}

function getStoredViewSettings() {
  const storedValue = window.localStorage.getItem(GUILD_BATTLE_VIEW_SETTINGS_STORAGE_KEY);

  if (storedValue === null) {
    throw new Error("view settings were not saved");
  }

  return JSON.parse(storedValue) as {
    readonly world: string;
    readonly selectedGuildId: string;
    readonly sortByAlert: boolean;
    readonly autoUpdate: boolean;
  };
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
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

function createGrandBattleCastleStatusBytes({
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
        worldGroupId: 12,
        gvgClass: 3,
        worldId: 0
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
