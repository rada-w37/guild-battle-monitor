import { describe, expect, it } from "vitest";
import type { GvgCastleState, GvgGuildId } from "../gvg/types";
import { getGvgCastleStateGuildRelation } from "./guildRelation";

const selectedGuildId = "123" as GvgGuildId;
const otherGuildId = "456" as GvgGuildId;

describe("getGvgCastleStateGuildRelation", () => {
  it("maps owner guild states to GvgCastleState synced relations", () => {
    expectOwnerRelations([
      ["idle", "securedDefense"],
      ["inBattle", "defense"],
      ["fallen", "attackDisabled"],
      ["counterattack", "attack"],
      ["counterattackSuccessful", "securedDefense"]
    ]);
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

  it("prioritizes attacker match when both guild IDs match", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: selectedGuildId,
          state: "counterattackSuccessful"
        },
        selectedGuildId
      )
    ).toBe("defenseDisabled");
  });

  it("keeps all castle view without relation", () => {
    expect(
      getGvgCastleStateGuildRelation(
        {
          ownerGuildId: selectedGuildId,
          attackerGuildId: null,
          state: "inBattle"
        },
        ""
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
          state
        },
        selectedGuildId
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
          state
        },
        selectedGuildId
      )
    ).toBe(expectedRelation);
  }
}
