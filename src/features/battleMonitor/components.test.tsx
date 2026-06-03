// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BattleMonitorCastleList } from "./components";
import type { BattleMonitorCastleViewModel } from "./types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("BattleMonitorCastleList", () => {
  it("renders attack relation as a single sword icon with attack label", () => {
    renderCastleList([
      {
        castleId: "1",
        castleName: "Attack Castle",
        guildRelation: "attack",
        ownerGuildName: "Owner",
        attackerGuildName: "Attacker",
        defenseCount: 10,
        attackCount: 1,
        isDefenseSecured: false,
        koDisplay: { count: 0, tone: "none" },
        alertLevel: "safe"
      }
    ]);

    const attackIcon = document.querySelector(".castle-list__relation-icon--attack");
    expect(attackIcon?.getAttribute("aria-label")).toBe("攻撃中");
    expect(attackIcon?.querySelectorAll("path")).toHaveLength(1);
    expect(attackIcon?.querySelector("path")?.getAttribute("d")).toBe(
      "M18.9 2.6 21.4 5l-8.7 8.7 1.8 1.8-1.7 1.7-2.4-2.4-5.6 5.6-2.2-2.2 5.6-5.6-2.4-2.4 1.7-1.7 1.8 1.8 8.6-8.7Z"
    );
  });
});

function renderCastleList(viewModels: readonly BattleMonitorCastleViewModel[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <BattleMonitorCastleList
        capturedAt="2026-05-27T00:00:00.000Z"
        isTestModeEnabled={false}
        showDevDetails={false}
        showOwnerGuild={false}
        viewModels={viewModels}
        onTestModeAttackIncrease={() => {}}
        onTestModeDefenseIncrease={() => {}}
        onTestModeRevive={() => {}}
      />
    );
  });
}
