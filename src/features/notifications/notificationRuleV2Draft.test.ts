import { describe, expect, it } from "vitest";
import {
  createDefaultNotificationRuleV2Draft,
  createLegacyNotificationRuleInputFromV2Draft,
  createNotificationRuleV2DraftFromLegacy
} from "./notificationRuleV2Draft";
import type { NotificationRule } from "./types";

describe("notification rule v2 draft", () => {
  it("creates the default detail condition group for new rules", () => {
    const draft = createDefaultNotificationRuleV2Draft("guildBattle", 2);

    expect(draft).toMatchObject({
      schemaVersion: 2,
      battleType: "guildBattle",
      battleSide: "defense",
      sortOrder: 2,
      detailConditions: {
        operator: "OR",
        children: [
          {
            type: "group",
            operator: "AND",
            children: [
              { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
              { type: "condition", field: "attackCount", operator: ">=", value: 1 }
            ]
          }
        ]
      }
    });
  });

  it("converts a legacy rule to a v2 draft without changing save behavior", () => {
    const legacyRule = createLegacyRule();
    const draft = createNotificationRuleV2DraftFromLegacy(legacyRule, 1);
    const legacyInput = createLegacyNotificationRuleInputFromV2Draft(draft);

    expect(draft).toMatchObject({
      schemaVersion: 2,
      battleSide: "defense",
      name: "終盤アラート",
      enabled: false,
      schedule: { startTime: "21:20", endTime: null }
    });
    expect(legacyInput).toEqual({
      battleType: "guildBattle",
      name: "終盤アラート",
      enabled: false,
      conditions: {
        startTime: "21:20",
        defenseCountMax: 28,
        attackCountMin: 3
      },
      message: legacyRule.message
    });
  });
});

function createLegacyRule(): NotificationRule {
  return {
    id: "rule-1",
    battleType: "guildBattle",
    name: "終盤アラート",
    enabled: false,
    conditions: {
      startTime: "21:20",
      defenseCountMax: 28,
      attackCountMin: 3
    },
    message: {
      usernameTemplate: "GBM通知",
      mention: { type: "here" },
      titleTemplate: "【GBM】終盤アラート",
      bodyTemplate: "残り{通知時刻}時点の状況です。"
    }
  };
}
