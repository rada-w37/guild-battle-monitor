import { describe, expect, it } from "vitest";
import { hasNonAttackingTargetWarning, moveDetailConditionNode } from "./notificationDetailConditions";
import type { NotificationDetailConditionRoot } from "./types";

describe("notification detail condition warning", () => {
  it("does not warn when every root child requires at least one attack", () => {
    expect(
      hasNonAttackingTargetWarning(
        createRoot([
          {
            type: "group",
            operator: "AND",
            children: [
              { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
              { type: "condition", field: "attackCount", operator: ">=", value: 1 }
            ]
          },
          { type: "condition", field: "attackCount", operator: ">=", value: 1 }
        ])
      )
    ).toBe(false);
  });

  it("warns when a root child can match with zero attacks", () => {
    expect(
      hasNonAttackingTargetWarning(
        createRoot([
          {
            type: "group",
            operator: "AND",
            children: [
              { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
              { type: "condition", field: "attackCount", operator: ">=", value: 1 }
            ]
          },
          { type: "condition", field: "defenseCount", operator: "<=", value: 10 }
        ])
      )
    ).toBe(true);
  });

  it("treats an AND group as safe when any child cannot match at zero attacks", () => {
    expect(
      hasNonAttackingTargetWarning(
        createRoot([
          {
            type: "group",
            operator: "AND",
            children: [
              { type: "condition", field: "defenseCount", operator: "<=", value: 0 },
              { type: "condition", field: "attackCount", operator: ">=", value: 5 }
            ]
          }
        ])
      )
    ).toBe(false);
  });

  it("treats an OR group as safe only when all children cannot match at zero attacks", () => {
    expect(
      hasNonAttackingTargetWarning(
        createRoot([
          {
            type: "group",
            operator: "OR",
            children: [
              { type: "condition", field: "attackCount", operator: ">=", value: 1 },
              { type: "condition", field: "attackCount", operator: ">=", value: 5 }
            ]
          }
        ])
      )
    ).toBe(false);

    expect(
      hasNonAttackingTargetWarning(
        createRoot([
          {
            type: "group",
            operator: "OR",
            children: [
              { type: "condition", field: "attackCount", operator: ">=", value: 1 },
              { type: "condition", field: "defenseCount", operator: "<=", value: 10 }
            ]
          }
        ])
      )
    ).toBe(true);
  });
});

describe("notification detail condition ordering", () => {
  it("moves root children to the requested insertion index", () => {
    const root = createRoot([
      { type: "condition", field: "defenseCount", operator: "<=", value: 10 },
      { type: "condition", field: "attackCount", operator: ">=", value: 1 },
      { type: "condition", field: "defenseCount", operator: "<=", value: 30 }
    ]);

    expect(
      moveDetailConditionNode(root, { scope: "root", index: 0 }, { scope: "root", index: 3 }).children
    ).toEqual([
      { type: "condition", field: "attackCount", operator: ">=", value: 1 },
      { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
      { type: "condition", field: "defenseCount", operator: "<=", value: 10 }
    ]);
  });

  it("moves conditions inside the same group", () => {
    const root = createRoot([
      {
        type: "group",
        operator: "AND",
        children: [
          { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
          { type: "condition", field: "attackCount", operator: ">=", value: 1 },
          { type: "condition", field: "defenseCount", operator: "<=", value: 10 }
        ]
      }
    ]);

    const movedRoot = moveDetailConditionNode(
      root,
      { scope: "group", groupIndex: 0, conditionIndex: 2 },
      { scope: "group", groupIndex: 0, index: 0 }
    );

    expect(movedRoot.children[0]).toMatchObject({
      type: "group",
      children: [
        { type: "condition", field: "defenseCount", operator: "<=", value: 10 },
        { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
        { type: "condition", field: "attackCount", operator: ">=", value: 1 }
      ]
    });
  });

  it("ignores cross-scope moves", () => {
    const root = createRoot([
      { type: "condition", field: "defenseCount", operator: "<=", value: 10 },
      {
        type: "group",
        operator: "AND",
        children: [{ type: "condition", field: "attackCount", operator: ">=", value: 1 }]
      }
    ]);

    expect(
      moveDetailConditionNode(
        root,
        { scope: "root", index: 0 },
        { scope: "group", groupIndex: 1, index: 0 }
      )
    ).toBe(root);
  });
});

function createRoot(children: NotificationDetailConditionRoot["children"]): NotificationDetailConditionRoot {
  return {
    operator: "OR",
    children
  };
}
