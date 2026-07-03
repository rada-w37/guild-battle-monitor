import {
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  DEFAULT_NOTIFICATION_TITLE_TEMPLATE
} from "./notificationTemplates";
import type {
  NotificationBattleType,
  NotificationRepeatNotification,
  NotificationRule,
  NotificationRuleInput,
  NotificationRuleV2Input
} from "./types";

export const DEFAULT_NOTIFICATION_RULE_V2_NAME = "見落とし防止";
export const DEFAULT_REPEAT_NOTIFICATION_INTERVAL_SECONDS = 300;
export const MIN_REPEAT_NOTIFICATION_INTERVAL_SECONDS = 60;

export type NotificationRuleV2Draft = Omit<NotificationRuleV2Input, "repeatNotification"> & {
  readonly repeatNotification: NotificationRepeatNotification;
};

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
    repeatNotification: createDefaultRepeatNotification(),
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
    repeatNotification: createDefaultRepeatNotification(),
    message: {
      ...rule.message,
      mention: { ...rule.message.mention }
    }
  };
}

export function createDefaultRepeatNotification(): NotificationRepeatNotification {
  return {
    enabled: false,
    intervalSeconds: DEFAULT_REPEAT_NOTIFICATION_INTERVAL_SECONDS
  };
}

export function normalizeRepeatNotification(
  repeatNotification: NotificationRuleV2Input["repeatNotification"] | undefined
): NotificationRepeatNotification {
  if (repeatNotification === undefined) {
    return createDefaultRepeatNotification();
  }

  return {
    enabled: repeatNotification.enabled,
    intervalSeconds: Math.max(MIN_REPEAT_NOTIFICATION_INTERVAL_SECONDS, repeatNotification.intervalSeconds)
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
