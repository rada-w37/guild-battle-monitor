import { describe, expect, it } from "vitest";
import type { GvgCastleState, GvgGuildId } from "../gvg/types";
import {
  getBattleMonitorDisplayGuildSides,
  getGvgCastleStateGuildRelation
} from "./guildRelation";

const selectedGuildId = "123" as GvgGuildId;
const otherGuildId = "456" as GvgGuildId;
const currentTime = new Date("2026-05-27T12:29:50.000Z");

describe("getGvgCastleStateGuildRelation", () => {
  it("keeps owner as display defense and attacker as display attack before fallen", () => {
    expect(
      getBattleMonitorDisplayGuildSides({
        ownerGuildId: selectedGuildId,
        attackerGuildId: otherGuildId,
        state: "inBattle"
      })
    ).toEqual({
      displayDefenseGuildId: selectedGuildId,
      displayAttackGuildId: otherGuildId
    });
  });

  it("swaps display defense and display attack after fallen", () => {
    expect(
      getBattleMonitorDisplayGuildSides({
        ownerGuildId: selectedGuildId,
        attackerGuildId: otherGuildId,
        state: "fallen"
      })
    ).toEqual({
      displayDefenseGuildId: otherGuildId,
      displayAttackGuildId: selectedGuildId
    });
  });

  it("maps owner guild states to GvgCastleState synced relations", () => {
    expectOwnerRelations([
      ["idle", "securedDefense"],
      ["inBattle", "defense"],
      ["fallen", "attack"],
      ["counterattack", "attack"],
      ["counterattackSuccessful", "securedDefense"]
    ]);
  });

  it("marks fallen owner guild relation disabled after defense count exceeds remaining seconds", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: otherGuildId,
          defenseCount: 11,
          state: "fallen"
        },
        selectedGuildId,
        currentTime
      )
    ).toBe("attackDisabled");
  });

  it("maps attacker guild states to GvgCastleState synced relations", () => {
    expectAttackerRelations([
      ["idle", "attack"],
      ["inBattle", "attack"],
      ["fallen", "defense"],
      ["counterattack", "defense"],
      ["counterattackSuccessful", "defenseDisabled"]
    ]);
  });

  it("marks successful attacker guild relation secured after defense count exceeds remaining seconds", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: otherGuildId,
          attackerGuildId: selectedGuildId,
          defenseCount: 11,
          state: "fallen"
        },
        selectedGuildId,
        currentTime
      )
    ).toBe("securedDefense");

    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: otherGuildId,
          attackerGuildId: selectedGuildId,
          defenseCount: 11,
          state: "counterattack"
        },
        selectedGuildId,
        currentTime
      )
    ).toBe("securedDefense");
  });

  it("prioritizes attacker match when both guild IDs match", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: selectedGuildId,
          defenseCount: 10,
          state: "counterattackSuccessful"
        },
        selectedGuildId,
        currentTime
      )
    ).toBe("defenseDisabled");
  });

  it("keeps all castle view without relation", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: null,
          defenseCount: 10,
          state: "inBattle"
        },
        "",
        currentTime
      )
    ).toBe("none");
  });
});

function expectOwnerRelations(
  cases: readonly [GvgCastleState, ReturnType<typeof getGvgCastleStateGuildRelation>][]
): void {
  for (const [state, expectedRelation] of cases) {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: otherGuildId,
          defenseCount: 10,
          state
        },
        selectedGuildId,
        currentTime
      )
    ).toBe(expectedRelation);
  }
}

function expectAttackerRelations(
  cases: readonly [GvgCastleState, ReturnType<typeof getGvgCastleStateGuildRelation>][]
): void {
  for (const [state, expectedRelation] of cases) {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: otherGuildId,
          attackerGuildId: selectedGuildId,
          defenseCount: 10,
          state
        },
        selectedGuildId,
        currentTime
      )
    ).toBe(expectedRelation);
  }
}
