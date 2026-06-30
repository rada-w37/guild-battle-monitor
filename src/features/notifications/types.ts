export type NotificationBattleType = "guildBattle" | "grandBattle";

export type NotificationBattleSide = "defense" | "attack";

export type NotificationMentionType = "none" | "here" | "everyone" | "custom";

export type NotificationDetailConditionField = "defenseCount" | "attackCount";
export type NotificationDetailConditionOperator = "<=" | ">=";
export type NotificationDetailConditionGroupOperator = "AND" | "OR";

export interface NotificationDetailCondition {
  readonly type: "condition";
  readonly field: NotificationDetailConditionField;
  readonly operator: NotificationDetailConditionOperator;
  readonly value: number;
}

export interface NotificationDetailConditionGroup {
  readonly type: "group";
  readonly operator: NotificationDetailConditionGroupOperator;
  readonly children: readonly NotificationDetailCondition[];
}

export interface NotificationDetailConditionRoot {
  readonly operator: "OR";
  readonly children: readonly (NotificationDetailCondition | NotificationDetailConditionGroup)[];
}

export interface NotificationRule {
  readonly id: string;
  readonly battleType: NotificationBattleType;
  readonly name: string;
  readonly enabled: boolean;
  readonly conditions: {
    readonly startTime: string;
    readonly defenseCountMax: number | null;
    readonly attackCountMin: number | null;
  };
  readonly message: {
    readonly usernameTemplate: string;
    readonly mention: {
      readonly type: NotificationMentionType;
      readonly customText?: string;
    };
    readonly titleTemplate: string;
    readonly bodyTemplate: string;
  };
  readonly createdByRole?: "guildOwner" | "admin";
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export type NotificationRuleInput = Omit<NotificationRule, "id" | "createdAt" | "createdByRole" | "updatedAt">;

export interface NotificationRuleV2 {
  readonly id: string;
  readonly schemaVersion: 2;
  readonly battleType: NotificationBattleType;
  readonly battleSide: NotificationBattleSide;
  readonly name: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly schedule: {
    readonly startTime: string;
    readonly endTime?: string | null;
  };
  readonly targetGuildIds: readonly string[];
  readonly detailConditions: NotificationDetailConditionRoot;
  readonly message: NotificationRule["message"];
  readonly temporarySuspension?: {
    readonly suspendedAt: string;
    readonly expiresAt: string;
    readonly suspendedBy?: {
      readonly role?: "guildOwner" | "admin";
      readonly uid?: string;
    };
  };
  readonly createdByRole?: "guildOwner" | "admin";
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export type NotificationRuleV2Input = Omit<NotificationRuleV2, "id" | "createdAt" | "createdByRole" | "updatedAt">;

export interface NotificationDestination {
  readonly id: "discord";
  readonly type: "discord_webhook";
  readonly enabled: boolean;
  readonly webhookUrl: string;
  readonly defaultUsernameTemplate?: string;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export type NotificationDestinationInput = Pick<
  NotificationDestination,
  "enabled" | "webhookUrl" | "defaultUsernameTemplate"
>;

export interface NotificationSettings {
  readonly rules: readonly NotificationRule[];
  readonly destination?: NotificationDestination;
}

export interface NotificationSettingsV2 {
  readonly rules: readonly NotificationRuleV2[];
  readonly destination?: NotificationDestination;
}

export type NotificationSettingsRole = "guildOwner" | "admin";
