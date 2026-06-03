// @vitest-environment jsdom
import { act } from "react";
import { readFileSync } from "node:fs";
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
  it("does not render relation column or legend for all castle view", () => {
    renderCastleList([
      createCastleViewModel({
        castleId: "1",
        guildRelation: "none",
        isDefenseSecured: true
      })
    ]);

    expect(document.querySelector(".castle-list--with-relation")).toBeNull();
    expect(document.querySelector(".castle-list__legend")).toBeNull();
    expect(document.querySelector(".castle-list__relation-icon")).toBeNull();
    expect(document.querySelector(".defense-secured-badge__tooltip")).toBeNull();
  });

  it("renders relation legend and secured defense as the row relation icon", () => {
    renderCastleList([
      createCastleViewModel({
        castleId: "1",
        guildRelation: "defense",
        isDefenseSecured: false
      }),
      createCastleViewModel({
        castleId: "2",
        guildRelation: "securedDefense",
        isDefenseSecured: true
      }),
      createCastleViewModel({
        castleId: "3",
        guildRelation: "attack",
        isDefenseSecured: false
      })
    ]);

    expect(document.querySelector(".castle-list__legend")?.textContent).toContain("防衛拠点");
    expect(document.querySelector(".castle-list__legend")?.textContent).toContain("防衛確定");
    expect(document.querySelector(".castle-list__legend")?.textContent).toContain("侵攻拠点");
    const defenseIcons = Array.from(document.querySelectorAll(".castle-list__relation-icon--defense"));
    expect(defenseIcons).toHaveLength(2);
    for (const defenseIcon of defenseIcons) {
      const defensePaths = Array.from(defenseIcon.querySelectorAll("path"));
      expect(defensePaths).toHaveLength(3);
      expect(defensePaths[0]?.getAttribute("fill")).toBe("#1f6feb");
      expect(defensePaths[0]?.getAttribute("d")).toContain("M12 4.4");
      expect(defensePaths[1]?.getAttribute("fill")).toBe("#bfdbfe");
      expect(defensePaths[1]?.getAttribute("d")).toContain("17.5 6.4");
    }
    expect(getCastleRows()[1].querySelector(".castle-list__relation-icon--secured")).not.toBeNull();
    expect(document.querySelector(".castle-list__relation-icon--secured")?.querySelectorAll("path")).toHaveLength(1);
    expect(document.querySelector(".castle-list__relation-icon--attack")?.querySelectorAll("path")).toHaveLength(2);
    expect(document.querySelector(".defense-secured-badge__tooltip")).toBeNull();
  });

  it("keeps relation legend outside the list border styling", () => {
    const styles = readFileSync("src/app/styles.css", "utf8");
    const legendRule = styles.match(/\\.castle-list__legend \\{(?<body>[\\s\\S]*?)\\}/)?.groups?.body ?? "";

    expect(legendRule).not.toContain("border");
    expect(legendRule).not.toContain("background");
    expect(legendRule).not.toContain("grid-column");
  });

  it("renders attack relation as the attached crossed swords icon with attack label", () => {
    renderCastleList([
      createCastleViewModel({
        castleId: "1",
        guildRelation: "attack",
        isDefenseSecured: false
      })
    ]);

    const attackIcons = Array.from(document.querySelectorAll(".castle-list__relation-icon--attack"));
    expect(attackIcons).toHaveLength(2);

    for (const attackIcon of attackIcons) {
      expect(attackIcon.getAttribute("aria-label")).toBe("侵攻拠点");
      expect(attackIcon.getAttribute("viewBox")).toBe("140 140 980 980");
      expect(attackIcon.querySelectorAll("path")).toHaveLength(2);
      expect(attackIcon.querySelector("path")?.getAttribute("fill")).toBe("#f2483a");
      expect(attackIcon.querySelector("path")?.getAttribute("d")).toContain("M 233 168");
    }
  });

  it("renders DEV details inside the DEV column", () => {
    renderCastleList(
      [
        createCastleViewModel({
          devDetails: {
            ownerGuild: "Owner Guild (123)",
            attackerGuild: "なし",
            selectedGuildName: "Owner Guild",
            relationType: "defense",
            castleState: "normal",
            gvgCastleState: "idle",
            defenseCount: 31,
            attackCount: 0
          }
        })
      ],
      { showDevDetails: true }
    );

    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("owner=Owner Guild (123)");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("attacker=なし");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("selected=Owner Guild");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("relationType=defense");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("castleState=normal");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("gvgCastleState=idle");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("defenseCount=31");
    expect(document.querySelector(".castle-list__dev-details")?.textContent).toContain("attackCount=0");
  });
});

function createCastleViewModel(
  overrides: Partial<BattleMonitorCastleViewModel> = {}
): BattleMonitorCastleViewModel {
  return {
    castleId: "1",
    castleName: "Castle",
    guildRelation: "none",
    ownerGuildName: "Owner",
    attackerGuildName: null,
    defenseCount: 10,
    attackCount: 0,
    isDefenseSecured: false,
    koDisplay: { count: 0, tone: "none" },
    alertLevel: "safe",
    ...overrides
  };
}

function renderCastleList(
  viewModels: readonly BattleMonitorCastleViewModel[],
  options: { readonly showDevDetails?: boolean } = {}
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <BattleMonitorCastleList
        capturedAt="2026-05-27T00:00:00.000Z"
        isTestModeEnabled={false}
        showDevDetails={options.showDevDetails ?? false}
        showOwnerGuild={false}
        viewModels={viewModels}
        onTestModeAttackIncrease={() => {}}
        onTestModeDefenseIncrease={() => {}}
        onTestModeRevive={() => {}}
      />
    );
  });
}

function getCastleRows() {
  return Array.from(document.querySelectorAll(".castle-list__row"));
}
