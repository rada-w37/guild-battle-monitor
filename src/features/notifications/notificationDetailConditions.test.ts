import { describe, expect, it } from "vitest";
import { hasNonAttackingTargetWarning } from "./notificationDetailConditions";
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

function createRoot(children: NotificationDetailConditionRoot["children"]): NotificationDetailConditionRoot {
  return {
    operator: "OR",
    children
  };
}
