export type NotificationBattleType = "guildBattle" | "grandBattle";

export type NotificationMentionType = "none" | "here" | "everyone" | "custom";

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

export type NotificationSettingsRole = "guildOwner" | "admin";
