export type NotificationProvider = "discord" | "slack" | "line" | (string & {});
export type NotificationDestinationType = "webhook" | (string & {});

export interface NotificationDestination {
  readonly id: string;
  readonly name: string;
  readonly provider: NotificationProvider;
  readonly type: NotificationDestinationType;
  readonly enabled: boolean;
  readonly selectableMentions: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

export interface NotificationDestinationInput {
  readonly name: string;
  readonly provider: NotificationProvider;
  readonly type: NotificationDestinationType;
  readonly enabled: boolean;
  readonly selectableMentions: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
}

export interface NotificationRule {
  readonly name: string;
  readonly enabled: boolean;
  readonly subject: string;
  readonly body: string;
  readonly conditionGroups: readonly NotificationConditionGroup[];
  readonly destinations: Readonly<Record<string, NotificationRuleDestination>>;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

export interface NotificationConditionGroup {
  readonly id: string;
  readonly operator: "and" | "or";
  readonly isStandalone: boolean;
  readonly conditions: readonly NotificationCondition[];
}

export interface NotificationCondition {
  readonly id: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface NotificationRuleDestination {
  readonly enabled: boolean;
  readonly mention: string;
}
