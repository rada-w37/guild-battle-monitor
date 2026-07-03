import {
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  DEFAULT_NOTIFICATION_TITLE_TEMPLATE
} from "./notificationTemplates";
import type { NotificationBattleType, NotificationRule, NotificationRuleInput, NotificationRuleV2Input } from "./types";

export const DEFAULT_NOTIFICATION_RULE_V2_NAME = "見落とし防止";

export type NotificationRuleV2Draft = NotificationRuleV2Input;

export function createDefaultNotificationRuleV2Draft(
  battleType: NotificationBattleType,
  sortOrder: number
): NotificationRuleV2Draft {
  return {
    schemaVersion: 2,
    battleType,
    battleSide: "defense",
    name: DEFAULT_NOTIFICATION_RULE_V2_NAME,
    enabled: true,
    sortOrder,
    detailRuleEnabled: true,
    schedule: {
      startTime: "21:00",
      endTime: null
    },
    guildFilter: [],
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
    },
    message: {
      usernameTemplate: "",
      mention: { type: "none" },
      titleTemplate: DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_NOTIFICATION_BODY_TEMPLATE
    }
  };
}

export function createNotificationRuleV2DraftFromLegacy(
  rule: NotificationRule,
  sortOrder: number
): NotificationRuleV2Draft {
  const detailChildren = [];
  if (rule.conditions.defenseCountMax !== null) {
    detailChildren.push({
      type: "condition" as const,
      field: "defenseCount" as const,
      operator: "<=" as const,
      value: rule.conditions.defenseCountMax
    });
  }
  if (rule.conditions.attackCountMin !== null) {
    detailChildren.push({
      type: "condition" as const,
      field: "attackCount" as const,
      operator: ">=" as const,
      value: rule.conditions.attackCountMin
    });
  }

  return {
    schemaVersion: 2,
    battleType: rule.battleType,
    battleSide: "defense",
    name: rule.name,
    enabled: rule.enabled,
    sortOrder,
    detailRuleEnabled: true,
    schedule: {
      startTime: rule.conditions.startTime,
      endTime: null
    },
    guildFilter: [],
    detailConditions: {
      operator: "OR",
      children: [
        {
          type: "group",
          operator: "AND",
          children:
            detailChildren.length === 0
              ? [
                  { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
                  { type: "condition", field: "attackCount", operator: ">=", value: 1 }
                ]
              : detailChildren
        }
      ]
    },
    message: {
      ...rule.message,
      mention: { ...rule.message.mention }
    }
  };
}

export function createLegacyNotificationRuleInputFromV2Draft(draft: NotificationRuleV2Draft): NotificationRuleInput {
  const firstGroup = draft.detailConditions.children.find((child) => child.type === "group");
  const conditions = firstGroup?.type === "group" ? firstGroup.children : [];
  const defenseCondition = conditions.find((condition) => condition.field === "defenseCount" && condition.operator === "<=");
  const attackCondition = conditions.find((condition) => condition.field === "attackCount" && condition.operator === ">=");

  return {
    battleType: draft.battleType,
    name: draft.name,
    enabled: draft.enabled,
    conditions: {
      startTime: draft.schedule.startTime,
      defenseCountMax: defenseCondition?.value ?? null,
      attackCountMin: attackCondition?.value ?? null
    },
    message: {
      ...draft.message,
      mention: { ...draft.message.mention }
    }
  };
}
